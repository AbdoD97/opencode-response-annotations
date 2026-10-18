import type { Batch } from './model.ts'

// One append-only user prompt. Do not include drafts, source snapshots, tools,
// history transforms, model/provider overrides, routing headers or cache options.
export const batchPrompt = (batch: Batch) => ({
  sessionID: batch.sessionID, id: batch.id, text: batch.text,
  delivery: 'queue' as const, metadata: { annotationBatch: batch.id },
})
