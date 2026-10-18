import { isBoundary, LIMITS, noteValue } from './model.ts'
import type { State, Source, Note, Batch } from './model.ts'
import { packRevisions, revisionID, sourceIdentity } from './revisions.ts'
import type { RevisionState } from './revisions.ts'

// The pinned host returns its initial value on missing/unreadable/corrupt JSON.
// An invalid sentinel must never be accepted as a writable empty queue.
export const UNINITIALIZED_STORE = { version: 0, recoveryRequired: true } as const
export type StoredState = State | RevisionState
const fail = (message: string): never => { throw new Error(`Annotation store needs recovery: ${message}. Original data was not replaced.`) }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is not an object`)
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`unknown ${label} fields`)
}
function string(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.length)) fail(`invalid ${label}`)
  return value as string
}
function integer(value: unknown, label: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) fail(`invalid ${label}`)
  return value as number
}
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) fail(`invalid ${label}`); return value as unknown[] }
function source(value: unknown): Source {
  const raw = object(value, 'source'); keys(raw, ['sessionID', 'messageID', 'part', 'text', 'responseParts'], 'source')
  const result: Source = { sessionID: string(raw.sessionID, 'source session', true), messageID: string(raw.messageID, 'source message', true), part: integer(raw.part, 'part'), text: string(raw.text, 'snapshot') }
  if (raw.responseParts !== undefined) {
    const parts = array(raw.responseParts, 'response parts').map(value => { const p = object(value, 'text part'); keys(p, ['part', 'text'], 'text part'); return { part: integer(p.part, 'text part'), text: string(p.text, 'text part snapshot') } })
    if (new Set(parts.map(p => p.part)).size !== parts.length) fail('duplicate text part indices')
    const selected = parts.find(p => p.part === result.part)
    if (selected && selected.text !== result.text) fail('selected snapshot differs from response parts')
    result.responseParts = parts
  }
  return result
}
export function readStoredState(value: unknown, options: { allowEmptyLegacy?: boolean } = {}): State {
  const raw = object(value, 'state')
  if (raw.version !== 1 && raw.version !== 2) fail('uninitialized, corrupt or unsupported state; initialize/recover it offline and restart OpenCode')
  keys(raw, raw.version === 1 ? ['version', 'next', 'notes', 'batches'] : ['version', 'coordinates', 'next', 'sources', 'notes', 'batches'], 'state')
  if (raw.version === 2 && raw.coordinates !== 'utf16-selected-part-v1') fail('unsupported source coordinate convention')
  const next: Record<string, number> = Object.create(null)
  for (const [session, value] of Object.entries(object(raw.next, 'number counters'))) next[session] = integer(value, 'next number', 1)
  const sources: Record<string, Source> = Object.create(null)
  if (raw.version === 2) for (const [key, value] of Object.entries(object(raw.sources, 'revisions'))) {
    const snapshot = source(value)
    if (key !== revisionID(snapshot)) fail('source revision hash mismatch')
    sources[key] = snapshot
  }
  const referenced = new Set<string>()
  const legacySources = new Map<string, Source>()
  const readNote = (value: unknown): Note => {
    const n = object(value, 'note'); keys(n, ['id', 'number', raw.version === 1 ? 'source' : 'sourceRevision', 'start', 'end', 'quote', 'comment'], 'note')
    let snapshot = raw.version === 1 ? source(n.source) : sources[string(n.sourceRevision, 'source revision', true)]
    if (!snapshot) fail('missing source revision')
    if (raw.version === 1) {
      const key = sourceIdentity(snapshot), existing = legacySources.get(key)
      if (existing) snapshot = existing
      else legacySources.set(key, snapshot)
    }
    if (raw.version === 2) referenced.add(n.sourceRevision as string)
    const note: Note = { id: string(n.id, 'note ID', true), number: integer(n.number, 'note number', 1), source: snapshot, start: integer(n.start, 'start'), end: integer(n.end, 'end'), quote: string(n.quote, 'quote'), comment: string(n.comment, 'comment') }
    if (note.start >= note.end || note.end > snapshot.text.length || snapshot.text.slice(note.start, note.end) !== note.quote || !isBoundary(snapshot.text, note.start) || !isBoundary(snapshot.text, note.end)) fail('quote/range does not match the exact source')
    return note
  }
  const notes = array(raw.notes, 'pending notes').map(readNote)
  const batches: Batch[] = array(raw.batches, 'batches').map(value => {
    const b = object(value, 'batch'); keys(b, ['id', 'sessionID', 'notes', 'text', 'status', 'created'], 'batch')
    if (b.status !== 'prepared' && b.status !== 'sent') fail('invalid batch status')
    const batch: Batch = { id: string(b.id, 'batch ID', true), sessionID: string(b.sessionID, 'batch session', true), notes: array(b.notes, 'batch notes').map(readNote), text: string(b.text, 'frozen batch text'), status: b.status as Batch['status'], created: integer(b.created, 'batch time') }
    if (!batch.notes.length || batch.notes.some(note => note.source.sessionID !== batch.sessionID)) fail('empty or cross-session batch')
    return batch
  })
  if (raw.version === 1 && !notes.length && !batches.length && !Object.keys(next).length && !options.allowEmptyLegacy)
    fail('ambiguous empty legacy state (possibly an older cached host fallback); initialize/migrate offline')
  if (new Set(notes.map(n => n.id)).size !== notes.length || new Set(batches.map(b => b.id)).size !== batches.length) fail('duplicate pending/batch IDs')
  const prepared = batches.filter(b => b.status === 'prepared')
  if (new Set(prepared.map(b => b.sessionID)).size !== prepared.length) fail('multiple prepared batches for one session')
  const identities = new Map<string, string>(), numbers = new Map<string, string>()
  const revisionCache = new WeakMap<Source, string>()
  for (const list of [notes, ...batches.map(b => b.notes)]) {
    if (new Set(list.map(n => n.id)).size !== list.length) fail('duplicate batch note IDs')
    for (const n of list) {
      let revision = revisionCache.get(n.source)
      if (!revision) { revision = revisionID(n.source); revisionCache.set(n.source, revision) }
      const contents = JSON.stringify(noteValue(n, revision)), prior = identities.get(n.id), numberKey = JSON.stringify([n.source.sessionID, n.number])
      if (prior !== undefined && prior !== contents) fail('conflicting copies of one note')
      if (numbers.has(numberKey) && numbers.get(numberKey) !== n.id) fail('reused annotation number')
      if (!(next[n.source.sessionID] > n.number)) fail('number counter would reuse a historical number')
      identities.set(n.id, contents); numbers.set(numberKey, n.id)
    }
  }
  const pendingIDs = new Set(notes.map(n => n.id))
  // Each note has at most one owning batch. Its only permitted second copy is
  // the identical pending note retained while that one batch is prepared.
  const owners = new Map<string, string>()
  for (const batch of batches) for (const note of batch.notes) {
    if (owners.has(note.id)) fail('one note belongs to multiple batches')
    owners.set(note.id, batch.id)
    if (batch.status === 'sent' && pendingIDs.has(note.id)) fail('sent note remains in pending queue')
    if (batch.status === 'prepared' && !pendingIDs.has(note.id)) fail('prepared note missing or changed in pending queue')
  }
  if (raw.version === 2 && referenced.size !== Object.keys(sources).length) fail('unreferenced source revision; recover it explicitly instead of silently dropping data')
  return { version: 1, next, notes, batches, ...(raw.version === 2 ? { storageFormat: 2 as const } : {}) }
}
export function writeStoredState(state: State, format: 1 | 2): StoredState {
  const result: StoredState = format === 2 ? packRevisions(state) : { version: 1, next: state.next, notes: state.notes, batches: state.batches }
  readStoredState(result)
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > LIMITS.storageBytes) throw new Error('Annotation storage would exceed 8 MB. Existing data was not changed.')
  return result
}
export function mutateStoredState(raw: object, mutation: (state: State) => void): void {
  const state = readStoredState(raw), format = (raw as { version: 1 | 2 }).version
  mutation(state)
  const next = writeStoredState(state, format)
  for (const key of Object.keys(raw)) delete (raw as Record<string, unknown>)[key]
  Object.assign(raw, next)
}
export function migrateStoredState(raw: unknown): RevisionState { return writeStoredState(readStoredState(raw, { allowEmptyLegacy: true }), 2) as RevisionState }
export function rollbackStoredState(raw: unknown): State {
  const state = readStoredState(raw, { allowEmptyLegacy: true })
  // Lossless export may exceed the old write cap; never discard data to fit it.
  const result: State = { version: 1, next: state.next, notes: state.notes, batches: state.batches }
  readStoredState(result, { allowEmptyLegacy: true })
  return result
}
