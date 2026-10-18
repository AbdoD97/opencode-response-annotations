// Real renderer/parser and published keymap 0.5.17; dialogs/storage/client are
// offline fixtures. The small layer bridge follows pinned OpenCode createLayer
// (594af423, MIT; see fixtures/UPSTREAM-LICENSE.txt), including mode/config rules.
import { testRender, useRenderer, useTerminalDimensions } from '@opentui/solid'
import { MarkdownRenderable, SyntaxStyle, TextareaRenderable, type Renderable } from '@opentui/core'
import { createDefaultOpenTuiKeymap } from '@opentui/keymap/opentui'
import { registerManagedTextareaLayer } from '@opentui/keymap/addons/opentui'
import { KeymapProvider, useBindings } from '@opentui/keymap/solid'
import { createSignal, Show, onCleanup, type JSX } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { Context, KeymapLayer } from '@opencode/plugin/tui/context'
import plugin from '../src/tui.tsx'
import { initialState } from '../src/model.ts'
import { migrateStoredState, mutateStoredState, readStoredState } from '../src/storage.ts'
import { promptComment } from '../src/comment-dialog.tsx'

export const findRenderable = (node: Renderable, id: string): Renderable | undefined => node.id === id ? node : node.getChildren().map(child => findRenderable(child, id)).find(Boolean)

export async function pluginHarness(options: { width?: number; height?: number; kitty?: boolean; configuredCapture?: string; source?: string } = {}) {
  const [raw, setRaw] = createStore(migrateStoredState(initialState()))
  const [session, setSession] = createStore({ id: 'a', revert: false })
  const [dialog, setDialog] = createSignal<() => JSX.Element>()
  let dialogClosed: (() => void) | undefined, previousFocus: Renderable | null = null
  let context!: Context, markdown!: MarkdownRenderable, composer!: TextareaRenderable
  let keymap!: ReturnType<typeof createDefaultOpenTuiKeymap>
  let opens = 0, requests = 0
  const errors: string[] = []
  const originalComposer = 'UNSENT composer draft'
  const source = options.source ?? 'Alpha beta gamma.'
  function clearDialog() {
    const close = dialogClosed; dialogClosed = undefined
    setDialog(undefined); keymap.setData('opencode.mode', 'base'); close?.()
    if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus()
    previousFocus = null
  }
  function Body() {
    const renderer = useRenderer()
    const dimensions = useTerminalDimensions()
    const layer = (factory: () => KeymapLayer) => useBindings(() => {
      const { commands = [], bindings: _bindings, mode, ...rest } = factory()
      return { ...rest, ...(mode === 'global' ? {} : { mode: mode ?? 'base' }),
        commands: commands.flatMap(command => command.id ? [{ name: command.id, title: command.title,
          run: ({ event }: { event: Parameters<typeof command.run>[1] }) => command.run(undefined, event) }] : []),
        bindings: commands.flatMap(command => {
          if (command.bind === false) return []
          const configured = command.id === 'response-annotations.capture' ? options.configuredCapture : undefined
          const key = configured ?? command.bind
          if (!key) return []
          return [{ key, cmd: command.id ?? (() => command.run()) }]
        }),
      }
    })
    context = { app: { version: '2.0.32' }, renderer,
      theme: { text: { base: '#ffffff', muted: '#aaaaaa' } },
      keymap: { layer, dispatch: (id: string) => keymap.dispatchCommand(id) },
      storage: { store: () => [raw, async (mutation: (draft: object) => void) => {
        const draft = JSON.parse(JSON.stringify(raw)); mutation(draft); setRaw(reconcile(draft))
      }] },
      data: { session: { get: () => ({ revert: session.revert ? {} : undefined }), message: { list: () => [
        { id: 'msg_native', type: 'assistant', time: { completed: 1 }, content: [{ type: 'text', text: source }] },
      ] } } },
      ui: { router: { current: () => ({ type: 'session', sessionID: session.id }) }, slot: () => () => {},
        panel: { open: () => { opens++; return true } }, toast: { show: (value: { message: string }) => errors.push(value.message) },
        dialog: { clear: clearDialog, set: () => {}, show: (render: () => JSX.Element, onClose: () => void) => {
          if (dialog()) clearDialog()
          previousFocus = renderer.currentFocusedRenderable ?? null; previousFocus?.blur()
          dialogClosed = onClose; keymap.setData('opencode.mode', 'modal'); setDialog(() => render)
        } },
      }, client: { session: { prompt: () => { requests++; throw new Error('No model requests allowed') } } },
    } as unknown as Context
    const cleanup = plugin.setup(context)
    onCleanup(() => { if (typeof cleanup === 'function') cleanup() })
    return <box width="100%" height="100%" flexDirection="column">
      <box id="msg_native"><box><markdown ref={markdown} content={source} syntaxStyle={SyntaxStyle.create()} streaming={false} /></box></box>
      <textarea ref={composer} initialValue={originalComposer} height={2} />
      {/* Pinned host Dialog geometry: quarter-height offset, one top-padding
          row and a width capped at terminal columns minus two. */}
      <Show when={dialog()} keyed>{render => <box position="absolute" top={0} left={0} width="100%" height="100%"
        alignItems="center" paddingTop={dimensions().height / 4} backgroundColor="#000000">
        <box width={80} maxWidth={dimensions().width - 2} paddingTop={1} backgroundColor="#000000">{render()}</box>
      </box>}</Show>
    </box>
  }
  function Root() {
    const renderer = useRenderer()
    keymap = createDefaultOpenTuiKeymap(renderer)
    keymap.setData('opencode.mode', 'base')
    const fields = keymap.registerLayerFields({ mode(value, ctx) { ctx.require('opencode.mode', value) } })
    const close = keymap.registerLayer({ mode: 'modal', bindings: [{ key: 'escape', cmd: clearDialog }, { key: 'ctrl+c', cmd: clearDialog }] })
    const textareas = registerManagedTextareaLayer(keymap, renderer, {
      enabled: () => renderer.currentFocusedEditor instanceof TextareaRenderable,
      bindings: [{ key: 'ctrl+a', cmd: 'input.line.home' }, { key: 'ctrl+shift+a', cmd: 'input.select.line.home' }],
    }, { commandNames: { 'line-home': 'input.line.home', 'select-line-home': 'input.select.line.home' } })
    // Reproduce the host's ordinary non-copy selection dismissal before app
    // dispatch. This is synthetic renderer input, never a running terminal.
    const selection = keymap.intercept('key', () => { if (renderer.getSelection()) renderer.clearSelection() })
    onCleanup(() => { selection(); textareas(); close(); fields() })
    return <KeymapProvider keymap={keymap}><Body /></KeymapProvider>
  }
  const screen = await testRender(() => <Root />, { width: options.width ?? 80, height: options.height ?? 24, kittyKeyboard: options.kitty ?? false })
  await screen.flush(); composer.focus(); await screen.flush()
  async function selectQuote(columns = 5) {
    const leaves = (node: Renderable): Renderable[] => node.getChildren().length ? node.getChildren().flatMap(leaves) : [node]
    const leaf = leaves(markdown)[0]
    screen.renderer.startSelection(leaf, leaf.x, leaf.y)
    screen.renderer.updateSelection(leaf, leaf.x + columns - 1, leaf.y, { finishDragging: true })
    screen.renderer.emit('selection', screen.renderer.getSelection())
    await screen.flush()
  }
  return { screen, context, keymap, composer, originalComposer, errors, setSession, selectQuote,
    state: () => readStoredState(raw), opens: () => opens, requests: () => requests,
    openComment: (quote: string, value = '') => promptComment(context, { title: 'Edit annotation #1', quote, value }),
    update: (mutation: Parameters<typeof mutateStoredState>[1]) => { const draft = JSON.parse(JSON.stringify(raw)); mutateStoredState(draft, mutation); setRaw(reconcile(draft)) },
    input: () => findRenderable(screen.renderer.root, 'response-annotations.comment.input') as TextareaRenderable | undefined,
    destroy: () => { clearDialog(); screen.renderer.destroy() },
  }
}
