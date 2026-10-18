// Pure synthetic codec/prepare timings plus the pinned host filesystem store.
// No user file, running OpenCode instance, model/provider or network is used.
import { performance } from 'node:perf_hooks'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { initialState, addNote, makeBatch, markSent } from '../src/model.ts'
import { migrateStoredState, readStoredState, mutateStoredState } from '../src/storage.ts'
import { createStorage } from '../test/fixtures/upstream-storage.ts'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
const results: unknown[] = []
function summary(times: number[]) { times.sort((a,b) => a-b); return { medianMs: +times[Math.floor(times.length / 2)].toFixed(3), p95Ms: +times[Math.min(times.length - 1, Math.ceil(times.length * .95) - 1)].toFixed(3) } }
function bench(name: string, fn: () => void, iterations = 15) { for (let i = 0; i < 3; i++) fn(); const times = []; for (let i = 0; i < iterations; i++) { const start = performance.now(); fn(); times.push(performance.now() - start) } return { name, iterations, ...summary(times) } }
for (const count of [1, 10, 100]) {
  const state = initialState(), text = 'Alpha ' + 'Unselected source. '.repeat(600).slice(0, 9994)
  const source = { sessionID: 's', messageID: 'm', part: 0, text, responseParts: [{ part: 0, text }] }
  for (let i = 0; i < count; i++) addNote(state, source, 0, 5, i ? `Comment ${i}` : '', `n${i}`)
  const packed = migrateStoredState(state), prepared = clone(packed)
  const expandedPrepared = clone(state); makeBatch(expandedPrepared, 's', 'msg_batch', 1)
  mutateStoredState(prepared, s => { makeBatch(s, 's', 'msg_batch', 1) })
  const expandedSent = clone(expandedPrepared), sent = clone(prepared)
  markSent(expandedSent, 'msg_batch'); mutateStoredState(sent, s => markSent(s, 'msg_batch'))
  const measurements = [
    bench('read/validate v1', () => { readStoredState(state) }),
    bench('read/validate v2', () => { readStoredState(packed) }),
    bench('prepare v1 including validation/encoding', () => { mutateStoredState(clone(state), s => { makeBatch(s, 's', 'msg_b', 1) }) }),
    bench('prepare v2 including validation/encoding', () => { mutateStoredState(clone(packed), s => { makeBatch(s, 's', 'msg_b', 1) }) }),
  ]
  const base = path.resolve(os.tmpdir()), root = await mkdtemp(path.join(base, 'annotation-storage-bench-'))
  const hostTimings: Record<string, unknown> = {}
  try {
    for (const [name, value] of [['v1', state], ['v2', packed]] as const) {
      const key = `fixture-${name}`, file = path.join(root, 'latest', 'tui', key + '.json')
      await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value))
      const host = createStorage(root, 'latest')
      try {
        const [, update] = host.storage.store<object>(key, { initial: { version: 0 } })
        const times = []
        for (let i = 0; i < 12; i++) { const start = performance.now(); await update(raw => mutateStoredState(raw, s => { s.notes[0].comment = `Edit ${i}` })); if (i >= 2) times.push(performance.now() - start) }
        hostTimings[name] = { iterations: times.length, ...summary(times) }
      } finally { host.close() }
    }
  } finally { if (path.dirname(root) !== base || !path.basename(root).startsWith('annotation-storage-bench-')) throw new Error('Unsafe benchmark cleanup'); await rm(root, { recursive: true, force: true }) }
  results.push({ notes: count, sourceUTF16Units: text.length, sourceRevisions: Object.keys(packed.sources).length,
    bytes: { pending: { v1: bytes(state), v2: bytes(packed) }, prepared: { v1: bytes(expandedPrepared), v2: bytes(prepared) }, sent: { v1: bytes(expandedSent), v2: bytes(sent) }, promptText: Buffer.byteLength(prepared.batches[0].text) }, measurements, hostLockedEditWithAtomicRename: hostTimings })
}
console.log(JSON.stringify({ environment: { runtime: typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`, platform: process.platform, arch: process.arch }, scope: 'Synthetic sources; codec/prepare CPU and adapted pinned host filesystem storage. Not full TUI latency, a physical disk fault, model context, cache hits, tokens or billing.', results }, null, 2))
