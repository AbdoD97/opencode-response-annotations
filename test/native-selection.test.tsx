import { test, expect } from 'bun:test'
import { testRender } from '@opentui/solid'
import { MarkdownRenderable, SyntaxStyle } from '@opentui/core'
import type { Renderable } from '@opentui/core'
import { resolveSelection } from '../src/selection.ts'
import type { MarkdownNode, SelectionNode } from '../src/selection.ts'

test('real public renderer native selection resolves original Markdown descendants', async () => {
  let markdown!: MarkdownRenderable
  const screen = await testRender(() => <box id="msg_native"><box><markdown ref={markdown} content="Alpha beta gamma." syntaxStyle={SyntaxStyle.create()} streaming={false}/></box></box>, {width:80,height:12})
  try {
    await screen.flush()
    const leaves = (node: Renderable): Renderable[] => node.getChildren().length ? node.getChildren().flatMap(leaves) : [node]
    const leaf = leaves(markdown)[0]
    screen.renderer.startSelection(leaf, leaf.x, leaf.y)
    screen.renderer.updateSelection(leaf, leaf.x + 4, leaf.y, {finishDragging:true})
    const selection = screen.renderer.getSelection()
    expect(selection?.getSelectedText()).toBe('Alpha')
    expect(selection?.selectedRenderables.length).toBeGreaterThan(0)
    const captured = resolveSelection({version:'2.0.32',sessionID:'a',reverted:false,selection,
      messages:[{id:'msg_native',type:'assistant',time:{completed:1},content:[{type:'text',text:'Alpha beta gamma.'}]}],
      isMarkdown:(node:SelectionNode):node is MarkdownNode=>node instanceof MarkdownRenderable,
    })
    expect(captured.start).toBe(0);expect(captured.end).toBe(5)
    screen.renderer.clearSelection()
    expect(captured.quote).toBe('Alpha')
  } finally {screen.renderer.destroy()}
})

import plugin from '../src/tui.tsx'
import { createRoot } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { initialState } from '../src/model.ts'
import type { Context } from '@opencode/plugin/tui/context'

test('native release captured before host clears selection; commit local only, cancel and revert invalidate', async () => {
  let markdown!: MarkdownRenderable
  const screen=await testRender(()=><box id="msg_native"><box><markdown ref={markdown} content="Alpha beta gamma." syntaxStyle={SyntaxStyle.create()} streaming={false}/></box></box>,{width:80,height:12})
  const [state,setState]=createStore(initialState())
  const [session,setSession]=createStore({revert: false})
  let commands: Array<{id?:string;run:()=>Promise<void>}> = []
  let comment: string|undefined='Explain this'
  let opens=0, prompts=0
  const errors:string[]=[]
  let dispose!:()=>void
  let cleanup: unknown
  const context={app:{version:'2.0.32'},renderer:screen.renderer,
    storage:{store:()=>[state,async(fn:Parameters<typeof produce<typeof state>>[0])=>setState(produce(fn))]},
    keymap:{layer:(factory:()=>{commands:typeof commands})=>{commands=factory().commands}},
    data:{session:{get:()=>({revert:session.revert?{}:undefined}),message:{list:()=>[{id:'msg_native',type:'assistant',time:{completed:1},content:[{type:'text',text:'Alpha beta gamma.'}]}]}}},
    ui:{router:{current:()=>({type:'session',sessionID:'a'})},slot:()=>()=>{},panel:{open:()=>{opens++;return true}},
      dialog:{prompt:async()=>comment},toast:{show:(x:{message:string})=>errors.push(x.message)}},
    client:{session:{prompt:()=>{prompts++;throw new Error('must not call model')}}},
  } as unknown as Context
  createRoot(d=>{dispose=d;cleanup=plugin.setup(context)})
  async function select() {
    await screen.flush()
    const leaf=markdown.getChildren()[0]
    screen.renderer.startSelection(leaf,leaf.x,leaf.y)
    screen.renderer.updateSelection(leaf,leaf.x+4,leaf.y,{finishDragging:true})
    // Fixture release event carries the real public Selection object.
    screen.renderer.emit('selection', screen.renderer.getSelection())
    await screen.flush()
    screen.renderer.clearSelection()
  }
  const annotate=()=>commands.find(c=>c.id==='response-annotations.capture')!.run()
  try {
    await select();await annotate()
    expect(state.notes.length).toBe(1);expect(state.notes[0].quote).toBe('Alpha');expect(opens).toBe(1);expect(prompts).toBe(0)
    comment=undefined;await select();await annotate();expect(state.notes.length).toBe(1)
    comment='stale';await select();setSession('revert',true);await screen.flush();setSession('revert',false);await screen.flush();await annotate()
    expect(state.notes.length).toBe(1);expect(errors.length).toBeGreaterThan(0)
  } finally {if(typeof cleanup==='function')cleanup();dispose();screen.renderer.destroy()}
})
