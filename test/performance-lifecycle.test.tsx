// Local real renderer + fixture host. No external host, API, model or network.
import { test, expect } from 'bun:test'
import { testRender } from '@opentui/solid'
import { createRoot } from 'solid-js'
import plugin from '../src/tui.tsx'
import { initialState } from '../src/model.ts'
import type { Context } from '@opencode/plugin/tui/context'

test('idle renderer frames do not inspect history; repeated setup cleanup releases listeners and slots', async()=>{
  const screen=await testRender(()=><text>Unchanged ordinary CLI transcript fixture</text>,{width:80,height:12})
  let historyReads=0,slots=0,slotCleanups=0
  const context={app:{version:'2.0.32'},renderer:screen.renderer,storage:{store:()=>[initialState(),async()=>{}]},
    keymap:{layer:()=>{}},data:{session:{get:()=>({}),message:{list:()=>{historyReads++;return []}}}},
    ui:{router:{current:()=>({type:'session',sessionID:'s'})},slot:()=>{slots++;return ()=>{slotCleanups++}},panel:{open:()=>true},dialog:{prompt:async()=>undefined},toast:{show:()=>{}}},
    client:{session:{prompt:()=>{throw new Error('No model call allowed')}}},
  } as unknown as Context
  const base=screen.renderer.listenerCount('selection')
  const timings:Record<string,number>={}
  async function idle(label:string){
    await screen.flush()
    const start=performance.now()
    for(let i=0;i<30;i++){screen.renderer.requestRender();await screen.flush()}
    timings[label]=(performance.now()-start)/30
  }
  try{
    await idle('baselineMeanMsPerFlush')
    for(let i=0;i<100;i++){
      let dispose!:()=>void;let cleanup:unknown
      createRoot(d=>{dispose=d;cleanup=plugin.setup(context)})
      expect(screen.renderer.listenerCount('selection')).toBe(base+1)
      if(i===0)await idle('pluginIdleMeanMsPerFlush')
      if(typeof cleanup==='function')cleanup()
      dispose()
      expect(screen.renderer.listenerCount('selection')).toBe(base)
    }
    expect(historyReads).toBe(0);expect(slots).toBe(200);expect(slotCleanups).toBe(200)
    console.log('PERFORMANCE_IDLE',JSON.stringify({...timings,historyReads,setupCleanupCycles:100,remainingPluginSelectionListeners:screen.renderer.listenerCount('selection')-base,slots,slotCleanups}))
  }finally{screen.renderer.destroy()}
})
