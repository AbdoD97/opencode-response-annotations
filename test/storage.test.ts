import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, addNote, makeBatch, markSent, editNote, noteContents, LIMITS } from '../src/model.ts'
import { migrateStoredState, rollbackStoredState, readStoredState, mutateStoredState, UNINITIALIZED_STORE } from '../src/storage.ts'
import { revisionID, packRevisions } from '../src/revisions.ts'
import type { Source, State } from '../src/model.ts'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const source = (): Source => ({ sessionID: 'session_a', messageID: 'msg_source', part: 2, text: 'Alpha 👩🏽‍💻 e\u0301 beta', responseParts: [{ part: 0, text: 'Sibling context' }, { part: 2, text: 'Alpha 👩🏽‍💻 e\u0301 beta' }] })
function historical() {
  const state = initialState(), src = source()
  addNote(state, src, 0, 5, 'Previously sent', 'sent_note')
  const sent = makeBatch(state, src.sessionID, 'msg_sent', 123); sent.text = 'Frozen old JSON\n{"legacy":true}'
  markSent(state, sent.id)
  addNote(state, src, 0, 5, 'Prepared\r\ncomment 👩🏽‍💻', 'prepared_note')
  const prepared = makeBatch(state, src.sessionID, 'msg_prepared', 456); prepared.text = 'Uncertain old format\n{"quote":"Alpha","offset":0}'
  addNote(state, src, src.text.length - 4, src.text.length, '', 'later_note')
  return state
}

test('migration deduplicates revisions without changing any frozen or pending content; rollback is lossless', () => {
  const old = historical(), before = JSON.stringify(old), packed = migrateStoredState(old)
  assert.equal(JSON.stringify(old), before)
  assert.equal(packed.version, 2); assert.equal(packed.coordinates, 'utf16-selected-part-v1')
  assert.equal(Object.keys(packed.sources).length, 1)
  assert.deepEqual(clone(rollbackStoredState(packed)), old)
  const state = readStoredState(packed)
  assert.equal(noteContents(state.notes), noteContents(old.notes))
  for (const [index, batch] of old.batches.entries()) {
    assert.deepEqual(clone(state.batches[index]), batch)
    assert.equal(Buffer.compare(Buffer.from(state.batches[index].text), Buffer.from(batch.text)), 0)
  }
  const retry = makeBatch(state, 'session_a', 'replacement', 999)
  assert.equal(retry.id, 'msg_prepared'); assert.equal(retry.created, 456); assert.equal(retry.text, old.batches[1].text)
  assert.throws(() => editNote(state, 'prepared_note', 'unsafe'), /prepared/)
})

test('revision identity preserves session, message, original part, text and differing sibling snapshots', () => {
  const state = initialState(), a = source()
  const variants = [a, { ...a, sessionID: 'other' }, { ...a, messageID: 'msg_other' }, { ...a, part: 3 }, { ...a, text: a.text + '!', responseParts: undefined }, { ...a, responseParts: [{ part: 0, text: 'Changed sibling' }, { part: 2, text: a.text }] }]
  for (const [i, src] of variants.entries()) addNote(state, src, 0, 5, '', `n${i}`)
  const packed = migrateStoredState(state)
  assert.equal(Object.keys(packed.sources).length, variants.length)
  assert.equal(new Set(variants.map(revisionID)).size, variants.length)
  assert.deepEqual(clone(rollbackStoredState(packed)), clone(state))
})

test('corrupt/missing graph data is refused without returning a writable empty state', () => {
  const old = historical(), valid = migrateStoredState(old)
  const corruptions: Array<(state: typeof valid) => void> = [
    s => { delete s.sources[s.notes[0].sourceRevision] },
    s => { s.sources[s.notes[0].sourceRevision].text += 'tampered' },
    s => { s.notes[0].quote = 'Wrong' },
    s => { s.notes[0].start = 1 },
    s => { s.next.session_a = 1 },
    s => { s.notes.push(clone(s.notes[0])) },
    s => { s.batches[1].notes[0].comment = 'conflicting copy' },
    s => { s.batches[1].sessionID = 'foreign' },
    s => { s.notes = s.notes.filter(n => n.id !== 'prepared_note') },
    s => { s.sources[revisionID({ ...source(), messageID: 'orphan' })] = { ...source(), messageID: 'orphan' } },
    s => { (s as unknown as { coordinates: string }).coordinates = 'byte-offsets' },
  ]
  for (const corrupt of corruptions) {
    const state = clone(valid); corrupt(state); const before = JSON.stringify(state)
    assert.throws(() => readStoredState(state), /recovery/)
    assert.throws(() => mutateStoredState(state, () => assert.fail('must not mutate')), /recovery/)
    assert.equal(JSON.stringify(state), before)
  }
  for (const state of [null, {}, UNINITIALIZED_STORE, { ...old, futureField: true }]) assert.throws(() => readStoredState(state), /recovery/)
})

for (const format of [1, 2] as const) {
  for (const conflict of ['sent-pending', 'two-sent-batches', 'prepared-and-sent-batches'] as const) {
    test(`v${format} refuses ambiguous ${conflict} ownership without mutating input`, () => {
      const old = historical()
      if (conflict === 'sent-pending') old.notes.push(clone(old.batches[0].notes[0]))
      else {
        const duplicate = clone(old.batches[conflict === 'two-sent-batches' ? 0 : 1])
        duplicate.id = 'msg_duplicate_owner'; duplicate.status = 'sent'
        old.batches.push(duplicate)
      }
      const raw = format === 1 ? old : packRevisions(old), before = JSON.stringify(raw)
      const reason = conflict === 'sent-pending' ? /sent note remains in pending/ : /multiple batches/
      assert.throws(() => readStoredState(raw), reason)
      assert.throws(() => mutateStoredState(raw, () => assert.fail('must not mutate ambiguous state')), reason)
      assert.throws(() => migrateStoredState(raw), reason)
      assert.throws(() => rollbackStoredState(raw), reason)
      assert.equal(JSON.stringify(raw), before)
    })
  }
}

test('UTF-16 source coordinates validate exact quotes and refuse split graphemes', () => {
  const state = initialState(), src = source(), start = src.text.indexOf('👩')
  addNote(state, src, start, start + '👩🏽‍💻'.length, '', 'unicode')
  const packed = migrateStoredState(state); assert.equal(readStoredState(packed).notes[0].quote, '👩🏽‍💻')
  packed.notes[0].end = start + 2; packed.notes[0].quote = src.text.slice(start, start + 2)
  assert.throws(() => readStoredState(packed), /quote\/range/)
})

test('normalized transactions reload fresh logical contents and preserve later notes on sent transition', () => {
  const packed = migrateStoredState(historical())
  const prior = packed.batches[1].text
  mutateStoredState(packed, state => addNote(state, source(), 0, 5, 'Another window', 'concurrent_note'))
  mutateStoredState(packed, state => markSent(state, 'msg_prepared'))
  const result = readStoredState(packed)
  assert.deepEqual(result.notes.map(n => n.id), ['later_note', 'concurrent_note'])
  assert.equal(result.batches[1].text, prior)
  const before = JSON.stringify(packed)
  assert.throws(() => mutateStoredState(packed, state => { state.notes[0].comment = 'unsaved'; throw new Error('disk failure fixture') }), /disk failure/)
  assert.equal(JSON.stringify(packed), before)
})

test('canonical confirmation contents are independent of object property order and storage representation', () => {
  const old = historical(), roundTrip = readStoredState(migrateStoredState(old))
  assert.equal(noteContents(old.notes), noteContents(roundTrip.notes))
  const reordered = clone(old.notes)
  reordered[0].source.responseParts = reordered[0].source.responseParts!.map(p => ({ text: p.text, part: p.part }))
  assert.equal(noteContents(reordered), noteContents(old.notes))
  reordered[0].comment += '!'; assert.notEqual(noteContents(reordered), noteContents(old.notes))
})

test('oversized legacy prepared bytes remain preserved through migration and refused on send', () => {
  const old = historical(); old.batches[1].text = 'x'.repeat(LIMITS.payloadBytes + 1)
  const packed = migrateStoredState(old), state = readStoredState(packed), before = JSON.stringify(packed)
  assert.equal(state.batches[1].text, old.batches[1].text)
  assert.throws(() => makeBatch(state, 'session_a', 'new_id', 999), /preserved/)
  assert.equal(JSON.stringify(packed), before)
})

test('normalized storage admits 100 notes on one large immutable revision; rollback never trims to old cap', () => {
  const src: Source = { sessionID: 'a', messageID: 'm', part: 0, text: 'Alpha' + 'x'.repeat(99_995) }
  const old = initialState(); addNote(old, src, 0, 5, '', 'n0')
  const packed = migrateStoredState(old)
  for (let i = 1; i < 100; i++) mutateStoredState(packed, state => addNote(state, src, 0, 5, '', `n${i}`))
  assert.equal(Object.keys(packed.sources).length, 1)
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) < 150_000)
  const restored = rollbackStoredState(packed)
  assert.equal(restored.notes.length, 100); assert.ok(Buffer.byteLength(JSON.stringify(restored)) > LIMITS.storageBytes)
  assert.equal(readStoredState(restored).notes.length, 100)
})
