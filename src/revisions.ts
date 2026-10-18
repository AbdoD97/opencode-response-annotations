import { createHash } from 'node:crypto'
import type { Source, Note, Batch, State } from './model.ts'

export type StoredNote = Omit<Note, 'source'> & { sourceRevision: string }
export type RevisionState = { version: 2; coordinates: 'utf16-selected-part-v1'; next: Record<string, number>; sources: Record<string, Source>; notes: StoredNote[]; batches: Array<Omit<Batch, 'notes'> & { notes: StoredNote[] }> }
export const sourceIdentity = (source: Source) => JSON.stringify([source.sessionID, source.messageID, source.part, source.text, source.responseParts?.map(p => [p.part, p.text]) ?? null])
export const revisionID = (source: Source) => 'sha256:' + createHash('sha256').update(sourceIdentity(source)).digest('hex')

// Pure codec: callers validate first. Every pending/sent/prepared reference is
// retained. Deleting the final pending reference can release its unused source.
export function packRevisions(state: State): RevisionState {
  const sources: Record<string, Source> = Object.create(null)
  const seen = new WeakMap<Source, string>()
  const pack = (note: Note): StoredNote => {
    let key = seen.get(note.source)
    if (!key) {
      key = revisionID(note.source); seen.set(note.source, key)
      if (sources[key] && sourceIdentity(sources[key]) !== sourceIdentity(note.source)) throw new Error('Source revision collision; nothing was changed')
      sources[key] ??= note.source
    }
    return { id: note.id, number: note.number, sourceRevision: key, start: note.start, end: note.end, quote: note.quote, comment: note.comment }
  }
  return { version: 2, coordinates: 'utf16-selected-part-v1', next: { ...state.next }, sources, notes: state.notes.map(pack), batches: state.batches.map(batch => ({ id: batch.id, sessionID: batch.sessionID, notes: batch.notes.map(pack), text: batch.text, status: batch.status, created: batch.created })) }
}
