import type { Source } from './model.ts'
import { isBoundary, LIMITS, assertSourceSize } from './model.ts'

/** Minimal public OpenTUI surface; no screen-coordinate to Markdown offset guesses. */
export interface SelectionNode {
  readonly id: string
  readonly parent: SelectionNode | null
  readonly isDestroyed?: boolean
}
export interface MarkdownNode extends SelectionNode { readonly content: string; readonly streaming: boolean }
export interface NativeSelection { readonly isDragging: boolean; readonly selectedRenderables: readonly SelectionNode[]; getSelectedText(): string }
export interface MessageSnapshot { id: string; type: string; time?: { created?: number; completed?: number }; content?: readonly { type: string; text?: string }[] }
export type Capture = { source: Source; start: number; end: number; quote: string; node: MarkdownNode; row: SelectionNode }
export const SUPPORTED_HOST = '2.0.32'

export function resolveSelection(input: {
  version: string; sessionID: string; reverted: boolean; selection: NativeSelection | null
  messages: readonly MessageSnapshot[]; isMarkdown: (node: SelectionNode) => node is MarkdownNode
}): Capture {
  if (input.version !== SUPPORTED_HOST && input.version !== '2.0.32-folding.1') throw new Error(`Native annotation adapter requires OpenCode ${SUPPORTED_HOST} or isolated 2.0.32-folding.1`)
  if (input.reverted) throw new Error('Resolve the session revert before annotating')
  const selection = input.selection
  if (!selection || selection.isDragging) throw new Error('Highlight a passage in the original assistant response first')
  if (selection.selectedRenderables.length > LIMITS.selectedNodes) throw new Error('Selection is too large. Select a shorter passage.')
  const quote = selection.getSelectedText()
  if (quote.length > LIMITS.sourceChars) throw new Error('Selected passage is too large. Select a shorter passage.')
  if (!quote || !quote.trim()) throw new Error('Select a non-empty passage')
  const markdown = new Set<MarkdownNode>()
  for (const selected of selection.selectedRenderables) {
    let node: SelectionNode | null = selected
    let depth = 0
    while (node && !input.isMarkdown(node)) {
      if (++depth > LIMITS.ancestorDepth) throw new Error('Selection render tree is too deep or cyclic; select another passage')
      node = node.parent
    }
    if (!node || !input.isMarkdown(node)) throw new Error('Selection must stay within one assistant response text part')
    markdown.add(node)
  }
  if (markdown.size !== 1) throw new Error('Selection must stay within one assistant response text part')
  const node = [...markdown][0]
  if (node.isDestroyed || node.streaming) throw new Error('Wait for the response to finish, then select again')
  if (node.content.length > LIMITS.sourceChars) throw new Error('Response is too large to annotate safely (100,000 characters per selected part). Use a shorter response.')
  if (input.messages.length > LIMITS.historyMessages) throw new Error('Session history is too large to annotate safely (10,000 messages). Use a shorter session.')
  const matches: Array<{message: MessageSnapshot; index: number; text: string}> = []
  let scannedChars = 0
  let scannedParts = 0
  for (const message of input.messages) {
    if (message.type !== 'assistant' || message.time?.completed === undefined) continue
    scannedParts += message.content?.length ?? 0
    if (scannedParts > LIMITS.historyParts) throw new Error('Session has too many content parts to annotate safely (100,000). Use a shorter session.')
    for (const [index, part] of (message.content ?? []).entries()) {
      if (part.type !== 'text' || part.text === undefined) continue
      scannedChars += part.text.length
      if (scannedChars > LIMITS.historyChars) throw new Error('Session text is too large to annotate safely (16 million characters). Use a shorter session.')
      if (part.text.trim() === node.content) matches.push({message,index,text:part.text})
      if (matches.length > 1) throw new Error('Response source is ambiguous or changed; select a different passage')
    }
  }
  if (matches.length !== 1) throw new Error('Response source is ambiguous or changed; select a different passage')
  const { message, index, text } = matches[0]
  // VERSION-COUPLED provenance adapter, NOT a supported semantic anchor API.
  // 2.0.32 TextPart renders Markdown -> padding wrapper -> SessionRowView.
  const row = node.parent?.parent
  const ordinal = (message.content ?? []).slice(0, index).filter(p => p.type === 'text').length
  if (!row || row.isDestroyed || ![message.id, `session-part:${message.id}:text:${ordinal}`].includes(row.id)) {
    throw new Error('Selection is not in a recognized main-transcript assistant text row')
  }
  const start = text.indexOf(quote)
  if (start < 0 || text.indexOf(quote, start + 1) !== -1) throw new Error('Selected text is formatted or repeated; an exact unique source passage is required')
  const end = start + quote.length
  if (!isBoundary(text, start) || !isBoundary(text, end)) throw new Error('Select complete characters')
  const source = { sessionID: input.sessionID, messageID: message.id, part: index, text,
    responseParts: (message.content ?? []).flatMap((p, part) => p.type === 'text' && p.text !== undefined ? [{ part, text: p.text }] : []) }
  assertSourceSize(source)
  return { source, start, end, quote, node, row }
}

export function validateCapture(capture: Capture, input: Omit<Parameters<typeof resolveSelection>[0], 'selection'>): void {
  const current = resolveSelection({ ...input, selection: { isDragging: false, selectedRenderables: [capture.node], getSelectedText: () => capture.quote } })
  if (current.row !== capture.row || JSON.stringify(current.source) !== JSON.stringify(capture.source) || current.start !== capture.start || current.end !== capture.end) {
    throw new Error('Response changed after selection; highlight it again')
  }
}
