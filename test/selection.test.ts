import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSelection, validateCapture } from '../src/selection.ts'
import type { MarkdownNode, SelectionNode, MessageSnapshot } from '../src/selection.ts'

function fixture(text = '  alpha beta gamma  ', quote = 'beta') {
  const row = { id: 'msg_a', parent: null }
  const wrapper = { id: 'wrapper', parent: row }
  const node: { id: string; parent: SelectionNode; content: string; streaming: boolean; isDestroyed: boolean } = { id: 'markdown', parent: wrapper, content: text.trim(), streaming: false, isDestroyed: false }
  const leaf = { id: 'markdown-text-block', parent: node }
  const messages: MessageSnapshot[] = [{ id: 'msg_a', type: 'assistant', time: {completed: 1}, content: [{type: 'text', text}] }]
  const input = { version: '2.0.32', sessionID: 'session-a', reverted: false, messages,
    selection: { isDragging: false, selectedRenderables: [leaf] as SelectionNode[], getSelectedText: () => quote },
    isMarkdown: (item: SelectionNode): item is MarkdownNode => item === node }
  return { row, wrapper, node, leaf, messages, input }
}
test('native selection resolves a unique completed original snapshot with exact whitespace offsets', () => {
  const f = fixture(); const c = resolveSelection(f.input)
  assert.equal(c.source.messageID, 'msg_a'); assert.equal(c.start, 8); assert.equal(c.end, 12); assert.equal(c.quote, 'beta')
  assert.equal(c.source.text, '  alpha beta gamma  ')
  f.row.id = 'session-part:msg_a:text:0'; assert.equal(resolveSelection(f.input).start, 8)
})
test('rejects duplicate full snapshots even when row identity could disambiguate', () => {
  const f = fixture(); f.messages.push({...f.messages[0],id:'msg_b'})
  assert.throws(() => resolveSelection(f.input), /ambiguous/)
})
test('rejects repeated quote, rendered formatting mismatch, partial grapheme and whitespace only', () => {
  for (const [text, quote] of [['same same','same'],['**bold** word','bold word'],['é end','e'],['abc',' ']]) {
    assert.throws(() => resolveSelection(fixture(text,quote).input))
  }
})
test('rejects tool/plugin/compaction and unknown provenance even with identical assistant text', () => {
  const f = fixture(); f.row.id='tool-output'; assert.throws(()=>resolveSelection(f.input),/recognized/)
  f.row.id='msg_a'; f.node.parent={id:'extra-tool-wrapper',parent:f.wrapper}; assert.throws(()=>resolveSelection(f.input),/recognized/)
})
test('rejects cross-message selection and non-Markdown leaf', () => {
  const f = fixture(); f.input.selection.selectedRenderables.push({id:'other',parent:null})
  assert.throws(()=>resolveSelection(f.input),/one assistant/)
})
test('rejects streaming, reverts, unknown host, destroyed source and missing exact snapshot', () => {
  const f=fixture(); f.node.streaming=true;assert.throws(()=>resolveSelection(f.input),/finish/)
  f.node.streaming=false;f.input.reverted=true;assert.throws(()=>resolveSelection(f.input),/revert/)
  f.input.reverted=false;f.input.version='2.0.33';assert.throws(()=>resolveSelection(f.input),/2.0.32/)
  f.input.version='2.0.32';f.node.isDestroyed=true;assert.throws(()=>resolveSelection(f.input),/finish/)
  f.node.isDestroyed=false;f.messages[0].time={};assert.throws(()=>resolveSelection(f.input),/ambiguous/)
})
test('captured source validation detects text/sibling drift and moved source node', () => {
  const f=fixture();const c=resolveSelection(f.input)
  f.messages[0].content=[{type:'text',text:'changed'}];assert.throws(()=>validateCapture(c,f.input))
  f.messages[0].content=[{type:'text',text:c.source.text},{type:'text',text:'new sibling'}];assert.throws(()=>validateCapture(c,f.input),/changed/)
  f.messages[0].content=[{type:'text',text:c.source.text}]; f.node.parent={id:'wrapper',parent:{id:'msg_a',parent:null}}
  assert.throws(()=>validateCapture(c,f.input),/changed/)
})
test('capture survives native selection clearing but not later source streaming or revert', () => {
  const f=fixture();const c=resolveSelection(f.input)
  f.input.selection.selectedRenderables=[];validateCapture(c,f.input)
  f.node.streaming=true;assert.throws(()=>validateCapture(c,f.input))
  f.node.streaming=false;f.input.reverted=true;assert.throws(()=>validateCapture(c,f.input))
})
