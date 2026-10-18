import { test, expect } from 'bun:test'
import { fixtureState, harness, deferred, admitted } from './panel-harness.tsx'
import { addNote } from '../src/model.ts'

test('real renderer: sidebar is a numbered note-only queue, not a source selector', async () => {
  const h = await harness(fixtureState(5))
  try {
    await h.screen.waitForFrame(f => f.includes('#5'))
    const frame = h.screen.captureCharFrame()
    expect(frame).toContain('Pending annotations · 5')
    for (let i = 1; i <= 5; i++) expect(frame).toContain(`#${i}`)
    expect(frame).toContain('(highlight only)')
    expect(frame).toContain('alpha')
    expect(frame).not.toContain('UNSELECTED_SOURCE_CONTEXT')
    expect(frame).not.toContain('SIBLING_SOURCE_CONTEXT')
    expect(frame).not.toContain('Choose assistant response')
    for (const oldBinding of ['r', 'a', 'n', 'shift+right', 'ctrl+end']) expect(h.bindings()).not.toContain(oldBinding)
    expect(h.controls.calls).toHaveLength(0)
  } finally { h.destroy() }
})

test('real renderer: edit/delete persist, stable numbers and exact snapshots survive restart', async () => {
  const h = await harness(fixtureState(2))
  let restored: ReturnType<typeof fixtureState>
  try {
    h.controls.select = async options => options.some(o => o.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = async () => 'Revised explanation'
    await h.key('e')
    await h.screen.waitFor(() => h.state.notes[0].comment === 'Revised explanation')
    await h.screen.waitForFrame(f => f.includes('Revised explanation'))
    h.controls.select = async options => options.some(o => o.value === 'remove') ? 'remove' : options[1].value
    await h.key('e')
    await h.screen.waitFor(() => h.state.notes.length === 1)
    expect(h.state.notes[0].number).toBe(1)
    expect(h.controls.calls).toHaveLength(0)
    expect(h.controls.closes).toBe(0)
    restored = h.persisted()
  } finally { h.destroy() }
  const r = await harness(restored!)
  try {
    await r.screen.waitForFrame(f => f.includes('Revised explanation'))
    expect(r.state.notes[0].source.responseParts?.[0].text).toBe('SIBLING_SOURCE_CONTEXT')
    await r.update(d => { addNote(d, d.notes[0].source, 6, 10, 'After restart', 'new-note') })
    expect(r.state.notes[1].number).toBe(3)
    expect(r.state.notes[0].quote).toBe('alpha')
  } finally { r.destroy() }
})

test('real renderer: successful Send closes only after admission and durable sent save', async () => {
  const h = await harness(fixtureState(2))
  const admission = deferred<unknown>(); const save = deferred<void>()
  try {
    h.controls.prompt = () => admission.promise
    h.controls.beforeUpdate = ordinal => ordinal === 2 ? save.promise : Promise.resolve()
    await h.key('ctrl+s')
    await h.screen.waitFor(() => h.controls.calls.length === 1)
    expect(h.controls.closes).toBe(0)
    expect(h.persisted().batches[0].status).toBe('prepared')
    const input = h.controls.calls[0]
    expect(input.sessionID).toBe('a'); expect(input.delivery).toBe('queue')
    expect(input.metadata).toEqual({ annotationBatch: input.id })
    expect(input.text).not.toContain('UNSELECTED_SOURCE_CONTEXT')
    expect(input.text).not.toContain('SIBLING_SOURCE_CONTEXT')
    expect(input.text).toContain('## Annotation #1')
    expect(input.text).not.toContain('msg_source')
    expect(h.controls.confirmMessages[0]).toContain('no nearby excerpts are added')
    admission.resolve(admitted(input))
    await h.screen.waitFor(() => h.controls.updates === 2)
    expect(h.controls.closes).toBe(0); expect(h.state.notes).toHaveLength(2)
    save.resolve()
    await h.screen.waitFor(() => h.controls.closes === 1)
    expect(h.persisted().notes).toHaveLength(0)
    expect(h.persisted().batches[0].status).toBe('sent')
    expect(h.controls.events).toEqual(['saved:1', 'prompt', 'saved:2', 'close'])
    await h.key('h'); await h.screen.waitForFrame(f => f.includes('Sent reference #1'))
  } finally { admission.resolve(undefined); save.resolve(); h.destroy() }
})

test('real renderer: cancel keeps queue, no admission, persistence or automatic close', async () => {
  const h = await harness()
  try {
    h.controls.confirm = async () => false
    await h.key('ctrl+s')
    expect(h.controls.calls).toHaveLength(0); expect(h.controls.updates).toBe(0)
    expect(h.controls.closes).toBe(0); expect(h.state.notes).toHaveLength(1)
    await h.key('escape'); expect(h.controls.closes).toBe(1)
  } finally { h.destroy() }
})
