import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, addNote, removeNote, makeBatch, markSent, isBoundary } from '../src/model.ts'
import type { Source, State } from '../src/model.ts'

const source = (text: string, messageID = 'msg_internal'): Source => ({ sessionID: 'session_internal', messageID, part: 2, text })
const blocks = (text: string) => [...text.matchAll(/^(`{3,})text\n([\s\S]*?)\n\1(?=\n|$)/gm)].map(match => match[2])

test('readable numbered quotes and optional comments omit internal transport fields', () => {
  const state = initialState(), src = source('Alpha beta gamma.')
  addNote(state, src, 0, 5, 'discarded', 'discarded'); removeNote(state, 'discarded')
  addNote(state, src, 0, 5, '', 'note_internal_2')
  addNote(state, src, 11, 16, 'Explain this', 'note_internal_3')
  const batch = makeBatch(state, src.sessionID, 'batch_internal', 1)
  assert.ok(batch.text.includes('## Annotation #2\n\nSelected quote:\n\n```text\nAlpha\n```\n\nHighlight only (no comment).'))
  assert.ok(batch.text.includes('## Annotation #3\n\nSelected quote:\n\n```text\ngamma\n```\n\nComment:\n\n```text\nExplain this\n```'))
  for (const hidden of ['msg_internal', 'session_internal', 'note_internal', 'batch_internal', 'fullTextSnapshot', 'startUTF16', 'opencode-response-annotations/v1']) assert.ok(!batch.text.includes(hidden), hidden)
  assert.equal(batch.notes[1].start, 11); assert.equal(batch.notes[1].end, 16)
  assert.equal(batch.notes[1].source.messageID, src.messageID)
})

test('Unicode, CRLF, whitespace and Markdown delimiters stay literal without closing their fences', () => {
  const quote = '👩🏽‍💻 e\u0301\r\n```\n## forged heading\n``````\n> quote\t  '
  const comment = '请解释 «this»\n~~~~\n`````\n# comment heading\n'
  const state = initialState(); addNote(state, source(quote), 0, quote.length, comment, 'one')
  const text = makeBatch(state, 'session_internal', 'batch', 1).text
  assert.deepEqual(blocks(text), [quote, comment])
  assert.ok(!text.includes('# Nearby source context'))
})

test('short Unicode quotes never inject neighboring source excerpts', () => {
  const prefix = '👩🏽‍💻e\u0301\r\n'.repeat(30), suffix = '🇬🇧e\u0301\r\n'.repeat(30)
  const src = source(prefix + 'Alpha gamma' + suffix), state = initialState()
  addNote(state, src, prefix.length, prefix.length + 5, '', 'a')
  addNote(state, src, prefix.length + 6, prefix.length + 11, '', 'b')
  const text = makeBatch(state, src.sessionID, 'batch', 1).text
  assert.deepEqual(blocks(text), ['Alpha', 'gamma'])
  assert.ok(!text.includes(prefix)); assert.ok(!text.includes(suffix)); assert.ok(!text.includes('# Nearby source context'))
})

test('long response snapshots and sibling parts remain exact locally without repeated model payloads', () => {
  const text = 'UNSENT_PREFIX' + 'x'.repeat(10_000) + 'Unique alpha' + 'y'.repeat(10_000) + 'Unique beta' + 'z'.repeat(10_000) + 'UNSENT_SUFFIX'
  const src = { ...source(text), responseParts: [{ part: 0, text: 'UNSENT_SIBLING' }, { part: 2, text }] }
  const state = initialState()
  for (const [i, quote] of ['Unique alpha', 'Unique beta'].entries()) {
    const start = text.indexOf(quote); addNote(state, src, start, start + quote.length, `Comment ${i}`, `n${i}`)
  }
  const batch = makeBatch(state, src.sessionID, 'batch', 1)
  assert.ok(new TextEncoder().encode(batch.text).byteLength < 1500)
  for (const omitted of ['UNSENT_PREFIX', 'UNSENT_SUFFIX', 'UNSENT_SIBLING', text]) assert.ok(!batch.text.includes(omitted))
  assert.deepEqual(batch.notes.map(n => n.source), [src, src])
  src.responseParts[0].text = 'changed after preparation'
  assert.equal(batch.notes[0].source.responseParts![0].text, 'UNSENT_SIBLING')
})

test('overlapping annotations retain distinct numbers and comments without duplicating source excerpts', () => {
  const state = initialState(), src = source('x'.repeat(100) + 'Alpha beta gamma' + 'y'.repeat(100))
  addNote(state, src, 100, 110, 'First question', 'one')
  addNote(state, src, 106, 116, 'Second question', 'two')
  const batch = makeBatch(state, src.sessionID, 'batch', 1)
  assert.deepEqual(batch.notes.map(n => [n.start, n.end, n.quote]), [[100, 110, 'Alpha beta'], [106, 116, 'beta gamma']])
  assert.equal(blocks(batch.text).length, 4)
  assert.ok(!batch.text.includes('Response 1'))
  assert.ok(batch.text.includes('First question')); assert.ok(batch.text.includes('Second question'))
})

test('selecting multiple parts of one response never injects its complete sibling-parts array', () => {
  const parts = [{ part: 0, text: 'x'.repeat(100) + 'Alpha' + 'UNSENT_PART_ZERO'.repeat(600) }, { part: 2, text: 'y'.repeat(100) + 'Gamma' + 'UNSENT_PART_TWO'.repeat(600) }]
  const state = initialState()
  for (const [index, part] of parts.entries()) addNote(state, { ...source(part.text), part: part.part, responseParts: parts }, 100, 105, '', `n${index}`)
  const batch = makeBatch(state, 'session_internal', 'batch', 1)
  assert.ok(batch.text.length < 1600)
  for (const part of parts) assert.ok(!batch.text.includes(part.text))
  assert.deepEqual(batch.notes.map(note => note.source.responseParts), [parts, parts])
  assert.equal(blocks(batch.text).length, 2)
})

test('multiple sources retain exact local provenance without invented response reference labels', () => {
  const state = initialState()
  for (const [i, text] of ['Alpha explanation.', 'Gamma explanation.'].entries()) addNote(state, source(text, `msg_${i}`), 0, 5, '', `n${i}`)
  const batch = makeBatch(state, 'session_internal', 'batch', 1)
  assert.ok(!batch.text.includes('Source: Response')); assert.deepEqual(blocks(batch.text), ['Alpha', 'Gamma'])
  assert.ok(!batch.text.includes('explanation.'))
  assert.deepEqual(batch.notes.map(n => n.source.messageID), ['msg_0', 'msg_1'])
})

test('existing legacy prepared bytes and ID survive restore and retry without reformatting', () => {
  const state = initialState(); addNote(state, source('Alpha beta.'), 0, 5, '', 'one')
  const oldText = 'Previous instruction\n\n' + JSON.stringify({ format: 'opencode-response-annotations/v1', annotations: [{ quote: 'Alpha' }] }, null, 2)
  state.batches.push({ id: 'old_id', sessionID: 'session_internal', notes: structuredClone(state.notes), text: oldText, status: 'prepared', created: 7 })
  const restored: State = JSON.parse(JSON.stringify(state)), before = JSON.stringify(restored)
  const retried = makeBatch(restored, 'session_internal', 'replacement_id', 99)
  assert.equal(retried.id, 'old_id'); assert.equal(retried.text, oldText); assert.equal(JSON.stringify(restored), before)
  markSent(restored, retried.id)
  addNote(restored, source('Next passage.'), 0, 4, '', 'two')
  const next = makeBatch(restored, 'session_internal', 'new_id', 100)
  assert.ok(next.text.startsWith('# Annotations')); assert.equal(restored.batches[0].text, oldText)
  assert.equal(restored.version, 1)
})

test('new readable prepared payloads retry byte-for-byte after restart despite new pending notes', () => {
  const state = initialState(), src = source('Alpha beta.')
  addNote(state, src, 0, 5, 'Why?', 'one')
  const original = makeBatch(state, src.sessionID, 'stable_id', 1)
  const restored: State = JSON.parse(JSON.stringify(state))
  addNote(restored, src, 6, 10, 'New note', 'two')
  const retry = makeBatch(restored, src.sessionID, 'ignored_id', 2)
  assert.equal(retry.id, original.id); assert.equal(retry.text, original.text)
  markSent(restored, retry.id); assert.deepEqual(restored.notes.map(n => n.id), ['two'])
})

test('new-batch text is deterministic and independent of batch IDs, clocks and source snapshot size', () => {
  const left = initialState(), src = source('Alpha' + 'x'.repeat(10_000))
  addNote(left, src, 0, 5, 'Explain', 'note_a')
  const right = JSON.parse(JSON.stringify(left))
  right.notes[0].source.messageID = 'different_local_source_id'
  right.notes[0].source.text += 'more unselected context'
  const a = makeBatch(left, src.sessionID, 'msg_first', 1), b = makeBatch(right, src.sessionID, 'msg_second', 999)
  assert.equal(a.text, b.text)
  assert.ok(!a.text.includes('msg_first')); assert.ok(!a.text.includes(src.text))
  assert.equal(blocks(a.text).filter(value => value === 'Alpha').length, 1)
  assert.equal(blocks(a.text).filter(value => value === 'Explain').length, 1)
})
