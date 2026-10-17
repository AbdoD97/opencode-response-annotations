import { test, expect } from 'bun:test'
import { deferred, harness, fixtureState, admitted } from './panel-harness.tsx'
import { addNote, editNote } from '../src/model.ts'

// All admissions are mocked. These verify component ordering/retention, not a live model.
test('review: repeated send during confirmation admits only one batch', async () => {
  const h = await harness(); const gate = deferred<boolean>()
  try {
    h.controls.confirm = () => gate.promise
    await h.key('ctrl+s'); await h.key('ctrl+s')
    expect(h.controls.confirms).toBe(1)
    gate.resolve(true); await h.screen.waitFor(() => h.controls.closes === 1)
    expect(h.controls.calls).toHaveLength(1)
  } finally { gate.resolve(false); h.destroy() }
})

test('review: session switch during confirmation cancels stale send', async () => {
  const h = await harness(); const gate = deferred<boolean>()
  try {
    h.controls.confirm = () => gate.promise
    await h.key('ctrl+s'); h.setPanel('sessionID', 'b'); await h.screen.flush()
    gate.resolve(true); await h.screen.flush()
    expect(h.controls.calls).toHaveLength(0); expect(h.state.batches).toHaveLength(0)
    expect(h.state.notes[0].source.sessionID).toBe('a'); expect(h.controls.closes).toBe(0)
    expect(h.screen.captureCharFrame()).not.toContain('msg_source')
  } finally { gate.resolve(false); h.destroy() }
})

test('review: session switch during edit prompt prevents stale edit', async () => {
  const h = await harness(); const gate = deferred<string>()
  try {
    h.controls.select = async options => options.some(o => o.value === 'edit') ? 'edit' : options[0].value
    let editing = false
    h.controls.comment = () => { editing = true; return gate.promise }
    await h.key('e'); await h.screen.waitFor(() => editing)
    h.setPanel('sessionID', 'b'); await h.screen.flush()
    gate.resolve('stale edit'); await h.screen.flush()
    expect(h.state.notes[0].comment).toBe(''); expect(h.controls.updates).toBe(0)
  } finally { gate.resolve(''); h.destroy() }
})

test('review: session switch during action dialog prevents stale delete', async () => {
  const h = await harness(); const gate = deferred<unknown>()
  try {
    let managing = false
    h.controls.select = async options => {
      if (options.some(o => o.value === 'remove')) { managing = true; return gate.promise }
      return options[0].value
    }
    await h.key('e'); await h.screen.waitFor(() => managing)
    h.setPanel('sessionID', 'b'); await h.screen.flush()
    gate.resolve('remove'); await h.screen.flush()
    expect(h.state.notes).toHaveLength(1); expect(h.controls.updates).toBe(0)
  } finally { gate.resolve(undefined); h.destroy() }
})

test('review: concurrent note edit invalidates confirmation', async () => {
  const h = await harness(); const gate = deferred<boolean>()
  try {
    h.controls.confirm = () => gate.promise; await h.key('ctrl+s')
    await h.update(d => editNote(d, d.notes[0].id, 'changed elsewhere'))
    gate.resolve(true)
    await h.screen.waitFor(() => h.controls.errors.some(x => x.includes('changed during confirmation')))
    expect(h.controls.calls).toHaveLength(0); expect(h.state.batches).toHaveLength(0); expect(h.controls.closes).toBe(0)
  } finally { gate.resolve(false); h.destroy() }
})

test('review: new revert during confirmation blocks admission', async () => {
  const h = await harness(); const gate = deferred<boolean>()
  try {
    h.controls.confirm = () => gate.promise; await h.key('ctrl+s')
    h.controls.reverted = true; gate.resolve(true)
    await h.screen.waitFor(() => h.controls.errors.some(x => x.includes('revert changed')))
    expect(h.controls.calls).toHaveLength(0); expect(h.controls.closes).toBe(0)
  } finally { gate.resolve(false); h.destroy() }
})

test('review: failed prepared-state persistence never admits and keeps queue open', async () => {
  const h = await harness()
  try {
    h.controls.beforeUpdate = async () => { throw new Error('durable store unavailable') }
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.includes('durable store unavailable'))
    expect(h.controls.calls).toHaveLength(0); expect(h.state.notes).toHaveLength(1)
    expect(h.persisted().notes).toHaveLength(1); expect(h.state.batches).toHaveLength(0); expect(h.controls.closes).toBe(0)
  } finally { h.destroy() }
})

test('review: rejected admission retains durable prepared batch and retries exact ID/text', async () => {
  const h = await harness()
  try {
    h.controls.prompt = async () => { throw new Error('connection lost: admission outcome unknown') }
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.length === 1)
    expect(h.state.notes).toHaveLength(1); expect(h.persisted().batches[0].status).toBe('prepared')
    expect(h.controls.closes).toBe(0)
    h.controls.prompt = async input => admitted(input)
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.closes === 1)
    expect(h.controls.calls).toHaveLength(2)
    expect(h.controls.calls[1]).toEqual(h.controls.calls[0])
  } finally { h.destroy() }
})

for (const mismatch of ['id', 'sessionID', 'type', 'undefined'] as const) {
  test(`review: ${mismatch} admission mismatch never clears queue or closes`, async () => {
    const h = await harness()
    try {
      h.controls.prompt = async input => mismatch === 'undefined' ? undefined : { ...admitted(input), [mismatch]: 'wrong' }
      await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.length === 1)
      expect(h.controls.calls).toHaveLength(1); expect(h.controls.closes).toBe(0)
      expect(h.state.notes).toHaveLength(1); expect(h.persisted().batches[0].status).toBe('prepared')
    } finally { h.destroy() }
  })
}

test('review: accepted prompt with failed sent persistence survives restart and retries identical ID/text', async () => {
  const h = await harness()
  let restored = fixtureState(); let first: typeof h.controls.calls[number] | undefined
  try {
    h.controls.beforeUpdate = async ordinal => { if (ordinal === 2) throw new Error('durable store unavailable') }
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.includes('durable store unavailable'))
    expect(h.controls.calls).toHaveLength(1); expect(h.state.notes).toHaveLength(1)
    expect(h.controls.closes).toBe(0); expect(h.state.batches[0].status).toBe('prepared')
    restored = h.persisted(); first = h.controls.calls[0]
  } finally { h.destroy() }
  const r = await harness(restored)
  try {
    await r.screen.waitForFrame(f => f.includes('#1'))
    await r.key('ctrl+s'); await r.screen.waitFor(() => r.controls.closes === 1)
    expect(r.controls.calls[0]).toEqual(first)
    expect(r.persisted().batches[0].status).toBe('sent'); expect(r.state.notes).toHaveLength(0)
  } finally { r.destroy() }
})

test('review: successful in-flight send cannot close a different session panel', async () => {
  const h = await harness(); const gate = deferred<unknown>()
  try {
    h.controls.prompt = () => gate.promise
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.calls.length === 1)
    h.setPanel('sessionID', 'b'); await h.screen.flush()
    gate.resolve(admitted(h.controls.calls[0]))
    await h.screen.waitFor(() => h.state.batches[0].status === 'sent')
    expect(h.controls.closes).toBe(0); expect(h.state.notes).toHaveLength(0)
  } finally { gate.resolve(undefined); h.destroy() }
})

test('review: new notes and other-session notes survive successful batch', async () => {
  const h = await harness(); const gate = deferred<unknown>()
  try {
    h.controls.prompt = () => gate.promise
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.calls.length === 1)
    await h.update(d => {
      const source = d.notes[0].source
      addNote(d, source, 6, 10, 'new while sending', 'new')
      addNote(d, { ...source, sessionID: 'b' }, 0, 5, 'other session', 'other')
    })
    gate.resolve(admitted(h.controls.calls[0])); await h.screen.waitFor(() => h.controls.closes === 1)
    expect(h.state.notes.map(n => n.id)).toEqual(['new', 'other'])
    expect(h.state.batches[0].notes).toHaveLength(1)
  } finally { gate.resolve(undefined); h.destroy() }
})

test('review: leaving and returning to same session invalidates stale confirmation', async () => {
  const h = await harness(); const gate = deferred<boolean>()
  try {
    h.controls.confirm = () => gate.promise; await h.key('ctrl+s')
    h.setPanel('sessionID', 'b'); await h.screen.flush()
    h.setPanel('sessionID', 'a'); await h.screen.flush()
    gate.resolve(true); await h.screen.flush()
    expect(h.controls.calls).toHaveLength(0); expect(h.controls.closes).toBe(0)
    expect(h.state.notes).toHaveLength(1)
  } finally { gate.resolve(false); h.destroy() }
})

test('review: leaving and returning to same session invalidates stale edit dialog', async () => {
  const h = await harness(); const gate = deferred<string>()
  try {
    let editing = false
    h.controls.select = async options => options.some(o => o.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = () => { editing = true; return gate.promise }
    await h.key('e'); await h.screen.waitFor(() => editing)
    h.setPanel('sessionID', 'b'); await h.screen.flush()
    h.setPanel('sessionID', 'a'); await h.screen.flush()
    gate.resolve('stale edit'); await h.screen.flush()
    expect(h.state.notes[0].comment).toBe(''); expect(h.controls.updates).toBe(0)
  } finally { gate.resolve(''); h.destroy() }
})

test('review: late admission cannot close a replacement panel for the same session', async () => {
  const h = await harness(); const gate = deferred<unknown>()
  try {
    h.controls.prompt = () => gate.promise
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.calls.length === 1)
    let replacementCloses = 0
    h.setPanel('close', () => () => { replacementCloses++ })
    gate.resolve(admitted(h.controls.calls[0]))
    await h.screen.waitFor(() => h.state.batches[0].status === 'sent')
    expect(replacementCloses).toBe(0); expect(h.controls.closes).toBe(0)
  } finally { gate.resolve(undefined); h.destroy() }
})

for (const action of ['edit', 'remove'] as const) {
  test(`review: failed ${action} persistence retains original queue`, async () => {
    const h = await harness()
    try {
      h.controls.select = async options => options.some(o => o.value === action) ? action : options[0].value
      h.controls.comment = async () => 'must not persist'
      h.controls.beforeUpdate = async () => { throw new Error('write rejected') }
      await h.key('e'); await h.screen.waitFor(() => h.controls.errors.includes('write rejected'))
      expect(h.state.notes).toHaveLength(1); expect(h.state.notes[0].comment).toBe('')
      expect(h.persisted().notes[0].comment).toBe(''); expect(h.controls.closes).toBe(0)
      expect(h.controls.calls).toHaveLength(0)
    } finally { h.destroy() }
  })
}

test('review: uncertain prepared batch locks editing without losing retry payload', async () => {
  const h = await harness()
  try {
    h.controls.prompt = async () => { throw new Error('network uncertain') }
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.includes('network uncertain'))
    const prepared = JSON.stringify(h.persisted().batches[0])
    h.controls.select = async options => options.some(o => o.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = async () => 'must not change admitted batch'
    await h.key('e'); await h.screen.waitFor(() => h.controls.errors.some(x => x.includes('prepared batch before editing')))
    expect(h.state.notes[0].comment).toBe('')
    expect(JSON.stringify(h.persisted().batches[0])).toBe(prepared)
    expect(h.controls.calls).toHaveLength(1); expect(h.controls.closes).toBe(0)
  } finally { h.destroy() }
})

for (const change of ['session', 'revert'] as const) {
  test(`review: ${change} change while prepare saves blocks admission and preserves retry`, async () => {
    const h = await harness(); const gate = deferred<void>()
    try {
      h.controls.beforeUpdate = ordinal => ordinal === 1 ? gate.promise : Promise.resolve()
      await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.updates === 1)
      if (change === 'session') { h.setPanel('sessionID', 'b'); await h.screen.flush() }
      else h.controls.reverted = true
      gate.resolve(); await h.screen.waitFor(() => h.state.batches.length === 1)
      await h.screen.flush()
      expect(h.controls.calls).toHaveLength(0); expect(h.controls.closes).toBe(0)
      expect(h.persisted().batches[0].status).toBe('prepared'); expect(h.persisted().notes).toHaveLength(1)
    } finally { gate.resolve(); h.destroy() }
  })
}
