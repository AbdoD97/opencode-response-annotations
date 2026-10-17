import { Plugin } from '@opencode/plugin/tui'
import type { Context, PanelInput } from '@opencode/plugin/tui/context'
import { For, Show, createMemo, createSignal, createEffect } from 'solid-js'
import { TextAttributes } from '@opentui/core'
import { addNote, editNote, removeNote, makeBatch, markSent, initialState, boundaries, move, sameSource } from './model.ts'
import type { Source, State, Note } from './model.ts'

type Update = (mutation: (draft: State) => void) => Promise<void>
const panelName = 'response-annotations.review'
const id = () => 'msg_' + crypto.randomUUID().replaceAll('-', '')

export default Plugin.define({
  id: 'response-annotations',
  setup(context) {
    const [state, update] = context.storage.store('annotations-v1', { initial: initialState() })
    context.keymap.layer(() => ({ mode: 'global', commands: [{
      id: 'response-annotations.open', title: 'Annotate assistant response', group: 'Annotations', palette: true,
      slash: { name: 'annotate' }, run: () => {
        if (!context.ui.panel.open(panelName)) context.ui.toast.show({ message: 'Open a session first' })
      },
    }] }))
    const panel = context.ui.slot({ append: 'session.panel', render: props => (
      <Show when={props.name === panelName}><AnnotationPanel context={context} panel={props} state={state} update={update} /></Show>
    ) })
    const compact = context.ui.slot({ append: 'session.composer.top', render: props => (
      <Show when={state.notes.some(n => n.source.sessionID === props.sessionID)}>
        <text fg={context.theme.text.muted} onMouseDown={() => context.ui.panel.open(panelName)}>
          {state.notes.filter(n => n.source.sessionID === props.sessionID).length} pending annotations · /annotate to review/send separately
        </text>
      </Show>
    ) })
    return () => { panel(); compact() }
  },
})

export function AnnotationPanel(props: { context: Context; panel: PanelInput; state: State; update: Update }) {
  const context = props.context
  const [source, setSource] = createSignal<Source>()
  const [cursor, setCursor] = createSignal(0)
  const [anchor, setAnchor] = createSignal<number>()
  const [busy, setBusy] = createSignal(false)
  const [status, setStatus] = createSignal('Choose a response with r. Select with Shift+arrows.')
  const points = createMemo(() => boundaries(source()?.text ?? ''))
  const notes = createMemo(() => props.state.notes.filter(n => n.source.sessionID === props.panel.sessionID))
  const history = createMemo(() => props.state.batches.filter(b => b.sessionID === props.panel.sessionID && b.status === 'sent'))
  const selected = createMemo(() => ({ start: Math.min(anchor() ?? cursor(), cursor()), end: Math.max(anchor() ?? cursor(), cursor()) }))
  const sourceNotes = createMemo(() => {
    const s = source()
    return s ? [...notes(), ...history().flatMap(b => b.notes)].filter(n => sameSource(n.source, s)) : []
  })
  const fail = (error: unknown) => { setStatus(error instanceof Error ? error.message : String(error)); context.ui.toast.show({ message: status(), variant: 'error' }) }
  const run = (action: () => Promise<void> | void) => { if (busy()) return; setBusy(true); Promise.resolve().then(action).catch(fail).finally(() => setBusy(false)) }
  createEffect(() => { const sessionID = props.panel.sessionID; setSource(undefined); setCursor(0); setAnchor(undefined); setStatus(`Choose a response in ${sessionID} with r.`) })
  const activate = (s: Source, start = 0, end?: number) => { setSource({ ...s }); setCursor(end ?? start); setAnchor(end === undefined ? undefined : start) }
  async function choose() {
    const sessionID = props.panel.sessionID
    await context.data.session.message.sync(sessionID)
    if (sessionID !== props.panel.sessionID) return
    const sources = context.data.session.message.list(sessionID).flatMap(m => m.type === 'assistant' && m.time.completed !== undefined
      ? m.content.flatMap((p, part) => p.type === 'text' && p.text ? [{ sessionID, messageID: m.id, part, text: p.text, responseParts: m.content.flatMap((q, index) => q.type === 'text' ? [{ part: index, text: q.text }] : []) }] : []) : [])
    if (!sources.length) { setStatus('No completed assistant text yet. Wait until the response finishes.'); return }
    const choice = await context.ui.dialog.select({ title: 'Choose assistant response', options: [...sources].reverse().map(s => ({
      title: s.text.replace(/\s+/g, ' ').slice(0, 85), description: `${s.messageID} · text part ${s.part + 1}`, value: s,
    })) })
    if (choice && sessionID === props.panel.sessionID) { activate(choice); setStatus('Shift+arrows select · a saves highlight · n adds comment') }
  }
  function step(delta: number, extend: boolean) {
    const s = source(); if (!s) return
    if (extend && anchor() === undefined) setAnchor(cursor())
    if (!extend) setAnchor(undefined)
    const index = points().indexOf(cursor())
    setCursor(points()[Math.max(0, Math.min(points().length-1, index+delta))])
  }
  function edge(end: boolean, extend: boolean) {
    const s = source(); if (!s) return
    if (extend && anchor() === undefined) setAnchor(cursor())
    if (!extend) setAnchor(undefined)
    setCursor(end ? s.text.length : 0)
  }
  async function save(withComment: boolean) {
    const s = source(); if (!s) throw new Error('Choose a response first')
    const range = selected()
    if (range.start === range.end) throw new Error('Select a passage with Shift+arrows first')
    const comment = withComment ? await context.ui.dialog.prompt({ title: 'Comment (optional)', placeholder: 'Leave blank for highlight only' }) : ''
    if (comment === undefined || s.sessionID !== props.panel.sessionID) return
    await props.update(draft => { addNote(draft, s, range.start, range.end, comment, crypto.randomUUID()) })
    setAnchor(undefined); setStatus('Saved. Select another passage, or Ctrl+S to review the batch.')
  }
  async function manage(sent: boolean) {
    const sessionID = props.panel.sessionID
    const items = sent ? history().flatMap(b => b.notes) : notes()
    if (!items.length) { setStatus(sent ? 'No sent references yet' : 'No pending annotations'); return }
    const n = await context.ui.dialog.select({ title: sent ? 'Sent references' : 'Pending annotations', options: items.map(n => ({ title: `#${n.number} ${n.quote.replace(/\s+/g, ' ').slice(0, 60)}`, description: n.comment || '(highlight only)', value: n })) })
    if (!n || sessionID !== props.panel.sessionID) return
    activate(n.source, n.start, n.end)
    if (sent) { setStatus(`Sent reference #${n.number}: ${n.comment || '(highlight only)'}`); return }
    const action = await context.ui.dialog.select({ title: `Annotation #${n.number}`, options: [
      { title: 'View anchored passage', value: 'view' }, { title: 'Edit comment', value: 'edit' }, { title: 'Remove annotation', value: 'remove' },
    ] })
    if (sessionID !== props.panel.sessionID) return
    if (action === 'edit') {
      const comment = await context.ui.dialog.prompt({ title: `Edit #${n.number}`, value: n.comment })
      if (comment !== undefined && sessionID === props.panel.sessionID) await props.update(d => editNote(d, n.id, comment))
    }
    if (action === 'remove') await props.update(d => removeNote(d, n.id))
  }
  async function send() {
    const sessionID = props.panel.sessionID
    const existing = props.state.batches.find(b => b.sessionID === sessionID && b.status === 'prepared')
    const confirmedNotes = JSON.stringify(existing?.notes ?? notes())
    const count = existing?.notes.length ?? notes().length
    if (!count) throw new Error('No pending annotations')
    if (context.data.session.get(sessionID)?.revert) throw new Error('Resolve the session revert before sending annotations')
    const sourceCharacters = [...new Map((existing?.notes ?? notes()).map(n => [`${n.source.messageID}:${n.source.part}`, n.source.text.length])).values()].reduce((a,b)=>a+b,0)
    const confirmed = await context.ui.dialog.confirm({ title: existing ? 'Retry the same annotation batch?' : 'Send annotation batch?',
      message: `Send ${count} annotations and full source snapshots (${sourceCharacters.toLocaleString()} selected-source characters, plus sibling text parts) to this session's configured agent/model? This can use model tokens. The main composer draft will remain untouched. ${existing ? 'The previous result was uncertain; the same message ID prevents duplicate admission.' : ''}`,
      label: { confirm: 'Send batch', cancel: 'Keep editing' },
    })
    if (!confirmed || sessionID !== props.panel.sessionID) return
    if (context.data.session.get(sessionID)?.revert) throw new Error('Session revert changed. Resolve it before sending.')
    setBusy(true)
    try {
      let batchID = existing?.id ?? id()
      await props.update(d => {
        const prepared = d.batches.find(b => b.sessionID === sessionID && b.status === 'prepared')
        if (JSON.stringify(prepared?.notes ?? d.notes.filter(n => n.source.sessionID === sessionID)) !== confirmedNotes) throw new Error('Annotations changed during confirmation. Review and send again.')
        batchID = makeBatch(d, sessionID, batchID, Date.now()).id
      })
      const batch = props.state.batches.find(b => b.id === batchID)
      if (!batch) throw new Error('Prepared batch could not be loaded')
      await context.client.session.prompt({ sessionID, id: batch.id, text: batch.text, delivery: 'queue', metadata: { annotationBatch: batch.id } })
      await props.update(d => markSent(d, batch.id))
      setStatus(`Sent ${batch.notes.length} annotations. h opens saved references.`)
    } finally { setBusy(false) }
  }
  const columns = () => Math.max(8, Math.floor((props.panel.width - 8) / 2))
  const rows = createMemo(() => {
    const s = source(); if (!s) return []
    const offsets = points(); const result: Array<{ start: number; end: number; text: string }> = []
    let start = 0; let count = 0
    for (let i=1; i<offsets.length; i++) {
      count++
      if (count >= columns() || s.text.slice(offsets[i-1],offsets[i]).includes('\n')) {
        result.push({start,end:offsets[i],text:s.text.slice(start,offsets[i])}); start=offsets[i];count=0
      }
    }
    result.push({start,end:s.text.length,text:s.text.slice(start)})
    return result
  })
  const currentRow = () => Math.max(0, rows().findIndex((r,i) => cursor() >= r.start && (cursor() < r.end || i === rows().length-1)))
  const visibleRows = () => rows().slice(Math.max(0, currentRow()-4), Math.max(0,currentRow()-4)+10)
  function vertical(delta: number, extend: boolean) {
    const current = rows()[currentRow()]; const target = rows()[Math.max(0,Math.min(rows().length-1,currentRow()+delta))]
    const s=source(); if (!s || !current || !target) return
    const offset=boundaries(s.text.slice(current.start,cursor())).length-1
    const points=boundaries(s.text.slice(target.start,target.end))
    if (extend && anchor()===undefined) setAnchor(cursor())
    if (!extend) setAnchor(undefined)
    // A non-final row's end is the following row's start. Clamp before
    // that boundary so moving onto a shorter row cannot skip it.
    const last = target === rows()[rows().length-1] ? points.length-1 : Math.max(0,points.length-2)
    setCursor(target.start+points[Math.min(offset,last)])
  }
  context.keymap.layer(() => ({ commands: [
    { bind: 'r', run: () => run(choose) }, { bind: 'a', run: () => run(() => save(false)) }, { bind: 'n', run: () => run(() => save(true)) },
    { bind: 'e', run: () => run(() => manage(false)) }, { bind: 'h', run: () => run(() => manage(true)) },
    { bind: 'ctrl+s', run: () => run(send) }, { bind: 'escape', run: props.panel.close }, { bind: 'f', run: props.panel.toggleFullscreen },
    ...(['left','right'] as const).flatMap((key,i) => [
      { bind: key, run: () => step(i ? 1 : -1, false) }, { bind: `shift+${key}`, run: () => step(i ? 1 : -1, true) },
    ]),
    ...(['up','down'] as const).flatMap((key,i) => [
      { bind: key, run: () => vertical(i ? 1 : -1, false) }, { bind: `shift+${key}`, run: () => vertical(i ? 1 : -1, true) },
    ]),
    { bind:'ctrl+home',run:()=>edge(false,false) },{ bind:'ctrl+end',run:()=>edge(true,false) },
    { bind:'ctrl+shift+home',run:()=>edge(false,true) },{ bind:'ctrl+shift+end',run:()=>edge(true,true) },
  ] }))
  return <box flexDirection="column" padding={1} flexGrow={1} onMouseDown={props.panel.focus}>
    <text fg={context.theme.text.base}>Response annotations · {props.panel.presentation === 'panel' ? 'sidebar' : 'fullscreen (narrow terminal)'}</text>
    <text fg={context.theme.text.muted}>r response · Shift+arrows select · a highlight · n comment</text>
    <text fg={context.theme.text.muted}>e edit/remove · h sent refs · Ctrl+S send · f expand · Esc close</text>
    <Show when={source()} fallback={<text>Press r to choose a completed assistant response.</text>}>{s => <>
      <text fg={context.theme.text.muted}>{s().messageID} · part {s().part+1} · source Markdown</text>
      <text fg={context.theme.text.muted}>Range {selected().start}–{selected().end} · cursor {cursor()} · row {currentRow()+1}/{rows().length}</text>
      <box flexDirection="column" border borderStyle="single" paddingLeft={1} paddingRight={1}>
        <For each={visibleRows()}>{row => <text fg={context.theme.text.base}>
          <For each={[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(row.text)]}>{cell => {
            const position = row.start+cell.index
            const active = () => position >= selected().start && position < selected().end
            const marked = () => sourceNotes().filter(n => n.start === position)
            const annotated = () => sourceNotes().some(n => position >= n.start && position < n.end)
            return <><Show when={marked().length}><span style={{ fg: context.theme.text.muted }}>[{marked()[0]?.number}{marked().length > 1 ? `+${marked().length-1}` : ""}]</span></Show><span style={{ attributes: (active() || position===cursor() ? TextAttributes.INVERSE : 0) | (annotated() ? TextAttributes.UNDERLINE : 0) }}>{cell.segment === '\n' || cell.segment === '\r\n' ? '↵' : cell.segment === '\t' ? '→' : cell.segment}</span></>
          }}</For>
          <Show when={cursor()===s().text.length && row.end===s().text.length}><span style={{ attributes: TextAttributes.INVERSE }}> </span></Show>
        </text>}</For>
      </box>
    </>}</Show>
    <text fg={context.theme.text.muted}>{busy() ? 'Working…' : status()}</text>
    <text fg={context.theme.text.base}>Pending: {notes().length} · sent: {history().flatMap(b=>b.notes).length}</text>
    <For each={notes().slice(-4)}>{n=><text fg={context.theme.text.muted}>#{n.number} {n.comment || '(highlight only)'} · {n.quote.replace(/\s+/g,' ').slice(0,35)}</text>}</For>
  </box>
}
