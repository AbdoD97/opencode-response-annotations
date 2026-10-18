import { test, expect } from 'bun:test'
import { OpenCode } from '@opencode/client'
import { harness, fixtureState } from './panel-harness.tsx'
import { addNote } from '../src/model.ts'

// Real published client request construction and plugin send path; fetch is an
// offline transport fixture. This is NOT the host/provider request compiler.
function transport() {
  const bodies: string[] = [], requests: Request[] = []
  let uncertain = false
  const client = OpenCode.make({ baseUrl: 'https://offline.invalid', fetch: (async (input: RequestInfo | URL, options?: RequestInit) => {
    const request = new Request(input, options), text = await request.text()
    requests.push(request); bodies.push(text)
    if (uncertain) { uncertain = false; throw new Error('Unknown admission outcome') }
    const body = JSON.parse(text), sessionID = decodeURIComponent(new URL(request.url).pathname.split('/').at(-2)!)
    return new Response(JSON.stringify({ data: { id: body.id, sessionID, type: 'user', time: { created: 1 }, payload: { text: body.text }, delivery: body.delivery } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch })
  return { client, bodies, requests, failOnce() { uncertain = true } }
}

test('draft CRUD/cancel make zero requests; explicit Send uses the actual fixed client envelope once', async () => {
  const wire = transport(), h = await harness(fixtureState(2))
  const earlier = { system: ['Stable system'], messages: [{ role: 'assistant', content: 'Earlier reply' }, { role: 'tool', id: 'tool_pair', content: 'Opaque provider state' }], tools: [{ name: 'existing_tool', parameters: { type: 'object' } }], providerOptions: { cache: 'host-owned', route: 'unchanged' } }
  const prefixBytes = JSON.stringify(earlier)
  h.controls.prompt = input => wire.client.session.prompt(input)
  try {
    h.controls.select = async options => options.some(o => o.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = async () => 'Why? 👩🏽‍💻\n```\nExact comment'
    await h.key('e'); await h.screen.waitFor(() => h.state.notes[0].comment.includes('Exact comment'))
    h.controls.select = async options => options.some(o => o.value === 'remove') ? 'remove' : options[1].value
    await h.key('e'); await h.screen.waitFor(() => h.state.notes.length === 1)
    await h.update(state => { addNote(state, state.notes[0].source, 6, 10, '', 'local_new') })
    expect(wire.bodies).toHaveLength(0)
    h.controls.confirm = async () => false; await h.key('ctrl+s')
    expect(wire.bodies).toHaveLength(0); expect(h.persisted().batches).toHaveLength(0)
    h.controls.confirm = async () => true; await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.closes === 1 || h.controls.errors.length > 0)
    expect(h.controls.errors).toEqual([])
    expect(wire.bodies).toHaveLength(1)
    const body = JSON.parse(wire.bodies[0]), request = wire.requests[0]
    expect(request.method).toBe('POST'); expect(new URL(request.url).pathname).toBe('/api/session/a/prompt')
    expect(request.headers.has('authorization')).toBe(false)
    expect(Object.keys(body).sort()).toEqual(['delivery', 'id', 'metadata', 'text'])
    expect(body.metadata).toEqual({ annotationBatch: body.id }); expect(body.delivery).toBe('queue')
    expect(body.text).toBe(h.persisted().batches[0].text)
    expect(body.text).not.toContain('UNSELECTED_SOURCE_CONTEXT'); expect(body.text).not.toContain('SIBLING_SOURCE_CONTEXT')
    expect(body.text).not.toContain('Response 1'); expect(body.text).not.toContain('msg_source')
    expect(body.text.split('Exact comment')).toHaveLength(2)
    expect(JSON.stringify(earlier)).toBe(prefixBytes)
    const appendedFixture = [...earlier.messages, { role: 'user', content: body.text }]
    expect(JSON.stringify(appendedFixture.slice(0, -1))).toBe(JSON.stringify(earlier.messages))
  } finally { h.destroy() }
})

test('actual client serializes identical ID/text/envelope after uncertain admission and durable restart', async () => {
  const wire = transport(), h = await harness()
  h.controls.prompt = input => wire.client.session.prompt(input); wire.failOnce()
  let restored = fixtureState()
  try {
    await h.key('ctrl+s'); await h.screen.waitFor(() => h.controls.errors.length > 0)
    expect(h.controls.closes).toBe(0); expect(h.state.notes).toHaveLength(1)
    restored = h.persisted(); expect(restored.batches[0].status).toBe('prepared')
  } finally { h.destroy() }
  const retry = await harness(restored); retry.controls.prompt = input => wire.client.session.prompt(input)
  try {
    await retry.key('ctrl+s'); await retry.screen.waitFor(() => retry.controls.closes === 1 || retry.controls.errors.length > 0)
    expect(retry.controls.errors).toEqual([])
    expect(wire.bodies).toHaveLength(2); expect(wire.bodies[1]).toBe(wire.bodies[0])
    expect(retry.persisted().batches[0].id).toBe(restored.batches[0].id)
    expect(retry.persisted().batches[0].text).toBe(restored.batches[0].text)
  } finally { retry.destroy() }
})
