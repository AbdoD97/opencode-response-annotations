import { test, expect } from 'bun:test'
import { testRender } from '@opentui/solid'
import { createStore, produce } from 'solid-js/store'
import type { Context, PanelInput } from '@opencode/plugin/tui/context'
import { AnnotationPanel } from '../src/tui.tsx'
import { initialState, addNote, editNote } from '../src/model.ts'

const deferred = <T,>() => { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve} }
async function harness() {
  const [state,setState]=createStore(initialState())
  const [panel,setPanel]=createStore({name:'response-annotations.review',sessionID:'a',width:60,presentation:'panel',focused:true,focus:()=>{},close:()=>{},toggleFullscreen:()=>{}} as { -readonly [K in keyof PanelInput]: PanelInput[K] })
  let commands: Array<{bind?:string;run:()=>unknown}>=[]
  const controls={ confirm: async()=>true, comment: async()=>'', reverted:false, confirms:0, failUpdates:0, failMarkSent:false, source:'alpha beta\n👨‍👩‍👧 é end', calls:[] as Array<{sessionID:string,id:string,text:string}>, errors:[] as string[] }
  const context={
    theme:{text:{base:'#ffffff',muted:'#aaaaaa'}},
    keymap:{layer:(factory:()=>{commands:typeof commands})=>{commands=factory().commands}},
    data:{session:{get:()=>({revert:controls.reverted?{}:undefined}),message:{sync:async()=>{},list:()=>[
      {id:'msg_source',type:'assistant',time:{completed:1},content:[{type:'text',text:controls.source}]},
      {id:'msg_streaming',type:'assistant',time:{},content:[{type:'text',text:'incomplete'}]},
    ]}}},
    ui:{toast:{show:(x:{message:string})=>controls.errors.push(x.message)},dialog:{select:async(o:{options:Array<{value:unknown}>})=>o.options[0].value,prompt:()=>controls.comment(),confirm:()=>{controls.confirms++;return controls.confirm()}}},
    client:{session:{prompt:async(input:typeof controls.calls[number])=>{controls.calls.push(input);if(controls.failMarkSent)controls.failUpdates++;return {id:input.id}}}},
  } as unknown as Context
  const update=async(fn:Parameters<typeof produce<typeof state>>[0])=>{if(controls.failUpdates>0){controls.failUpdates--;throw new Error('durable store unavailable')}setState(produce(fn))}
  const screen=await testRender(()=> <AnnotationPanel context={context} panel={panel} state={state} update={update}/>,{width:60,height:30})
  async function key(bind:string){const cmd=commands.find(c=>c.bind===bind);if(!cmd)throw new Error(bind);cmd.run();await screen.flush()}
  async function seed(){await key('r');await screen.waitForFrame(f=>f.includes('alpha beta'));for(let i=0;i<5;i++)await key('shift+right');await key('a');await screen.waitFor(()=>state.notes.length===1)}
  return {state,setState,panel,setPanel,screen,controls,key,seed}
}

test('review: repeated send during confirmation admits only one batch',async()=>{
  const h=await harness();try{await h.seed();const gate=deferred<boolean>();h.controls.confirm=()=>gate.promise;await h.key('ctrl+s');await h.key('ctrl+s');expect(h.controls.confirms).toBe(1);gate.resolve(true);await h.screen.waitFor(()=>h.state.batches[0]?.status==='sent');expect(h.controls.calls.length).toBe(1)}finally{h.screen.renderer.destroy()}
})
test('review: session switch during confirmation cancels stale send',async()=>{
  const h=await harness();try{await h.seed();const gate=deferred<boolean>();h.controls.confirm=()=>gate.promise;await h.key('ctrl+s');h.setPanel('sessionID','b');await h.screen.flush();gate.resolve(true);await h.screen.flush();expect(h.controls.calls.length).toBe(0);expect(h.state.notes[0].source.sessionID).toBe('a');expect(h.state.batches.length).toBe(0)}finally{h.screen.renderer.destroy()}
})
test('review: session switch during comment prevents cross-session save',async()=>{
  const h=await harness();try{await h.key('r');await h.screen.waitForFrame(f=>f.includes('alpha beta'));await h.key('shift+right');const gate=deferred<string>();h.controls.comment=()=>gate.promise;await h.key('n');h.setPanel('sessionID','b');await h.screen.flush();gate.resolve('stale comment');await h.screen.flush();expect(h.state.notes.length).toBe(0);await h.key('a');await h.screen.waitFor(()=>h.controls.errors.includes('Choose a response first'))}finally{h.screen.renderer.destroy()}
})
test('review: concurrent note edit invalidates confirmation',async()=>{
  const h=await harness();try{await h.seed();const gate=deferred<boolean>();h.controls.confirm=()=>gate.promise;await h.key('ctrl+s');h.setState(produce(s=>editNote(s,s.notes[0].id,'changed elsewhere')));gate.resolve(true);await h.screen.waitFor(()=>h.controls.errors.some(x=>x.includes('changed during confirmation')));expect(h.controls.calls.length).toBe(0);expect(h.state.batches.length).toBe(0)}finally{h.screen.renderer.destroy()}
})
test('review: new revert during confirmation blocks prompt',async()=>{
  const h=await harness();try{await h.seed();const gate=deferred<boolean>();h.controls.confirm=()=>gate.promise;await h.key('ctrl+s');h.controls.reverted=true;gate.resolve(true);await h.screen.waitFor(()=>h.controls.errors.some(x=>x.includes('revert changed')));expect(h.controls.calls.length).toBe(0)}finally{h.screen.renderer.destroy()}
})
test('review: selected source retains original snapshot after source drift',async()=>{
  const h=await harness();try{await h.seed();h.controls.source='replaced response';await h.key('ctrl+s');await h.screen.waitFor(()=>h.controls.calls.length===1);expect(h.controls.calls[0].text).toContain('alpha beta');expect(h.controls.calls[0].text).not.toContain('replaced response');expect(h.controls.calls[0].text).not.toContain('incomplete')}finally{h.screen.renderer.destroy()}
})

test('review: failed prepared-state persistence never calls model',async()=>{
  const h=await harness();try{await h.seed();h.controls.failUpdates=1;await h.key('ctrl+s');await h.screen.waitFor(()=>h.controls.errors.includes('durable store unavailable'));expect(h.controls.calls.length).toBe(0);expect(h.state.notes.length).toBe(1);expect(h.state.batches.length).toBe(0)}finally{h.screen.renderer.destroy()}
})
test('review: accepted prompt with failed sent persistence retries identical ID and text',async()=>{
  const h=await harness();try{await h.seed();h.controls.failMarkSent=true;await h.key('ctrl+s');await h.screen.waitFor(()=>h.controls.errors.includes('durable store unavailable'));expect(h.controls.calls.length).toBe(1);expect(h.state.notes.length).toBe(1);expect(h.state.batches[0].status).toBe('prepared');h.controls.failMarkSent=false;await h.key('ctrl+s');await h.screen.waitFor(()=>h.state.batches[0].status==='sent');expect(h.controls.calls[0].id).toBe(h.controls.calls[1].id);expect(h.controls.calls[0].text).toBe(h.controls.calls[1].text);expect(h.state.notes.length).toBe(0)}finally{h.screen.renderer.destroy()}
})

test('review: down from long line lands on shorter next line, not following line',async()=>{
  const h=await harness();try{h.controls.source='abc\nx\nz';await h.key('r');await h.screen.waitForFrame(f=>f.includes('abc'));await h.key('right');await h.key('right');await h.key('right');await h.key('down');expect(h.screen.captureCharFrame()).toContain('cursor 5 · row 2/3')}finally{h.screen.renderer.destroy()}
})
