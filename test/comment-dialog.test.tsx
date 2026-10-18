import { test, expect } from 'bun:test'
import { parseKeypress, ScrollBoxRenderable, TextRenderable } from '@opentui/core'
import stringWidth from 'string-width'
import { pluginHarness, findRenderable } from './plugin-harness.tsx'
import { deferred, harness } from './panel-harness.tsx'
import { previewText } from '../src/comment-dialog.tsx'
import { initialState, addNote, makeBatch, LIMITS } from '../src/model.ts'

for (const kitty of [false, true]) {
  test(`actual keymap: F6 captures with composer focused (${kitty ? 'Kitty' : 'legacy'} input), palette/cancel/revert stay safe`, async () => {
    const h = await pluginHarness({ kitty })
    try {
      await h.selectQuote()
      expect(h.composer.focused).toBe(true)
      h.screen.mockInput.pressKey('F6')
      await h.screen.waitForFrame(frame => frame.includes('Add annotation') && frame.includes('Alpha'))
      expect(h.input()?.focused).toBe(true)
      await h.screen.mockInput.typeText('Explain this')
      h.screen.mockInput.pressEnter()
      await h.screen.waitFor(() => h.state().notes.length === 1)
      expect(h.state().notes[0].quote).toBe('Alpha'); expect(h.state().notes[0].comment).toBe('Explain this')
      expect(h.opens()).toBe(1); expect(h.requests()).toBe(0); expect(h.composer.plainText).toBe(h.originalComposer)
      await h.selectQuote(); h.keymap.dispatchCommand('response-annotations.capture')
      await h.screen.waitForFrame(frame => frame.includes('Add annotation'))
      await h.screen.mockInput.typeText('cancel me'); h.screen.mockInput.pressEscape()
      await h.screen.waitFor(() => !h.input())
      expect(h.state().notes).toHaveLength(1); expect(h.composer.plainText).toBe(h.originalComposer)
      await h.selectQuote(); h.setSession('revert', true); await h.screen.flush(); h.setSession('revert', false); await h.screen.flush()
      h.screen.mockInput.pressKey('F6'); await h.screen.waitFor(() => h.errors.length > 0)
      expect(h.state().notes).toHaveLength(1); expect(h.requests()).toBe(0)
    } finally { h.destroy() }
  })
}

test('actual parser/keymap distinguishes legacy Ctrl+A from Ctrl+Shift+A; F6 honors a configured command binding', async () => {
  const h = await pluginHarness({ configuredCapture: 'f8' })
  try {
    const legacy = parseKeypress(String.fromCharCode(1), { useKittyKeyboard: true })!
    expect(legacy.ctrl).toBe(true); expect(legacy.shift).toBe(false)
    expect(h.keymap.createKeyMatcher('ctrl+shift+a')(legacy)).toBe(false)
    expect(h.keymap.createKeyMatcher('f6')(parseKeypress('\x1b[17~')!)).toBe(true)
    await h.selectQuote(); h.screen.mockInput.pressKey('F6'); await h.screen.flush()
    expect(h.input()).toBeUndefined()
    h.screen.mockInput.pressKey('F8'); await h.screen.waitForFrame(frame => frame.includes('Add annotation'))
    expect(h.input()?.focused).toBe(true); expect(h.requests()).toBe(0)
  } finally { h.destroy() }
})

test('create flow previews and commits an exact native Unicode selection', async () => {
  const quote = 'Unique 👩🏽‍💻 العربية e\u0301 漢字 passage.'
  const h = await pluginHarness({ source: quote })
  try {
    await h.selectQuote(stringWidth(quote)); h.screen.mockInput.pressKey('F6')
    await h.screen.waitForFrame(frame => frame.includes('Add annotation'))
    const preview = findRenderable(h.screen.renderer.root, 'response-annotations.quote.text') as TextRenderable
    expect(preview.plainText).toBe(quote)
    h.input()!.setText('تعليق 👩🏽‍💻 e\u0301'); h.screen.mockInput.pressEnter()
    await h.screen.waitFor(() => h.state().notes.length === 1)
    expect(h.state().notes[0].quote).toBe(quote); expect(h.state().notes[0].comment).toBe('تعليق 👩🏽‍💻 e\u0301')
    expect(h.requests()).toBe(0)
  } finally { h.destroy() }
})

for (const [width, height] of [[24, 12], [40, 18], [80, 24]]) {
  test(`read-only long Unicode quote wraps/scrolls without stealing comment focus at ${width}x${height}`, async () => {
    const h = await pluginHarness({ width, height })
    const quote = ('Highlighted 👩🏽‍💻 العربية e\u0301 漢字 line\r\n').repeat(150) + 'END_OF_EXACT_QUOTE'
    const original = quote
    let result: Promise<string | undefined> | undefined
    try {
      result = h.openComment(quote, 'Existing comment')
      await h.screen.waitForFrame(frame => frame.includes('Enter:save'))
      const input = h.input()!, preview = findRenderable(h.screen.renderer.root, 'response-annotations.quote') as ScrollBoxRenderable
      const text = findRenderable(h.screen.renderer.root, 'response-annotations.quote.text') as TextRenderable
      const footer = findRenderable(h.screen.renderer.root, 'response-annotations.comment.footer')!
      expect(text.plainText).toBe(previewText(quote)); expect(preview.scrollHeight).toBeGreaterThan(preview.height)
      expect(input.focused).toBe(true); expect(preview.focusable).toBe(false)
      expect(footer.y + footer.height).toBeLessThanOrEqual(height)
      await h.screen.mockInput.pressKeys(['\x1b[6~']); await h.screen.flush()
      expect(preview.scrollTop).toBeGreaterThan(0); expect(input.focused).toBe(true)
      await h.screen.mockMouse.scroll(preview.x, preview.y, 'down'); await h.screen.flush()
      expect(input.focused).toBe(true); expect(input.plainText).toBe('Existing comment')
      h.screen.resize(32, 12); await h.screen.flush()
      expect(h.input()).toBe(input); expect(input.focused).toBe(true); expect(input.plainText).toBe('Existing comment')
      preview.scrollTo({ x: 0, y: preview.scrollHeight }); await h.screen.flush()
      expect(h.screen.captureCharFrame()).toContain('END_OF_EXACT_QUOTE')
      h.screen.mockInput.pressEscape(); expect(await result).toBeUndefined()
      expect(quote).toBe(original); expect(h.requests()).toBe(0)
    } finally { h.context.ui.dialog.clear(); await result; h.destroy() }
  })
}

test('preview escapes terminal and bidi controls as literal text without changing the stored quote or batch bytes', async () => {
  const quote = 'Alpha\x1b[31m <tag> ```\n\u202euntouched\r\n👩🏽‍💻 e\u0301'
  const h = await pluginHarness()
  let result: Promise<string | undefined> | undefined
  try {
    const old = initialState(), src = { sessionID: 'a', messageID: 'm', part: 0, text: quote }
    addNote(old, src, 0, quote.length, 'Original comment', 'n')
    const before = JSON.stringify(old), batchBefore = makeBatch(JSON.parse(before), 'a', 'msg_fixed', 1).text
    result = h.openComment(quote, 'Original comment')
    await h.screen.waitForFrame(frame => frame.includes('\\u001b[31m'))
    const preview = findRenderable(h.screen.renderer.root, 'response-annotations.quote.text') as TextRenderable
    expect(preview.plainText).toContain('\\u001b[31m'); expect(preview.plainText).toContain('\\u202e')
    expect(preview.plainText).not.toContain('\x1b'); expect(preview.plainText).toContain('<tag> ```')
    h.screen.mockInput.pressEnter(); expect(await result).toBe('Original comment')
    expect(JSON.stringify(old)).toBe(before); expect(makeBatch(JSON.parse(before), 'a', 'msg_fixed', 1).text).toBe(batchBefore)
    expect(h.requests()).toBe(0)
  } finally { h.context.ui.dialog.clear(); await result; h.destroy() }
})

test('oversized comment stays open for correction; Enter saves only the corrected optional comment', async () => {
  const h = await pluginHarness(); let result: Promise<string | undefined> | undefined
  try {
    result = h.openComment('Exact source quote')
    await h.screen.waitFor(() => !!h.input())
    h.input()!.setText('x'.repeat(LIMITS.commentChars + 1)); h.screen.mockInput.pressEnter()
    await h.screen.waitFor(() => h.errors.some(message => message.includes('too long')))
    expect(h.input()?.focused).toBe(true)
    h.input()!.setText(''); h.screen.mockInput.pressEnter()
    expect(await result).toBe(''); expect(h.requests()).toBe(0)
  } finally { h.context.ui.dialog.clear(); await result; h.destroy() }
})

test('replacing the quote dialog cancels the older draft and submits only the current comment', async () => {
  const h = await pluginHarness(); let first: Promise<string | undefined> | undefined, second: Promise<string | undefined> | undefined
  try {
    first = h.openComment('First exact quote', 'Unsaved first draft')
    await h.screen.waitForFrame(frame => frame.includes('First exact quote'))
    const previous = h.input()!
    second = h.openComment('Second exact quote', 'Second draft')
    expect(await first).toBeUndefined()
    await h.screen.waitForFrame(frame => frame.includes('Second exact quote'))
    expect(previous.isDestroyed).toBe(true); expect(h.input()?.focused).toBe(true)
    h.screen.mockInput.pressEnter(); expect(await second).toBe('Second draft')
    expect(h.requests()).toBe(0); expect(h.composer.plainText).toBe(h.originalComposer)
  } finally { h.context.ui.dialog.clear(); await first; await second; h.destroy() }
})

test('edit flow previews the original selected quote while changing only its comment; cancel preserves it', async () => {
  const h = await harness(), gate = deferred<string | undefined>()
  try {
    const original = JSON.stringify(h.persisted().notes[0])
    h.controls.select = async options => options.some(option => option.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = () => gate.promise
    await h.key('e'); await h.screen.waitForFrame(frame => frame.includes('Edit annotation #1') && frame.includes('Quote (PgUp/PgDn)'))
    const preview = findRenderable(h.screen.renderer.root, 'response-annotations.quote.text') as TextRenderable
    expect(preview.plainText).toBe(h.state.notes[0].quote)
    gate.resolve(undefined); await h.screen.waitFor(() => !findRenderable(h.screen.renderer.root, 'response-annotations.comment.input'))
    await h.screen.waitForFrame(frame => !frame.includes('Working'))
    expect(JSON.stringify(h.persisted().notes[0])).toBe(original)
    h.controls.comment = async () => 'Edited comment'
    await h.key('e'); await h.screen.waitFor(() => h.state.notes[0].comment === 'Edited comment')
    expect(h.state.notes[0].quote).toBe(JSON.parse(original).quote); expect(h.controls.calls).toHaveLength(0)
  } finally { gate.resolve(undefined); h.destroy() }
})

test('narrow edit flow previews a long Unicode quote and preserves it on save', async () => {
  const quote = ('Exact 👩🏽‍💻 العربية e\u0301 漢字\r\n').repeat(150)
  const state = initialState(); addNote(state, { sessionID: 'a', messageID: 'msg_long', part: 0, text: quote }, 0, quote.length, 'Old', 'long')
  const h = await harness(state), gate = deferred<string | undefined>()
  try {
    h.screen.resize(24, 12); await h.screen.flush()
    h.controls.select = async options => options.some(option => option.value === 'edit') ? 'edit' : options[0].value
    h.controls.comment = () => gate.promise
    await h.key('e'); await h.screen.waitForFrame(frame => frame.includes('Enter:save'))
    const preview = findRenderable(h.screen.renderer.root, 'response-annotations.quote.text') as TextRenderable
    expect(preview.plainText).toBe(previewText(quote)); expect(h.state.notes[0].quote).toBe(quote)
    gate.resolve('Edited 👩🏽‍💻 تعليق'); await h.controls.commentTasks.at(-1)
    await h.screen.waitFor(() => h.state.notes[0].comment === 'Edited 👩🏽‍💻 تعليق')
    expect(h.persisted().notes[0].quote).toBe(quote); expect(h.controls.calls).toHaveLength(0)
  } finally { gate.resolve(undefined); h.destroy() }
})
