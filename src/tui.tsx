import { Plugin } from '@opencode/plugin/tui'
import type { Context, PanelInput } from '@opencode/plugin/tui/context'
import { For, Show, createMemo, createSignal, createEffect, onCleanup } from 'solid-js'
import { MarkdownRenderable } from '@opentui/core'
import { resolveSelection, validateCapture } from './selection.ts'
import type { Capture, MarkdownNode, SelectionNode } from './selection.ts'
import { addNote, editNote, removeNote, makeBatch, markSent, noteContents } from './model.ts'
import type { State, Note } from './model.ts'
import { annotationStore } from './store-view.ts'
import { batchPrompt } from './submission.ts'
import { promptComment } from './comment-dialog.tsx'
import { batchPresenter, type BodyAPI } from './presentation.ts'

type Update = (mutation: (draft: State) => void) => Promise<void>
const panelName = 'response-annotations.review'
const id = () => 'msg_' + crypto.randomUUID().replaceAll('-', '')

export default Plugin.define({
  id: 'response-annotations',
  setup(context) {
    const store = annotationStore(context.storage)
    const update = store.update
    const presentation = createMemo(() => batchPresenter(store.state.batches))
    const bodyAPI = (context.ui as Context['ui'] & { messageBody?: BodyAPI }).messageBody
    const bodyCleanup = bodyAPI?.version === 1 ? bodyAPI.register({ name: 'response-annotations.batch.v1', present: input => store.error ? undefined : presentation()(input) }) : undefined
    const [captured, setCaptured] = createSignal<Capture>()
    let selectionRevision = 0
    let selectionError = 'Highlight a passage in the original assistant response first'
    let busy = false
    const currentSession = () => { const route = context.ui.router.current(); return route.type === 'session' ? route.sessionID : undefined }
    const input = (sessionID: string) => ({ version: context.app.version, sessionID,
      reverted: !!context.data.session.get(sessionID)?.revert,
      messages: context.data.session.message.list(sessionID),
      isMarkdown: (node: SelectionNode): node is MarkdownNode => node instanceof MarkdownRenderable,
    })
    const capture = () => {
      selectionRevision++
      setCaptured(undefined)
      const sessionID = currentSession()
      if (!sessionID) return
      try { setCaptured(resolveSelection({ ...input(sessionID), selection: context.renderer.getSelection() })) }
      catch (error) { selectionError = error instanceof Error ? error.message : String(error) }
    }
    context.renderer.on('selection', capture)
    createEffect(() => {
      const sessionID = currentSession()
      const saved = captured()
      if (!saved) return
      if (sessionID !== saved.source.sessionID) { setCaptured(undefined); selectionRevision++; return }
      try { validateCapture(saved, input(sessionID)) } catch { setCaptured(undefined); selectionRevision++ }
    })
    async function annotate() {
      if (busy) return
      busy = true
      try {
        if (store.error) throw new Error(store.error)
        // Captured on mouse release: opening palette/dialog may already clear native selection.
        const selection = captured()
        const revision = selectionRevision
        if (!selection) throw new Error(selectionError)
        if (currentSession() !== selection.source.sessionID) throw new Error('Session changed; highlight again')
        validateCapture(selection, input(selection.source.sessionID))
        const comment = await promptComment(context, { title: 'Add annotation', quote: selection.quote })
        if (comment === undefined || currentSession() !== selection.source.sessionID || revision !== selectionRevision || captured() !== selection) return
        validateCapture(selection, input(selection.source.sessionID))
        await update(draft => { addNote(draft, selection.source, selection.start, selection.end, comment, crypto.randomUUID()) })
        if (currentSession() === selection.source.sessionID && revision === selectionRevision) context.ui.panel.open(panelName)
      } catch (error) { context.ui.toast.show({ message: error instanceof Error ? error.message : String(error), variant: 'error' }) }
      finally { setCaptured(undefined); busy = false }
    }
    context.keymap.layer(() => ({ mode: 'global', commands: [
      { id: 'response-annotations.capture', title: 'Annotate selection', group: 'Annotations', palette: true, bind: 'f6', run: annotate },
      { id: 'response-annotations.open', title: 'Review pending annotations', group: 'Annotations', palette: true,
        slash: { name: 'annotate' }, run: () => {
          if (!context.ui.panel.open(panelName)) context.ui.toast.show({ message: 'Open a session first' })
        } },
    ] }))
    const panel = context.ui.slot({ append: 'session.panel', render: props => (
      <Show when={props.name === panelName}><AnnotationPanel context={context} panel={props} state={store.state} update={update} storageError={store.error} /></Show>
    ) })
    const compact = context.ui.slot({ append: 'session.composer.top', render: props => (
      <Show when={store.error || store.state.notes.some(n => n.source.sessionID === props.sessionID)}>
        <text flexShrink={0} fg={context.theme.text.muted} onMouseDown={() => context.ui.panel.open(panelName)}>
          {store.error || `${store.state.notes.filter(n => n.source.sessionID === props.sessionID).length} pending annotations · /annotate to review/send separately`}
        </text>
      </Show>
    ) })
    return () => { context.renderer.off('selection', capture); selectionRevision++; setCaptured(undefined); bodyCleanup?.(); panel(); compact() }
  },
})

export function AnnotationPanel(props: { context: Context; panel: PanelInput; state: State; update: Update; storageError?: string }) {
  const context = props.context
  let epoch = 0
  let disposed = false
  onCleanup(() => { disposed = true; epoch++ })
  const [busy, setBusy] = createSignal(false)
  const [status, setStatus] = createSignal('Highlight in the main transcript, then Annotate selection.')
  const notes = createMemo(() => props.state.notes.filter(n => n.source.sessionID === props.panel.sessionID))
  const history = createMemo(() => props.state.batches.filter(b => b.sessionID === props.panel.sessionID && b.status === 'sent'))
  const fail = (error: unknown) => { setStatus(error instanceof Error ? error.message : String(error)); context.ui.toast.show({ message: status(), variant: 'error' }) }
  const run = (action: () => Promise<void> | void) => { if (busy()) return; setBusy(true); Promise.resolve().then(action).catch(fail).finally(() => setBusy(false)) }
  createEffect(() => { const sessionID = props.panel.sessionID; epoch++; setStatus(`Pending notes for ${sessionID}. Highlight more text in the main transcript.`) })
  async function manage(sent: boolean) {
    if (props.storageError) throw new Error(props.storageError)
    const sessionID = props.panel.sessionID
    const started = epoch
    const current = () => !disposed && epoch === started && sessionID === props.panel.sessionID
    const items = sent ? history().flatMap(b => b.notes) : notes()
    if (!items.length) { setStatus(sent ? 'No sent references yet' : 'No pending annotations'); return }
    // Capture values before displaying the asynchronous dialog. Reactive note
    // objects may change while another window saves to the same store.
    const n = await context.ui.dialog.select({ title: sent ? 'Sent references' : 'Pending annotations', options: items.map(n => ({ title: `#${n.number} ${n.quote.replace(/\s+/g, ' ').slice(0, 60)}`, description: n.comment || '(highlight only)',
      value: { id: n.id, number: n.number, quote: n.quote, comment: n.comment, expected: sent ? '' : noteContents([n]) },
    })) })
    if (!n || !current()) return
    if (sent) { setStatus(`Sent reference #${n.number}: ${n.comment || '(highlight only)'}`); return }
    const action = await context.ui.dialog.select({ title: `Annotation #${n.number}`, options: [
      { title: 'Edit comment', value: 'edit' }, { title: 'Remove annotation', value: 'remove' },
    ] })
    if (!current()) return
    const requireUnchanged = (draft: State) => {
      const fresh = draft.notes.find(note => note.id === n.id)
      if (noteContents(fresh ? [fresh] : []) !== n.expected) throw new Error(`Annotation #${n.number} changed or was removed in another window. Review it again before editing or removing.`)
    }
    if (action === 'edit') {
      const comment = await promptComment(context, { title: `Edit annotation #${n.number}`, quote: n.quote, value: n.comment })
      if (comment !== undefined && current()) await props.update(d => { requireUnchanged(d); editNote(d, n.id, comment) })
    }
    if (action === 'remove') await props.update(d => { requireUnchanged(d); removeNote(d, n.id) })
  }
  async function send() {
    if (props.storageError) throw new Error(props.storageError)
    const sessionID = props.panel.sessionID
    const started = epoch
    const close = props.panel.close
    const current = () => !disposed && epoch === started && sessionID === props.panel.sessionID
    const existing = props.state.batches.find(b => b.sessionID === sessionID && b.status === 'prepared')
    const confirmedNotes = noteContents(existing?.notes ?? notes())
    const count = existing?.notes.length ?? notes().length
    if (!count) throw new Error('No pending annotations')
    if (context.data.session.get(sessionID)?.revert) throw new Error('Resolve the session revert before sending annotations')
    const confirmed = await context.ui.dialog.confirm({ title: existing ? 'Retry the same annotation batch?' : 'Send annotation batch?',
      message: `Send ${count} annotations to this session's configured agent/model? This can use model tokens. ${existing ? 'The saved payload will be retried unchanged, including any older formatting or full source context. The previous result was uncertain; the same message ID prevents duplicate admission.' : 'Only exact selected quotes and optional comments will be sent. Source provenance and snapshots stay local; no nearby excerpts are added.'} The main composer draft will remain untouched.`,
      label: { confirm: 'Send batch', cancel: 'Keep editing' },
    })
    if (!confirmed || !current()) return
    if (context.data.session.get(sessionID)?.revert) throw new Error('Session revert changed. Resolve it before sending.')
    setBusy(true)
    try {
      let batchID = existing?.id ?? id()
      await props.update(d => {
        const prepared = d.batches.find(b => b.sessionID === sessionID && b.status === 'prepared')
        if (noteContents(prepared?.notes ?? d.notes.filter(n => n.source.sessionID === sessionID)) !== confirmedNotes) throw new Error('Annotations changed during confirmation. Review and send again.')
        batchID = makeBatch(d, sessionID, batchID, Date.now()).id
      })
      if (!current()) return // Prepared batch stays durable for an explicit later retry.
      if (context.data.session.get(sessionID)?.revert) throw new Error('Session revert changed before admission')
      const batch = props.state.batches.find(b => b.id === batchID)
      if (!batch) throw new Error('Prepared batch could not be loaded')
      const admitted = await context.client.session.prompt(batchPrompt(batch))
      if (!admitted || admitted.id !== batch.id || admitted.sessionID !== sessionID || admitted.type !== 'user') {
        throw new Error('Prompt admission was uncertain; keep this batch and retry the same ID')
      }
      await props.update(d => markSent(d, batch.id))
      setStatus(`Sent ${batch.notes.length} annotations.`)
      if (current() && props.panel.close === close) close()
    } finally { setBusy(false) }
  }
  context.keymap.layer(() => ({ commands: [
    { bind: 'e', run: () => run(() => manage(false)) }, { bind: 'h', run: () => run(() => manage(true)) },
    { bind: 'ctrl+s', run: () => run(send) }, { bind: 'escape', run: props.panel.close }, { bind: 'f', run: props.panel.toggleFullscreen },
  ] }))
  return <box flexDirection="column" padding={1} flexGrow={1} onMouseDown={props.panel.focus}>
    <Show when={props.storageError}><text flexShrink={0} fg={context.theme.text.base}>{props.storageError}</text></Show>
    <text flexShrink={0} fg={context.theme.text.base}>{props.storageError ? 'Annotations unavailable — recovery required' : `Pending annotations · ${notes().length}`}</text>
    <text flexShrink={0} fg={context.theme.text.muted}>e edit/delete · Ctrl+S send batch · Esc close</text>
    <text flexShrink={0} fg={context.theme.text.muted}>Highlight in transcript → F6 → commit</text>
    <scrollbox flexGrow={1} minHeight={1}>
      <Show when={notes().length} fallback={<text>{props.storageError ? 'Saved data could not be loaded. Offline recovery is required; changes and sending are disabled.' : 'No pending notes. The original response stays in the transcript.'}</text>}>
        <For each={notes()}>{n => <box flexDirection="column" border borderStyle="single" padding={1} marginBottom={1}>
          <text flexShrink={0} fg={context.theme.text.base}>#{n.number} · {n.comment || '(highlight only)'}</text>
          <text flexShrink={0} fg={context.theme.text.muted}>{n.quote}</text>
          <text flexShrink={0} fg={context.theme.text.muted}>{n.source.messageID} · part {n.source.part + 1}</text>
        </box>}</For>
      </Show>
    </scrollbox>
    <text flexShrink={0} fg={context.theme.text.muted}>{busy() ? 'Working…' : status()}</text>
    <text flexShrink={0} fg={context.theme.text.muted}>h saved references · f expand</text>
  </box>
}
