/** Pure-local synthetic benchmark. No host/model/network calls. Run: node script/benchmark-annotations.ts */
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import { resolveSelection, validateCapture } from '../src/selection.ts'
import type { MarkdownNode, SelectionNode, MessageSnapshot } from '../src/selection.ts'
import { initialState, addNote, makeBatch, markSent } from '../src/model.ts'

const results: unknown[] = []
function bench(name: string, fn: () => unknown, iterations = 30, warmups = 5) {
  for (let i = 0; i < warmups; i++) fn()
  const times: number[] = []
  for (let i = 0; i < iterations; i++) { const start = performance.now(); fn(); times.push(performance.now() - start) }
  times.sort((a,b) => a-b)
  results.push({ name, iterations, warmups, medianMs: +times[Math.floor(times.length/2)].toFixed(4), p95Ms: +times[Math.min(times.length-1, Math.floor(times.length*.95))].toFixed(4) })
}
function fixture(chars: number, count: number, repeated = false) {
  const quote = 'UNIQUE_SELECTED_PASSAGE'
  const text = 'a'.repeat(Math.max(0, chars - quote.length - 1)) + ' ' + quote + (repeated ? quote : '')
  const row = { id: 'msg_target', parent: null }
  const wrapper = { id: 'wrapper', parent: row }
  const node = { id: 'markdown', parent: wrapper, content: text, streaming: false }
  const leaf = { id: 'text-block', parent: node }
  const messages: MessageSnapshot[] = Array.from({length:count-1}, (_,i) => ({id: `msg_${i}`,type:'assistant',time:{completed:1},content:[{type:'text',text:`History ${i} ` + 'b'.repeat(1000)}]}))
  messages.push({id:row.id,type:'assistant',time:{completed:1},content:[{type:'text',text}]})
  return { version:'2.0.32',sessionID:'session',reverted:false,messages,
    selection:{isDragging:false, selectedRenderables:[leaf],getSelectedText:()=>quote},
    isMarkdown:(n:SelectionNode):n is MarkdownNode => n===node }
}
for (const [chars,history] of [[1000,100],[10000,1000],[100000,1000],[100000,10000],[500000,10000]]) {
  const input = fixture(chars,history)
  let capture: ReturnType<typeof resolveSelection> | undefined
  let error: string | undefined
  try { capture = resolveSelection(input) } catch(e) { error=String(e) }
  bench(`resolve ${chars} chars / ${history} messages${error?' (refusal)':''}`,()=>{ try { return resolveSelection(input) } catch {} },chars>=100000?10:30)
  if(capture) bench(`validate ${chars} chars / ${history} messages`,()=>validateCapture(capture!,input),chars>=100000?10:30)
  if(error) results.push({name:`refusal ${chars}/${history}`,error})
}
const unicode=fixture(1000,1000); unicode.messages.at(-1)!.content![0].text='é👨‍👩‍👧'.repeat(5000)+' UNIQUE_SELECTED_PASSAGE'; (unicode.selection.selectedRenderables[0].parent as {content:string}).content=unicode.messages.at(-1)!.content![0].text!
bench('resolve unicode 50K UTF16 / 1K history',()=>resolveSelection(unicode))
const manyLeaves=fixture(10000,1000);manyLeaves.selection.selectedRenderables=Array(1000).fill(manyLeaves.selection.selectedRenderables[0]);bench('resolve 1K selected renderables / 1K history',()=>resolveSelection(manyLeaves))
const repeated=fixture(90000,1000,true)
bench('reject repeated quote 90K / 1K history',()=>{try{resolveSelection(repeated)}catch{}})
const dragging=fixture(1000,1000);dragging.selection.isDragging=true
bench('drag event fast rejection',()=>{try{resolveSelection(dragging)}catch{}},1000,100)
for(const count of [1,10,100]) {
  const state=initialState();const text='alpha '+ 'b'.repeat(9994)
  const source={sessionID:'session',messageID:'msg_source',part:0,text,responseParts:[{part:0,text}]}
  let error: string | undefined
  for(let i=0;i<count;i++){try{addNote(state,source,0,5,'Note comment',`note-${i}`)}catch(e){error=String(e);break}}
  bench(`add note with ${state.notes.length} existing${state.notes.length >= 100 ? " (refusal)" : ""}`,()=>{ const draft={...state,next:{...state.next},notes:[...state.notes],batches:[...state.batches]}; try{addNote(draft,source,0,5,'Extra','extra')}catch{} })
  bench(`prepare batch ${state.notes.length} notes`,()=>{const draft={...state,batches:[...state.batches]};try{makeBatch(draft,'session','bench',1)}catch{}})
  const before=Buffer.byteLength(JSON.stringify(state))
  let batch: ReturnType<typeof makeBatch> | undefined
  try { batch=makeBatch(state,'session','msg_batch',1) } catch(e){error=String(e)}
  const prepared=Buffer.byteLength(JSON.stringify(state))
  if(batch)markSent(state,batch.id)
  results.push({name:`storage ${count} notes / shared 10K source`,acceptedNotes:batch?.notes.length??state.notes.length,pendingBytes:before,preparedBytes:prepared,sentBytes:Buffer.byteLength(JSON.stringify(state)),payloadBytes:batch?Buffer.byteLength(batch.text):null,error})
  bench(`serialize persisted ${count} notes`,()=>JSON.stringify(state))
}
console.log(JSON.stringify({environment:{node:process.version,bun:process.versions.bun,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},results},null,2))
