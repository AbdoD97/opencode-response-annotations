import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, addNote, makeBatch } from '../src/model.ts'
import { batchPresenter, type BodyInput } from '../src/presentation.ts'
import { batchPrompt } from '../src/submission.ts'

function fixture() {
  const state = initialState()
  const text = '👨‍👩‍👧 é\r\n```text\nquote```'
  addNote(state, { sessionID: 's', messageID: 'reply', part: 0, text }, 0, text.length, 'Exact\r\ncomment\u202e', 'n1')
  addNote(state, { sessionID: 's', messageID: 'reply2', part: 0, text: 'Highlight' }, 0, 9, '', 'n2')
  const batch = makeBatch(state, 's', 'msg_batch', 1)
  const input: BodyInput = { source: { sessionID: 's', messageID: batch.id, revision: 1 }, text: batch.text, metadata: { annotationBatch: batch.id } }
  return { batch, input, present: batchPresenter([batch]) }
}
test('individual notes derive exact canonical quote/comment ranges with zero envelope changes', () => {
  const { batch, input, present } = fixture()
  const before = JSON.stringify(batchPrompt(batch))
  const result = present(input)!
  assert.equal(result.items.length, 2)
  for (const [index, item] of result.items.entries()) {
    assert.equal(input.text.slice(item.preview.start, item.preview.end), batch.notes[index].quote)
    if (batch.notes[index].comment) assert.equal(input.text.slice(item.sections[1].range.start, item.sections[1].range.end), batch.notes[index].comment)
  }
  assert.equal(JSON.stringify(batchPrompt(batch)), before)
  assert.equal(result.source, input.source)
})
test('no recognition by headings, missing store or wrong metadata/session/message/text', () => {
  const { input, present } = fixture()
  assert.equal(batchPresenter([])(input), undefined)
  for (const altered of [{ ...input, metadata: {} }, { ...input, source: { ...input.source, sessionID: 'other' } }, { ...input, source: { ...input.source, messageID: 'other' } }, { ...input, text: input.text + '\n' }, { ...input, text: input.text.replaceAll('\r\n', '\n') }]) assert.equal(present(altered), undefined)
})
test('prepared/sent snapshots restart losslessly; unknown historical formatter falls back', () => {
  const { batch, input } = fixture()
  for (const status of ['prepared', 'sent'] as const) {
    const restored = JSON.parse(JSON.stringify({ ...batch, status }))
    assert.equal(batchPresenter([restored])(input)?.items.length, 2)
  }
  const old = { ...batch, text: '{old frozen payload}' }
  assert.equal(batchPresenter([old])({ ...input, text: old.text }), undefined)
  assert.equal(old.text, '{old frozen payload}')
})
