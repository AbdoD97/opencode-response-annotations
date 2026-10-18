import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { changeStoreFile } from './store-file.ts'
import type { Operation } from './store-file.ts'

const [operation, file, ...flags] = process.argv.slice(2)
if (!['migrate', 'rollback', 'initialize'].includes(operation) || !file || flags.some(flag => !['--apply', '--offline'].includes(flag))) throw new Error('Usage: node script/manage-annotation-store.ts migrate|rollback|initialize ABSOLUTE_STORE_FILE [--apply --offline]')
const apply = flags.includes('--apply')
if (!path.isAbsolute(file)) throw new Error('Use the explicit absolute annotation store path')
if (apply && !flags.includes('--offline')) throw new Error('Close all OpenCode windows first; --apply requires --offline. No process will be closed for you.')
function assertOffline() {
  const output = process.platform === 'win32'
    ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '@(Get-Process -Name opencode,opencode2 -ErrorAction SilentlyContinue).Count'], { encoding: 'utf8', windowsHide: true }).trim()
    : execFileSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8' }).split('\n').filter(name => /^(opencode|opencode2)$/.test(path.basename(name.trim()))).length.toString()
  if (!/^0$/.test(output)) throw new Error('OpenCode may still be running. Offline migration refused; active sessions were not touched.')
}
console.log(JSON.stringify(await changeStoreFile(path.resolve(file), operation as Operation, { apply, assertOffline }), null, 2))
