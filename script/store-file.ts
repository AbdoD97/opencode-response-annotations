import { readFile, writeFile, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Flock } from '@opencode/util/flock'
import { initialState, noteContents } from '../src/model.ts'
import { readStoredState, migrateStoredState, rollbackStoredState } from '../src/storage.ts'
import type { State } from '../src/model.ts'

export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const frozen = (state: State) => JSON.stringify(state.batches.map(b => [b.id, b.sessionID, b.created, b.status, b.text, noteContents(b.notes)]))
export type Operation = 'migrate' | 'rollback' | 'initialize'
export async function changeStoreFile(file: string, operation: Operation, options: {
  apply: boolean; assertOffline: () => void | Promise<void>; beforeReplace?: () => void | Promise<void>
}) {
  if (!path.isAbsolute(file)) throw new Error('Use an explicit absolute annotation store file path')
  const parent = path.dirname(file), locks = path.join(parent, '..', 'locks')
  if (options.apply) await options.assertOffline()
  return Flock.withLock(file, async () => {
    if (options.apply) await options.assertOffline()
    const before = await readFile(file).catch(error => { if (operation === 'initialize' && error.code === 'ENOENT') return undefined; throw error })
    if (operation === 'initialize' && before !== undefined) throw new Error('Initialize refuses to replace an existing file, including corrupt data')
    let parsed: unknown
    if (before) {
      try { parsed = JSON.parse(before.toString('utf8')) }
      catch { throw new Error('Invalid annotation store JSON; original bytes were not replaced. Recover the file offline without resetting it.') }
    }
    const old = before === undefined ? initialState() : readStoredState(parsed, { allowEmptyLegacy: true })
    const next = operation === 'rollback' ? rollbackStoredState(parsed) : migrateStoredState(before === undefined ? old : parsed)
    if (frozen(old) !== frozen(readStoredState(next, { allowEmptyLegacy: true }))) throw new Error('Frozen batch content changed; migration refused')
    const output = Buffer.from(JSON.stringify(next)), oldHash = before && digest(before)
    const summary = { operation, format: next.version, beforeBytes: before?.length ?? 0, afterBytes: output.length, beforeSHA256: oldHash, afterSHA256: digest(output), notes: old.notes.length, batches: old.batches.length }
    if (!options.apply) return { ...summary, applied: false, backup: undefined }
    let backup: string | undefined
    if (before) {
      backup = `${file}.backup-${oldHash}.json`
      try { await writeFile(backup, before, { flag: 'wx' }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !before.equals(await readFile(backup))) throw error }
      if (!before.equals(await readFile(backup))) throw new Error('Backup verification failed; original untouched')
    }
    const temporary = `${file}.${process.pid}.${randomUUID()}.migration.tmp`
    try {
      const handle = await open(temporary, 'wx')
      try { await handle.writeFile(output); await handle.sync() } finally { await handle.close() }
      await options.beforeReplace?.()
      if (before) { if (!before.equals(await readFile(file))) throw new Error('Source changed during migration; refusing stale replacement') }
      else { try { await readFile(file); throw new Error('Another writer created the store') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
      if (path.dirname(temporary) !== parent) throw new Error('Temporary file escaped store directory')
      await rename(temporary, file)
    } catch (error) {
      if (path.dirname(temporary) === parent) await unlink(temporary).catch(() => {})
      throw error
    }
    return { ...summary, applied: true, backup }
  }, { dir: locks, timeoutMs: 2000 })
}
