import type { Context } from '@opencode/plugin/tui/context'
import { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/solid'
import { createMemo, createSignal, onMount } from 'solid-js'
import { LIMITS } from './model.ts'

export type CommentInput = { title: string; quote: string; value?: string; placeholder?: string }

// Preview-only escaping: terminal/bidi controls are visible rather than active.
// The original quote is never changed, reparsed as Markdown or returned as input.
export const previewText = (quote: string) => quote.replace(/\r\n/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
  character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)

export function promptComment(context: Context, input: CommentInput): Promise<string | undefined> {
  return new Promise(resolve => {
    let settled = false
    const done = (value: string | undefined) => { if (settled) return false; settled = true; resolve(value); return true }
    context.ui.dialog.show(() => <CommentDialog context={context} {...input} onSubmit={comment => {
      if (done(comment)) context.ui.dialog.clear()
    }} />, () => done(undefined))
  })
}

export function CommentDialog(props: CommentInput & { context: Context; onSubmit: (comment: string) => void }) {
  const dimensions = useTerminalDimensions()
  const [editor, setEditor] = createSignal<TextareaRenderable>()
  let preview: ScrollBoxRenderable | undefined
  const quote = createMemo(() => previewText(props.quote))
  const available = () => Math.max(6, dimensions().height - 6)
  const inputRows = () => available() >= 12 ? 3 : 1
  const quoteRows = () => Math.max(1, Math.min(8, available() - inputRows() - 4))
  const submit = () => {
    const input = editor()
    if (!input || input.isDestroyed) return
    if (input.plainText.length > LIMITS.commentChars) {
      props.context.ui.toast.show({ message: 'Comment is too long (20,000 characters maximum). Shorten it before saving.', variant: 'error' })
      return
    }
    props.onSubmit(input.plainText)
  }
  props.context.keymap.layer(() => ({ mode: 'modal', priority: 1, target: editor, enabled: !!editor(), commands: [
    { bind: 'return', run: submit },
    { bind: 'ctrl+return', run: submit },
    { bind: 'pageup', run: () => preview?.scrollBy(-Math.max(1, quoteRows() - 1)) },
    { bind: 'pagedown', run: () => preview?.scrollBy(Math.max(1, quoteRows() - 1)) },
  ] }))
  onMount(() => {
    props.context.ui.dialog.set({ size: 'large' })
    editor()?.focus()
    editor()?.gotoLineEnd()
  })
  return <box id="response-annotations.comment" width="100%" flexDirection="column" paddingX={1}>
    <text flexShrink={0} fg={props.context.theme.text.base}>{props.title}</text>
    <text flexShrink={0} fg={props.context.theme.text.muted}>Quote (PgUp/PgDn)</text>
    <scrollbox id="response-annotations.quote" height={quoteRows()} minHeight={1} flexShrink={0}
      scrollX={false} scrollY={true} ref={node => { preview = node; node.focusable = false }}>
      <text id="response-annotations.quote.text" fg={props.context.theme.text.muted} wrapMode="word" selectable={false}>{quote()}</text>
    </scrollbox>
    <text flexShrink={0} fg={props.context.theme.text.muted}>Comment (optional)</text>
    <textarea id="response-annotations.comment.input" ref={setEditor} height={inputRows()} flexShrink={0}
      initialValue={props.value ?? ''} placeholder={props.placeholder ?? 'Leave blank for highlight only'} wrapMode="word"
      textColor={props.context.theme.text.base} focusedTextColor={props.context.theme.text.base}
      onSubmit={submit} />
    <text id="response-annotations.comment.footer" flexShrink={0} fg={props.context.theme.text.muted}>Enter:save Esc:back</text>
  </box>
}
