import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRoot } from 'solid-js'
import { createStorage } from './fixtures/upstream-storage.ts'
import { annotationStore } from '../src/store-view.ts'
import { readStoredState, migrateStoredState, mutateStoredState, rollbackStoredState } from '../src/storage.ts'
import { initialState, addNote, editNote, noteContents, makeBatch, markSent } from '../src/model.ts'
import { changeStoreFile } from '../script/store-file.ts'
import { deferred, fixtureState, harness } from './panel-harness.tsx'
import type { Context } from '@opencode/plugin/tui/context'

const key = 'plugin.response-annotations.annotations-v1'
const src = { sessionID: 's', messageID: 'm', part: 0, text: 'Alpha beta' }
async function temporary() {
  const base = path.resolve(os.tmpdir()), root = await mkdtemp(path.join(base, 'annotation-host-test-'))
  const file = path.join(root, 'latest', 'tui', key + '.json')
  await mkdir(path.dirname(file), { recursive: true })
  return { root, file, async close() { if (path.dirname(root) !== base || !path.basename(root).startsWith('annotation-host-test-')) throw new Error('Unsafe cleanup path'); await rm(root, { recursive: true, force: true }) } }
}
function view(host: ReturnType<typeof createStorage>) {
  let dispose!: () => void
  const storage = { store: (name: string, options: { initial: object }) => host.storage.store('plugin.response-annotations.' + name, options) } as Context['storage']
  const store = createRoot(d => { dispose = d; return annotationStore(storage) })
  return { store, dispose }
}

test('pinned host locked load+atomic rename preserves concurrent windows and rejects stale confirmation', async () => {
  const tmp = await temporary(), raw = migrateStoredState(initialState())
  await writeFile(tmp.file, JSON.stringify(raw))
  const one = createStorage(tmp.root, 'latest'), two = createStorage(tmp.root, 'latest')
  const a = view(one), b = view(two)
  try {
    await Promise.all([a.store.update(s => addNote(s, src, 0, 5, 'A', 'a')), b.store.update(s => addNote(s, src, 6, 10, 'B', 'b'))])
    const latest = readStoredState(JSON.parse(await readFile(tmp.file, 'utf8')))
    expect(latest.notes).toHaveLength(2); expect(new Set(latest.notes.map(n => n.number)).size).toBe(2)
    const confirmed = noteContents(latest.notes)
    await b.store.update(s => { s.notes[0].comment = 'Changed in another window' })
    const before = await readFile(tmp.file)
    await expect(a.store.update(s => { if (noteContents(s.notes) !== confirmed) throw new Error('Review again'); makeBatch(s, 's', 'msg_should_not_prepare', 1) })).rejects.toThrow('Review again')
    expect(await readFile(tmp.file)).toEqual(before)
  } finally { a.dispose(); b.dispose(); one.close(); two.close(); await tmp.close() }
})

for (const action of ['edit', 'remove'] as const) {
  for (const changed of ['target', 'unrelated'] as const) {
    test(`two windows: ${action} ${changed === 'target' ? 'rejects a stale target' : 'preserves an unrelated concurrent edit'}`, async () => {
      const tmp = await temporary(); await writeFile(tmp.file, JSON.stringify(migrateStoredState(fixtureState(2))))
      const one = createStorage(tmp.root, 'latest'), two = createStorage(tmp.root, 'latest'), a = view(one), b = view(two)
      const transactionDone = deferred<void>()
      const h = await harness(JSON.parse(JSON.stringify(a.store.state)), { transaction: async mutation => {
        try { await a.store.update(mutation); return JSON.parse(JSON.stringify(a.store.state)) }
        finally { transactionDone.resolve() }
      } })
      const gate = deferred<string | undefined>(); let dialogOpen = false
      try {
        h.controls.select = async options => {
          if (options.some(o => o.value === action)) {
            if (action === 'remove') { dialogOpen = true; return gate.promise }
            return action
          }
          return options[0].value
        }
        h.controls.comment = () => { dialogOpen = true; return gate.promise }
        await h.key('e'); await h.screen.waitFor(() => dialogOpen)
        await b.store.update(s => editNote(s, changed === 'target' ? 'note-1' : 'note-2', 'Saved by window B'))
        const before = await readFile(tmp.file)
        gate.resolve(action === 'edit' ? 'Window A edit' : 'remove')
        await transactionDone.promise
        if (changed === 'target') {
          await h.screen.waitFor(() => h.controls.errors.some(message => message.includes('changed or was removed in another window')))
          // The toast is recorded before run().finally clears the busy signal.
          // Wait for the visible status instead of reading its previous frame.
          const frame = await h.screen.waitForFrame(frame => !frame.includes('Working.') && frame.replace(/\s+/g, ' ').includes('Review it again'))
          expect(frame.replace(/\s+/g, ' ')).toContain('Review it again')
          expect(await readFile(tmp.file)).toEqual(before)
          expect(readStoredState(JSON.parse(before.toString())).notes[0].comment).toBe('Saved by window B')
        } else {
          await h.screen.waitFor(() => h.controls.events.includes('saved:1'))
          const state = readStoredState(JSON.parse(await readFile(tmp.file, 'utf8')))
          expect(state.notes.find(n => n.id === 'note-2')?.comment).toBe('Saved by window B')
          expect(state.notes.find(n => n.id === 'note-1')?.comment).toBe(action === 'edit' ? 'Window A edit' : undefined)
          expect(h.controls.errors).toHaveLength(0)
        }
        expect(h.controls.calls).toHaveLength(0); expect(h.controls.closes).toBe(0)
      } finally { gate.resolve(undefined); h.destroy(); a.dispose(); b.dispose(); one.close(); two.close(); await tmp.close() }
    })
  }
}

for (const action of ['edit', 'remove'] as const) {
  test(`two windows: ${action} snapshot predates a reactive update while the note picker is open`, async () => {
    const tmp = await temporary(); await writeFile(tmp.file, JSON.stringify(migrateStoredState(fixtureState())))
    const one = createStorage(tmp.root, 'latest'), two = createStorage(tmp.root, 'latest'), a = view(one), b = view(two)
    const transactionDone = deferred<void>()
    const h = await harness(JSON.parse(JSON.stringify(a.store.state)), { transaction: async mutation => {
      try { await a.store.update(mutation); return JSON.parse(JSON.stringify(a.store.state)) }
      finally { transactionDone.resolve() }
    } })
    const gate = deferred<unknown>(); let displayed: unknown
    try {
      h.controls.select = async options => {
        if (options.some(o => o.value === action)) return action
        displayed = options[0].value
        return gate.promise
      }
      h.controls.comment = async () => 'Stale window A edit'
      await h.key('e'); await h.screen.waitFor(() => displayed !== undefined)
      await b.store.update(s => editNote(s, 'note-1', 'Saved while picker open'))
      // Emulate the host watcher reconciling a newer value into the same live
      // reactive note before the old dialog's selected option resolves.
      h.setState('notes', 0, 'comment', 'Saved while picker open')
      const before = await readFile(tmp.file)
      gate.resolve(displayed)
      await transactionDone.promise
      await h.screen.waitFor(() => h.controls.errors.some(message => message.includes('changed or was removed in another window')))
      expect(await readFile(tmp.file)).toEqual(before)
      expect(h.controls.calls).toHaveLength(0); expect(h.controls.closes).toBe(0)
    } finally { gate.resolve(undefined); h.destroy(); a.dispose(); b.dispose(); one.close(); two.close(); await tmp.close() }
  })
}

test('separate worker processes use the real published host Flock without losing notes', async () => {
  const tmp = await temporary(); await writeFile(tmp.file, JSON.stringify(migrateStoredState(initialState())))
  try {
    const workers = ['worker-a', 'worker-b'].map(id => Bun.spawn([process.execPath, 'run', path.join(import.meta.dir, 'fixtures/store-worker.ts'), tmp.root, id], { stdout: 'pipe', stderr: 'pipe', windowsHide: true }))
    for (const worker of workers) {
      const stderr = await new Response(worker.stderr).text(), code = await worker.exited
      if (code !== 0) throw new Error(`Fixture worker failed (${code}): ${stderr}`)
    }
    const state = readStoredState(JSON.parse(await readFile(tmp.file, 'utf8')))
    expect(state.notes.map(n => n.id).sort()).toEqual(['worker-a', 'worker-b'])
    expect(state.next.s).toBe(3)
  } finally { await tmp.close() }
})

test('concurrent windows prepare one frozen logical batch ID/text under the actual host lock', async () => {
  const tmp = await temporary(), old = initialState(); addNote(old, src, 0, 5, '', 'one')
  await writeFile(tmp.file, JSON.stringify(migrateStoredState(old)))
  const one = createStorage(tmp.root, 'latest'), two = createStorage(tmp.root, 'latest'), a = view(one), b = view(two)
  const prepared: Array<{ id: string; text: string }> = []
  try {
    await Promise.all([
      a.store.update(s => { const batch = makeBatch(s, 's', 'msg_window_a', 1); prepared.push({ id: batch.id, text: batch.text }) }),
      b.store.update(s => { const batch = makeBatch(s, 's', 'msg_window_b', 2); prepared.push({ id: batch.id, text: batch.text }) }),
    ])
    expect(prepared).toHaveLength(2); expect(prepared[0]).toEqual(prepared[1])
    expect(readStoredState(JSON.parse(await readFile(tmp.file, 'utf8'))).batches).toHaveLength(1)
  } finally { a.dispose(); b.dispose(); one.close(); two.close(); await tmp.close() }
})

test('failed sent-state transaction after admission retains prepared retry and later-window notes on restart', async () => {
  const tmp = await temporary(), old = initialState(); addNote(old, src, 0, 5, '', 'one')
  await writeFile(tmp.file, JSON.stringify(migrateStoredState(old)))
  const one = createStorage(tmp.root, 'latest'), two = createStorage(tmp.root, 'latest'), a = view(one), b = view(two)
  let text = ''
  try {
    await a.store.update(s => { text = makeBatch(s, 's', 'msg_frozen', 1).text })
    // Admission is a fixture; a physical disk fault/provider was not induced.
    await b.store.update(s => addNote(s, src, 6, 10, 'Added during admission', 'later'))
    await expect(a.store.update(s => { markSent(s, 'msg_frozen'); throw new Error('sent-state write failed') })).rejects.toThrow('sent-state')
    const restored = readStoredState(JSON.parse(await readFile(tmp.file, 'utf8')))
    const retried = makeBatch(restored, 's', 'different', 99)
    expect(retried.id).toBe('msg_frozen'); expect(retried.text).toBe(text)
    expect(restored.notes.map(n => n.id)).toEqual(['one', 'later'])
    await a.store.update(s => markSent(s, 'msg_frozen'))
    expect(readStoredState(JSON.parse(await readFile(tmp.file, 'utf8'))).notes.map(n => n.id)).toEqual(['later'])
  } finally { a.dispose(); b.dispose(); one.close(); two.close(); await tmp.close() }
})

test('host parse fallback and later corruption cannot overwrite malformed bytes with an empty queue', async () => {
  const tmp = await temporary(), corrupt = '{invalid personal store fixture'
  await writeFile(tmp.file, corrupt)
  const host = createStorage(tmp.root, 'latest'), a = view(host)
  try {
    expect(a.store.error).toContain('recovery')
    await expect(a.store.update(s => addNote(s, src, 0, 5, '', 'lost'))).rejects.toThrow('recovery')
    expect(await readFile(tmp.file, 'utf8')).toBe(corrupt)
  } finally { a.dispose(); host.close(); await tmp.close() }
})

test('fresh transactions refuse corruption even when another window has a stale valid display', async () => {
  const tmp = await temporary(); await writeFile(tmp.file, JSON.stringify(migrateStoredState(initialState())))
  const host = createStorage(tmp.root, 'latest'), a = view(host)
  try {
    await a.store.update(s => addNote(s, src, 0, 5, '', 'one'))
    await writeFile(tmp.file, 'not JSON')
    await expect(a.store.update(s => makeBatch(s, 's', 'msg_no_send', 1))).rejects.toThrow('recovery')
    expect(await readFile(tmp.file, 'utf8')).toBe('not JSON')
  } finally { a.dispose(); host.close(); await tmp.close() }
})

test('older cached host initial options cannot turn corrupt JSON into a writable empty legacy state', async () => {
  const tmp = await temporary(), corrupt = '{corrupt legacy fixture'; await writeFile(tmp.file, corrupt)
  const host = createStorage(tmp.root, 'latest')
  // Emulate a v0.2.1 generation registering this key before plugin hot reload.
  host.storage.store(key, { initial: initialState() })
  const a = view(host)
  try {
    expect(a.store.error).toContain('ambiguous empty legacy')
    await expect(a.store.update(s => addNote(s, src, 0, 5, '', 'replacement'))).rejects.toThrow('recovery')
    expect(await readFile(tmp.file, 'utf8')).toBe(corrupt)
  } finally { a.dispose(); host.close(); await tmp.close() }
})

test('explicit offline initialization creates a validated empty v2 store without replacing existing data', async () => {
  const tmp = await temporary()
  try {
    const result = await changeStoreFile(tmp.file, 'initialize', { apply: true, assertOffline: () => {} })
    expect(result.applied).toBe(true); expect(result.backup).toBeUndefined()
    const raw = JSON.parse(await readFile(tmp.file, 'utf8'))
    expect(raw.version).toBe(2); expect(readStoredState(raw).notes).toHaveLength(0)
    await expect(changeStoreFile(tmp.file, 'initialize', { apply: true, assertOffline: () => {} })).rejects.toThrow('refuses')
  } finally { await tmp.close() }
})

test('offline migration verifies an exact backup, preserves frozen retries, and rolls current data back losslessly', async () => {
  const tmp = await temporary(), old = initialState()
  addNote(old, src, 0, 5, 'Why?', 'n1'); const batch = makeBatch(old, 's', 'msg_old', 42); batch.text = 'Old JSON bytes\n{"exact":true}'
  const original = Buffer.from(JSON.stringify(old)); await writeFile(tmp.file, original)
  try {
    const result = await changeStoreFile(tmp.file, 'migrate', { apply: true, assertOffline: () => {} })
    expect(result.applied).toBe(true); expect(await readFile(result.backup!)).toEqual(original)
    const loaded = JSON.parse(await readFile(tmp.file, 'utf8'))
    expect(loaded.version).toBe(2); expect(readStoredState(loaded).batches[0]).toEqual(batch)
    mutateStoredState(loaded, s => { addNote(s, src, 6, 10, 'Later', 'n2'); markSent(s, 'msg_old') })
    await writeFile(tmp.file, JSON.stringify(loaded))
    await changeStoreFile(tmp.file, 'rollback', { apply: true, assertOffline: () => {} })
    expect(JSON.parse(await readFile(tmp.file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(rollbackStoredState(loaded))))
    expect(readStoredState(JSON.parse(await readFile(tmp.file, 'utf8'))).notes[0].id).toBe('n2')
  } finally { await tmp.close() }
})

test('interrupted migration, active-session guard and corrupt input leave original data untouched', async () => {
  const tmp = await temporary(), original = Buffer.from(JSON.stringify(initialState())); await writeFile(tmp.file, original)
  try {
    await expect(changeStoreFile(tmp.file, 'migrate', { apply: true, assertOffline: () => { throw new Error('OpenCode still running') } })).rejects.toThrow('still running')
    expect(await readFile(tmp.file)).toEqual(original)
    await expect(changeStoreFile(tmp.file, 'migrate', { apply: true, assertOffline: () => {}, beforeReplace: () => { throw new Error('interrupted') } })).rejects.toThrow('interrupted')
    expect(await readFile(tmp.file)).toEqual(original)
    expect((await readdir(path.dirname(tmp.file))).filter(n => n.endsWith('.migration.tmp'))).toHaveLength(0)
    const corrupt = Buffer.from('{bad schema'); await writeFile(tmp.file, corrupt)
    await expect(changeStoreFile(tmp.file, 'migrate', { apply: true, assertOffline: () => {} })).rejects.toThrow('Invalid annotation store JSON')
    await expect(changeStoreFile(tmp.file, 'initialize', { apply: true, assertOffline: () => {} })).rejects.toThrow('refuses')
    expect(await readFile(tmp.file)).toEqual(corrupt)
  } finally { await tmp.close() }
})

test('migration refuses a stale replacement if an uncooperative writer changes bytes before rename', async () => {
  const tmp = await temporary(); await writeFile(tmp.file, JSON.stringify(initialState()))
  try {
    await expect(changeStoreFile(tmp.file, 'migrate', { apply: true, assertOffline: () => {}, beforeReplace: () => writeFile(tmp.file, 'interleaved writer') })).rejects.toThrow('changed during migration')
    expect(await readFile(tmp.file, 'utf8')).toBe('interleaved writer')
  } finally { await tmp.close() }
})
