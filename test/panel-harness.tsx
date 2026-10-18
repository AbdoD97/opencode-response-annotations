// Real OpenTUI/Solid renderer; host dialogs, admission and durable store are fixtures.
// These tests do not call a model or establish actual host keyboard routing.
import { testRender } from '@opentui/solid'
import { TextareaRenderable, type Renderable } from '@opentui/core'
import { createSignal, Show, onCleanup, type JSX } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import type { Context, PanelInput, KeymapLayer } from '@opencode/plugin/tui/context'
import { AnnotationPanel } from '../src/tui.tsx'
import { initialState, addNote } from '../src/model.ts'
import type { State } from '../src/model.ts'
import type { batchPrompt } from '../src/submission.ts'

export const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export type Request = ReturnType<typeof batchPrompt>
export const admitted = (input: Request) => ({ id: input.id, sessionID: input.sessionID, type: 'user', time: { created: 1 }, payload: { text: input.text }, delivery: input.delivery })
export function fixtureState(count = 1): State {
  const state = initialState()
  for (let i = 0; i < count; i++) addNote(state, {
    sessionID: 'a', messageID: 'msg_source', part: 2,
    text: 'alpha beta\n👨‍👩‍👧 é end: UNSELECTED_SOURCE_CONTEXT',
    responseParts: [{ part: 0, text: 'SIBLING_SOURCE_CONTEXT' }, { part: 2, text: 'alpha beta\n👨‍👩‍👧 é end: UNSELECTED_SOURCE_CONTEXT' }],
  }, i % 2 ? 6 : 0, i % 2 ? 10 : 5, i ? `comment ${i + 1}` : '', `note-${i + 1}`)
  return state
}
export async function harness(initial: State = fixtureState(), options: { storageError?: string; transaction?: (mutation: (draft: State) => void) => Promise<State> } = {}) {
  const [state, setState] = createStore(initial)
  let durable = JSON.stringify(initial)
  const layers: Array<() => KeymapLayer> = []
  const [dialog, setDialog] = createSignal<() => JSX.Element>()
  let dialogClosed: (() => void) | undefined, dialogGeneration = 0
  let screen!: Awaited<ReturnType<typeof testRender>>
  const controls = {
    confirm: async (): Promise<boolean> => true,
    select: async (options: Array<{ value: unknown }>): Promise<unknown> => options[0]?.value,
    comment: async (): Promise<string | undefined> => '',
    prompt: async (input: Request): Promise<unknown> => admitted(input),
    beforeUpdate: async (_ordinal: number): Promise<void> => {},
    reverted: false, confirms: 0, updates: 0, closes: 0,
    errors: [] as string[], calls: [] as Request[], events: [] as string[], confirmMessages: [] as string[],
    commentTasks: [] as Promise<void>[],
  }
  const [panel, setPanel] = createStore({ name: 'response-annotations.review', sessionID: 'a', width: 80,
    presentation: 'panel', focused: true, focus: () => {},
    close: () => { controls.closes++; controls.events.push('close') }, toggleFullscreen: () => {},
  } as { -readonly [K in keyof PanelInput]: PanelInput[K] })
  function clearDialog() {
    dialogGeneration++
    const close = dialogClosed; dialogClosed = undefined
    setDialog(undefined); close?.()
  }
  const find = (node: Renderable, id: string): Renderable | undefined => node.id === id ? node : node.getChildren().map(child => find(child, id)).find(Boolean)
  const commands = () => layers.map(factory => factory()).filter(layer => layer.enabled !== false && (typeof layer.enabled !== 'function' || layer.enabled()) &&
    (!dialog() || layer.mode === 'modal')).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).flatMap(layer => layer.commands ?? [])
  const context = {
    theme: { text: { base: '#ffffff', muted: '#aaaaaa' } },
    keymap: { layer: (factory: () => KeymapLayer) => { layers.push(factory); onCleanup(() => layers.splice(layers.indexOf(factory), 1)) } },
    data: { session: { get: () => ({ revert: controls.reverted ? {} : undefined }) } },
    ui: { toast: { show: (x: { message: string }) => controls.errors.push(x.message) }, dialog: {
      select: (o: { options: Array<{ value: unknown }> }) => controls.select(o.options),
      clear: clearDialog, set: () => {},
      show: (render: () => JSX.Element, close: () => void) => {
        clearDialog(); dialogClosed = close; setDialog(() => render)
        const generation = dialogGeneration
        const task = (async () => {
          const comment = await controls.comment()
          if (generation !== dialogGeneration) return
          await screen.flush()
          if (generation !== dialogGeneration) return
          if (comment === undefined) { clearDialog(); return }
          const input = find(screen.renderer.root, 'response-annotations.comment.input')
          if (!(input instanceof TextareaRenderable)) throw new Error('Missing comment input')
          input.setText(comment); input.submit()
        })().catch(error => controls.errors.push(String(error)))
        controls.commentTasks.push(task.then(() => {}))
      },
      prompt: () => controls.comment(), confirm: (o: { message: string }) => { controls.confirms++; controls.confirmMessages.push(o.message); return controls.confirm() },
    } },
    client: { session: { prompt: async (input: Request) => {
      controls.calls.push(input); controls.events.push('prompt'); return controls.prompt(input)
    } } },
  } as unknown as Context
  const update = async (fn: (draft: State) => void) => {
    const ordinal = ++controls.updates
    await controls.beforeUpdate(ordinal)
    // Match the storage transaction contract: a failed write must not mutate live state.
    const draft: State = options.transaction ? await options.transaction(fn) : JSON.parse(JSON.stringify(unwrap(state)))
    if (!options.transaction) fn(draft)
    durable = JSON.stringify(draft)
    setState(reconcile(draft))
    controls.events.push(`saved:${ordinal}`)
  }
  screen = await testRender(() => <box width="100%" height="100%"><AnnotationPanel context={context} panel={panel} state={state} update={update} storageError={options.storageError} />
    <Show when={dialog()} keyed>{render => <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#000000">{render()}</box>}</Show>
  </box>, { width: 80, height: 50 })
  await screen.flush()
  async function key(bind: string) {
    const command = commands().find(c => c.bind === bind)
    if (!command) throw new Error(`No binding: ${bind}`)
    command.run()
    await screen.flush()
  }
  return { state, setState, panel, setPanel, screen, controls, key, update,
    bindings: () => commands().map(c => c.bind), persisted: (): State => JSON.parse(durable),
    destroy: () => { clearDialog(); screen.renderer.destroy() } }
}
