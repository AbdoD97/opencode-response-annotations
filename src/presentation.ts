import { batchLayout, type Batch } from './model.ts'

// Structural bridge for the proposed, feature-detected host API v1. No runtime
// import from an unreleased SDK; labels and ranges use the public contract.
export type BodyInput = { readonly source: { readonly sessionID: string; readonly messageID: string; readonly revision: number }; readonly text: string; readonly metadata?: Readonly<Record<string, unknown>> }
export type BodyPlan = { readonly source: BodyInput['source']; readonly label: string; readonly items: ReturnType<typeof batchLayout>['items'] }
export type BodyAPI = { readonly version: 1; register(presenter: { name: string; present(input: BodyInput): BodyPlan | undefined }): () => void }

/** Index only saved batches. Exact ownership and byte-preserving equality are
 * mandatory; headings in ordinary user text are never recognized as cards. */
export function batchPresenter(batches: readonly Batch[]) {
  const index = new Map(batches.map(batch => [batch.sessionID + '\0' + batch.id, batch]))
  const layouts = new WeakMap<Batch, ReturnType<typeof batchLayout>>()
  return (input: BodyInput): BodyPlan | undefined => {
    if (input.metadata?.annotationBatch !== input.source.messageID) return
    const batch = index.get(input.source.sessionID + '\0' + input.source.messageID)
    if (!batch || batch.text !== input.text) return
    let layout = layouts.get(batch)
    if (!layout) { layout = batchLayout(batch.notes); layouts.set(batch, layout) }
    if (layout.text !== batch.text) return // Unknown historical formatter: raw fallback.
    return { source: input.source, label: `Annotations (${layout.items.length})`, items: layout.items }
  }
}
