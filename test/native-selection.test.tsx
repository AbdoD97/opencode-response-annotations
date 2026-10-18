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

import { pluginHarness } from './plugin-harness.tsx'

test('palette dispatch uses the native release snapshot after clearing; session leave-and-return invalidates it', async () => {
  const h = await pluginHarness()
  try {
    await h.selectQuote(); h.screen.renderer.clearSelection()
    h.keymap.dispatchCommand('response-annotations.capture')
    await h.screen.waitForFrame(frame => frame.includes('Add annotation'))
    h.input()!.setText('Explain this'); h.screen.mockInput.pressEnter()
    await h.screen.waitFor(() => h.state().notes.length === 1)
    expect(h.state().notes[0].quote).toBe('Alpha'); expect(h.opens()).toBe(1); expect(h.requests()).toBe(0)
    await h.selectQuote(); h.setSession('id', 'b'); await h.screen.flush(); h.setSession('id', 'a'); await h.screen.flush()
    h.keymap.dispatchCommand('response-annotations.capture')
    await h.screen.waitFor(() => h.errors.length > 0)
    expect(h.state().notes).toHaveLength(1); expect(h.composer.plainText).toBe(h.originalComposer)
  } finally { h.destroy() }
})
