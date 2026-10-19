import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = '594af423e8676b8458d6ef125ddde6766afad392'
const patchHash = 'd211ac624ae51697ad25718e47dd69865a1013762c9727f3f32f633b7f2a4f8d'
const patchedTree = 'c812f4e577eedc37527677ce403b236af68f8469'
const stage = process.argv[2]
const workspace = path.resolve(process.env.GITHUB_WORKSPACE ?? '.')
const candidate = path.join(workspace, 'candidate')
const host = path.join(workspace, 'preview-host')
const diagnostics = path.join(path.dirname(fileURLToPath(import.meta.url)), 'diagnostics')
const profile = path.join(process.env.RUNNER_TEMP ?? workspace, 'preview-test-profile')
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(profile, 'config'),
  XDG_DATA_HOME: path.join(profile, 'data'),
  XDG_STATE_HOME: path.join(profile, 'state'),
  XDG_CACHE_HOME: path.join(profile, 'cache'),
  OPENCODE_DISABLE_MODELS_FETCH: '1',
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_VERSION: '2.0.32-folding.1',
  OPENCODE_CHANNEL: 'folding',
  CI: '1',
}
let commandNumber = 0

function validateInput() {
  assert.match(process.env.CANDIDATE_SHA ?? '', /^[0-9a-f]{40}$/, 'Use a full lowercase commit SHA')
  assert.equal(process.env.GITHUB_REPOSITORY, 'AbdoD97/opencode-response-annotations')
  if (process.env.EXPECTED_PLATFORM) assert.equal(process.platform, process.env.EXPECTED_PLATFORM)
  if (process.env.EXPECTED_ARCH) assert.equal(process.arch, process.env.EXPECTED_ARCH)
}

async function run(cwd, executable, args, timeout = 180_000) {
  await mkdir(diagnostics, { recursive: true })
  const label = `${++commandNumber}-${path.basename(executable).replace(/[^a-z0-9]/gi, '')}`
  console.log(`\n${JSON.stringify({ cwd, executable, args })}`)
  let tail = Buffer.alloc(0)
  const output = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Command exceeded ${timeout}ms`)) }, timeout)
    const capture = chunk => {
      process.stdout.write(chunk)
      tail = Buffer.concat([tail, chunk]).subarray(-24_576)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => { clearTimeout(timer); resolve(code) })
  }).catch(async error => {
    await writeFile(path.join(diagnostics, `${label}.txt`), tail)
    throw error
  })
  await writeFile(path.join(diagnostics, `${label}.txt`), tail)
  assert.equal(output, 0, `${executable} ${args.join(' ')} failed`)
  return tail.toString('utf8')
}

const tuiTests = ['test/component/user-message-body.test.tsx', 'test/plugin/message-body.test.ts', 'test/plugin-message-body.test.tsx']
const panelTests = ['test/panel.test.tsx', 'test/review-edge-cases.test.tsx', 'test/native-selection.test.tsx', 'test/performance-lifecycle.test.tsx', 'test/comment-dialog.test.tsx']
const bunTest = (directory, files, preload = false) => run(directory, 'bun', ['test', '--timeout', '30000', ...(preload ? ['--preload', '@opentui/solid/preload'] : []), ...files])

async function repairPeerLayout() {
  // Placement only: preserve the installed lockfile-verified package bytes.
  const ui = path.join(host, 'packages/ui')
  const uiRequire = createRequire(path.join(ui, 'package.json'))
  const extension = uiRequire.resolve('marked-shiki')
  const extensionRequire = createRequire(extension)
  const uiMarked = JSON.parse(await readFile(uiRequire.resolve('marked/package.json'), 'utf8'))
  const peerMarked = JSON.parse(await readFile(extensionRequire.resolve('marked/package.json'), 'utf8'))
  assert.equal(uiMarked.version, '18.0.11')
  if (peerMarked.version === uiMarked.version) return
  assert.equal(peerMarked.version, '17.0.1')
  const source = path.join(host, 'node_modules/marked-shiki')
  const destination = path.join(ui, 'node_modules/marked-shiki')
  const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
  assert.equal(manifest.version, '1.2.1')
  await assert.rejects(lstat(destination), { code: 'ENOENT' })
  await assert.rejects(lstat(path.join(source, 'node_modules')), { code: 'ENOENT' })
  const files = await readdir(source, { recursive: true, withFileTypes: true })
  assert(files.every(entry => !entry.isSymbolicLink()), 'Do not copy dependency links')
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false })
  for (const entry of files.filter(entry => entry.isFile())) {
    const relative = path.relative(source, path.join(entry.parentPath, entry.name))
    assert.deepEqual(await readFile(path.join(source, relative)), await readFile(path.join(destination, relative)))
  }
  const repaired = createRequire(path.join(destination, 'index.js'))
  assert.equal(JSON.parse(await readFile(repaired.resolve('marked/package.json'), 'utf8')).version, uiMarked.version)
  console.log('Verified byte-identical marked-shiki 1.2.1 placement under UI; no lockfile/version changes')
}

async function prepare() {
  validateInput()
  assert.equal((await run(candidate, 'git', ['rev-parse', 'HEAD'])).trim(), process.env.CANDIDATE_SHA)
  assert.equal((await run(candidate, 'bun', ['--version'])).trim(), '1.4.3')
  const patch = path.join(candidate, 'host-patches/opencode-2.0.32-message-body.patch')
  assert.equal(createHash('sha256').update(await readFile(patch)).digest('hex'), patchHash)
  await mkdir(host) // Refuse reuse of a populated checkout/dependency layout.
  await run(host, 'git', ['init'])
  await run(host, 'git', ['remote', 'add', 'origin', 'https://github.com/anomalyco/opencode.git'])
  await run(host, 'git', ['-c', 'core.autocrlf=false', 'fetch', '--depth=1', 'origin', base])
  await run(host, 'git', ['-c', 'core.autocrlf=false', 'checkout', '--detach', 'FETCH_HEAD'])
  await run(host, 'git', ['apply', '--index', patch])
  assert.equal((await run(host, 'git', ['write-tree'])).trim(), patchedTree)
  await run(candidate, 'bun', ['install', '--frozen-lockfile', '--ignore-scripts'], 240_000)
  await run(host, 'bun', ['install', '--linker=hoisted', '--filter', '@opencode/cli', '--filter', '@opencode/tui', '--filter', '@opencode/plugin', '--filter', '@opencode/core', '--filter', '@opencode/util', '--filter', '@opencode/ai', '--frozen-lockfile', '--ignore-scripts'], 240_000)
  await repairPeerLayout()
}

async function bulk() {
  assert.equal(process.platform, 'linux')
  const unit = (await readdir(path.join(candidate, 'test'))).filter(name => name.endsWith('.test.ts')).sort().map(name => `test/${name}`)
  await run(candidate, 'node', ['--test', '--test-isolation=none', ...unit])
  await bunTest(candidate, panelTests, true)
  await bunTest(candidate, ['test/host-storage.test.tsx', 'test/client-request.test.tsx'], true)
  await bunTest(path.join(host, 'packages/tui'), tuiTests)
  await bunTest(path.join(host, 'packages/core'), ['test/session-runner-message.test.ts', 'test/session-model-request.test.ts', 'test/session-model-request-hooks.test.ts'])
  await bunTest(path.join(host, 'packages/ai'), ['test/compile.test.ts', 'test/cache-policy.test.ts', 'test/compaction.test.ts', 'test/tool-history.test.ts'])
  for (const directory of [candidate, path.join(host, 'packages/tui'), path.join(host, 'packages/plugin')]) await run(directory, 'bun', ['run', 'typecheck'])
  await run(candidate, 'bun', ['script/build.ts'])
  await run(host, 'git', ['diff', '--exit-code'])
}

async function native() {
  validateInput()
  assert(['win32', 'darwin'].includes(process.platform))
  await run(candidate, 'node', ['--test', '--test-isolation=none', 'test/presentation.test.ts'])
  await bunTest(candidate, ['test/native-selection.test.tsx', 'test/comment-dialog.test.tsx'], true)
  await bunTest(path.join(host, 'packages/tui'), tuiTests)
  const target = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-darwin-arm64'
  const output = path.resolve(host, 'packages/cli/dist-ci-preview')
  const cli = await realpath(path.join(host, 'packages/cli'))
  assert.equal(path.dirname(output), cli, 'Upstream build deletes output: keep it inside the fresh CLI checkout')
  await run(host, 'bun', ['packages/cli/script/build.ts', `--target=${target}`, '--skip-install', '--skip-web-ui', '--outdir=dist-ci-preview'], 360_000)
  const binary = path.join(output, target.replace('opencode-', 'cli-'), 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode')
  assert.match(await run(host, binary, ['--version'], 30_000), /opencode v2\.0\.32-folding\.1/)
  await run(host, 'git', ['diff', '--exit-code'])
}

try {
  if (stage === 'input') {
    validateInput()
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `candidate_sha=${process.env.CANDIDATE_SHA}\n`)
    console.log(`Validated candidate ${process.env.CANDIDATE_SHA} on ${process.platform}/${process.arch}`)
  } else if (stage === 'prepare') await prepare()
  else if (stage === 'bulk') await bulk()
  else if (stage === 'native') await native()
  else if (stage === 'plan') console.log(JSON.stringify({ base, patchHash, patchedTree, candidate, host, profile, limits: 'Linux 10m; Windows/macOS 15m; per-command tail 24KiB; no binary upload' }, null, 2))
  else throw new Error('Stage must be input, prepare, bulk, native or plan')
} catch (error) {
  await mkdir(diagnostics, { recursive: true })
  await writeFile(path.join(diagnostics, 'failure.txt'), String(error.stack ?? error).slice(-16_384))
  console.error(error)
  process.exitCode = 1
}
