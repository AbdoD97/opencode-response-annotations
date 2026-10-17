// Real OpenTUI/Solid renderer; host dialogs, admission and durable store are fixtures.
// These tests do not call a model or establish actual host keyboard routing.
import { testRender } from '@opentui/solid'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import type { Context, PanelInput } from '@opencode/plugin/tui/context'
import { AnnotationPanel } from '../src/tui.tsx'
import { initialState, addNote } from '../src/model.ts'
import type { State } from '../src/model.ts'

export const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export type Request = { sessionID: string; id: string; text: string; delivery: string; metadata: unknown }
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
export async function harness(initial: State = fixtureState()) {
  const [state, setState] = createStore(initial)
  let durable = JSON.stringify(initial)
  let commands: Array<{ bind?: string; run: () => unknown }> = []
  const controls = {
    confirm: async (): Promise<boolean> => true,
    select: async (options: Array<{ value: unknown }>): Promise<unknown> => options[0]?.value,
    comment: async (): Promise<string | undefined> => '',
    prompt: async (input: Request): Promise<unknown> => admitted(input),
    beforeUpdate: async (_ordinal: number): Promise<void> => {},
    reverted: false, confirms: 0, updates: 0, closes: 0,
    errors: [] as string[], calls: [] as Request[], events: [] as string[],
  }
  const [panel, setPanel] = createStore({ name: 'response-annotations.review', sessionID: 'a', width: 80,
    presentation: 'panel', focused: true, focus: () => {},
    close: () => { controls.closes++; controls.events.push('close') }, toggleFullscreen: () => {},
  } as { -readonly [K in keyof PanelInput]: PanelInput[K] })
  const context = {
    theme: { text: { base: '#ffffff', muted: '#aaaaaa' } },
    keymap: { layer: (factory: () => { commands: typeof commands }) => { commands = factory().commands } },
    data: { session: { get: () => ({ revert: controls.reverted ? {} : undefined }) } },
    ui: { toast: { show: (x: { message: string }) => controls.errors.push(x.message) }, dialog: {
      select: (o: { options: Array<{ value: unknown }> }) => controls.select(o.options),
      prompt: () => controls.comment(), confirm: () => { controls.confirms++; return controls.confirm() },
    } },
    client: { session: { prompt: async (input: Request) => {
      controls.calls.push(input); controls.events.push('prompt'); return controls.prompt(input)
    } } },
  } as unknown as Context
  const update = async (fn: (draft: State) => void) => {
    const ordinal = ++controls.updates
    await controls.beforeUpdate(ordinal)
    // Match the storage transaction contract: a failed write must not mutate live state.
    const draft: State = JSON.parse(JSON.stringify(unwrap(state)))
    fn(draft)
    durable = JSON.stringify(draft)
    setState(reconcile(draft))
    controls.events.push(`saved:${ordinal}`)
  }
  const screen = await testRender(() => <AnnotationPanel context={context} panel={panel} state={state} update={update} />, { width: 80, height: 50 })
  await screen.flush()
  async function key(bind: string) {
    const command = commands.find(c => c.bind === bind)
    if (!command) throw new Error(`No binding: ${bind}`)
    command.run()
    await screen.flush()
  }
  return { state, setState, panel, setPanel, screen, controls, key, update,
    bindings: () => commands.map(c => c.bind), persisted: (): State => JSON.parse(durable),
    destroy: () => screen.renderer.destroy() }
}
