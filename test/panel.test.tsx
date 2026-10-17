import { test, expect } from 'bun:test'
import { testRender } from '@opentui/solid'
import { createStore, produce } from 'solid-js/store'
import type { Context, PanelInput } from '@opencode/plugin/tui/context'
import { AnnotationPanel } from '../src/tui.tsx'
import { initialState } from '../src/model.ts'

test('real renderer: select ranges, save/edit/remove, cancel and retry batch, keep references', async () => {
  const [state, setState] = createStore(initialState())
  let commands: Array<{bind?:string;run:()=>unknown}> = []
  let select: (options: Array<{value:unknown}>) => unknown = options => options[0].value
  let comment: string | undefined = 'Please explain'
  let confirm = false
  let confirmHook = () => {}
  let reject = false
  const calls: Array<{id:string;text:string;sessionID:string}> = []
  const context = {
    theme: {text:{base:'#ffffff',muted:'#aaaaaa'}},
    keymap: {layer: (factory:()=>{commands:typeof commands}) => {commands=factory().commands}},
    data:{session:{get:()=>({}),message:{sync:async()=>{},list:()=>[
      {id:'msg_original',type:'assistant',time:{completed:1},content:[{type:'text',text:'alpha beta alpha\n👨‍👩‍👧 second line'}]},
    ]}}},
    ui:{toast:{show:()=>{}},dialog:{select:async(o:{options:Array<{value:unknown}>})=>select(o.options),prompt:async()=>comment,confirm:async()=>{confirmHook();return confirm}}},
    client:{session:{prompt:async(input:typeof calls[number])=>{calls.push(input);if(reject)throw new Error('connection lost');return {data:{id:input.id}}}}},
  } as unknown as Context
  const [panel,setPanel] = createStore({name:'response-annotations.review',sessionID:'session-a',width:60,presentation:'panel' as const,focused:true,focus:()=>{},close:()=>{},toggleFullscreen:()=>{}})
  const screen=await testRender(()=> <AnnotationPanel context={context} panel={panel} state={state} update={async fn=>{setState(produce(fn))}}/>,{width:60,height:30})
  async function key(bind:string) { const cmd=commands.find(c=>c.bind===bind);if(!cmd)throw new Error(`No ${bind}`);cmd.run();await screen.flush() }
  try {
    await key('r');await screen.waitForFrame(f=>f.includes('alpha beta alpha'))
    for(let i=0;i<5;i++)await key('shift+right')
    await key('n');await screen.waitFor(()=>state.notes.length===1)
    expect(state.notes[0].quote).toBe('alpha');expect(state.notes[0].comment).toBe('Please explain')
    expect(screen.captureCharFrame()).toContain('[1]alpha')
    await key('ctrl+s');await screen.flush();expect(calls.length).toBe(0);expect(state.batches.length).toBe(0)
    select=options=>options.some(o=>o.value==='edit')?'edit':options[0].value;comment='Revised'
    await key('e');await screen.waitFor(()=>state.notes[0].comment==='Revised')
    confirm=true;reject=true;await key('ctrl+s');await screen.waitFor(()=>calls.length===1)
    await screen.waitForFrame(f=>f.includes('connection lost'));expect(state.notes.length).toBe(1)
    reject=false;await key('ctrl+s');await screen.waitFor(()=>state.notes.length===0)
    expect(calls[0].id).toBe(calls[1].id);expect(calls[0].text).toContain('second line');expect(calls[0].sessionID).toBe('session-a')
    await key('h');await screen.waitForFrame(f=>f.includes('Sent reference #1'))
    expect(state.batches[0].status).toBe('sent')
    await key('r');await key('shift+right');await key('a');await screen.waitFor(()=>state.notes.length===1)
    select=options=>options.some(o=>o.value==='remove')?'remove':options[0].value
    await key('e');await screen.waitFor(()=>state.notes.length===0)
    await key('r');await key('shift+right');await key('a');await screen.waitFor(()=>state.notes.length===1)
    confirmHook=()=>setState(produce(d=>{d.notes[0].comment='Changed in another window'}))
    await key('ctrl+s');await screen.waitForFrame(f=>f.includes('Annotations changed'))
    expect(calls.length).toBe(2);expect(state.batches.length).toBe(1)
    setPanel('sessionID','session-b');await screen.flush()
    expect(screen.captureCharFrame()).not.toContain('msg_original')
    await key('shift+right');await key('a');await screen.waitForFrame(f=>f.includes('Choose a response first'))
    expect(state.notes[0].source.sessionID).toBe('session-a')
  } catch(error) { console.log(screen.captureCharFrame()); console.log(JSON.stringify(state)); throw error } finally {screen.renderer.destroy()}
})
