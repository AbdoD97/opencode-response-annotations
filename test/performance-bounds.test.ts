import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, addNote, makeBatch, isBoundary, boundaries, LIMITS } from '../src/model.ts'
import { resolveSelection } from '../src/selection.ts'
import type { MarkdownNode, SelectionNode } from '../src/selection.ts'
const source = (text = 'alpha') => ({sessionID:'s',messageID:'m',part:0,text})

test('boundary lookup agrees with full segmentation including CRLF, combining and ZWJ',()=>{
  for(const text of ['abc','a\r\nb','é👨‍👩‍👧🇺🇸x','\ud83d\ude00','\u0600a']) {
    const expected=boundaries(text)
    for(let i=-1;i<=text.length+1;i++)assert.equal(isBoundary(text,i),expected.includes(i),`${JSON.stringify(text)} at ${i}`)
  }
})
test('source/comment/pending limits refuse without changing saved notes or numbers',()=>{
  const s=initialState();addNote(s,source(),0,5,'','first')
  for(const [src,comment] of [[source('a'.repeat(LIMITS.sourceChars+1)), ''],[source(),'c'.repeat(LIMITS.commentChars+1)]] as const){
    const before=JSON.stringify(s);assert.throws(()=>addNote(s,src,0,1,comment,'next'));assert.equal(JSON.stringify(s),before)
  }
  while(s.notes.length<LIMITS.pendingNotes)addNote(s,source(),0,5,'',`n${s.notes.length}`)
  const before=JSON.stringify(s);assert.throws(()=>addNote(s,source(),0,1,'','overflow'),/limit/);assert.equal(JSON.stringify(s),before)
})
test('oversize payload and legacy prepared batch remain intact and unsent',()=>{
  const s=initialState()
  for(let i=0;i<11;i++)addNote(s,{...source('a'.repeat(99998)+String(i).padStart(2,'0')),messageID:`m${i}`},0,100000,'',`n${i}`)
  const before=JSON.stringify(s);assert.throws(()=>makeBatch(s,'s','b',1),/1 MB/);assert.equal(JSON.stringify(s),before)
  s.batches.push({id:'legacy',sessionID:'s',notes:[],text:'a'.repeat(LIMITS.payloadBytes+1),status:'prepared',created:1})
  const legacy=JSON.stringify(s);assert.throws(()=>makeBatch(s,'s','retry',1),/preserved/);assert.equal(JSON.stringify(s),legacy)
})
test('storage growth refuses new notes without pruning sent history',()=>{
  const s=initialState();s.batches.push({id:'legacy',sessionID:'s',notes:[],text:'a'.repeat(LIMITS.storageBytes),status:'sent',created:1})
  const before=JSON.stringify(s);assert.throws(()=>addNote(s,source(),0,1,'','new'),/8 MB/);assert.equal(JSON.stringify(s),before)
})
test('cycle, oversized source/history/renderable lists are bounded refusals',()=>{
  const row={id:'m',parent:null};const node={id:'md',parent:{id:'wrapper',parent:row},content:'alpha',streaming:false}
  const input={version:'2.0.32',sessionID:'s',reverted:false,messages:[{id:'m',type:'assistant',time:{completed:1},content:[{type:'text',text:'alpha'}]}],selection:{isDragging:false,selectedRenderables:[node] as SelectionNode[],getSelectedText:()=> 'alpha'},isMarkdown:(n:SelectionNode):n is MarkdownNode=>n===node}
  const cycle:{id:string;parent:SelectionNode|null}={id:'cycle',parent:null};cycle.parent=cycle;input.selection.selectedRenderables=[cycle]
  assert.throws(()=>resolveSelection(input),/deep or cyclic/)
  input.selection.selectedRenderables=Array(LIMITS.selectedNodes+1).fill(node);assert.throws(()=>resolveSelection(input),/too large/)
  input.selection.selectedRenderables=[node];node.content='a'.repeat(LIMITS.sourceChars+1);assert.throws(()=>resolveSelection(input),/too large/)
  node.content='alpha';input.messages=Array(LIMITS.historyMessages+1).fill(input.messages[0]);assert.throws(()=>resolveSelection(input),/history is too large/)
})
