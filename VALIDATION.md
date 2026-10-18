# Validation record

## Readable compact batches, 0.2.1 (2026-10-18)

Validated on Windows VM DESKTOP-49DSGUK with official `@opencode/cli` 2.0.32, Node 24.19.0 and Bun 1.4.3. This change does not alter selection capture, model routing or the `annotations-v1` storage schema. No real batch was sent or replayed during this validation.

- 29 Node domain/selection/bounds tests pass using `node --test --test-isolation=none test/*.test.ts`; the sandbox blocks the default runner's child process isolation.
- 31 real OpenTUI renderer tests pass, 349 assertions, using the existing fixture dialogs/storage/admission APIs. These include failed admission/restart of an old prepared JSON payload with identical ID/text; the existing uncertain-admission, failed write, cancellation and success-only hide checks also pass with new formatting.
- Typecheck passes. The build and installed artifact hashes are recorded with the VM installation evidence.
- Formatting regressions cover empty comments, stable/gapped numbers, multiple sources, overlapping notes, exact Unicode/CRLF/whitespace, Markdown delimiter containment, bounded grapheme-safe source excerpts, local full-snapshot retention and byte-for-byte old/new prepared retries.

Synthetic client payload comparison from `node script/measure-payloads.ts`:

| Fixture | v0.2.0 prompt text bytes | v0.2.1 prompt text bytes | Reduction | Estimated text tokens, old → new |
|---|---:|---:|---:|---:|
| 1 note / 10K response | 20,843 | 633 | 96.96% | 5,211 → 159 |
| 5 notes / same 100K response | 201,559 | 1,053 | 99.48% | 50,390 → 264 |
| 6 notes / 2 selected parts / same 3-part 120K response | 322,234 | 1,527 | 99.53% | 80,559 → 382 |

The explicit token estimator is `ceil(UTF-8 text bytes / 4)`, a coarse English-oriented heuristic, not a model tokenizer. The script also reports JSON-encoded `session.prompt` argument sizes. These are synthetic client construction measurements, not captured HTTP traffic, final server/model context, billing or proof of answer quality. Full snapshots still consume local storage; they are no longer automatically repeated in new prompts.

The pinned public `SessionPromptInput`/protocol schema was inspected: one `text` field plus transport fields/attachments, with no supported separate display/model text. No private API or host rendering override is used.

The user separately reported successful Windows launch, command-palette selection capture, pending queue and a sent batch, and reported that Ctrl+Shift+A did not work. This is user-reported live evidence, not independent UI verification. No Windows terminal mouse/keyboard automation or live send was performed for 0.2.1. Command palette remains the fallback; no keybindings or terminal settings were changed.

## Corrected native-transcript workflow (2026-10-17)

Tested package in an isolated official OpenCode **2.0.32** Linux CLI, with a synthetic imported assistant response:

> Alpha beta gamma. / Second line with emoji 👩🏽‍💻. / Repeated beta, selected by exact offsets.

The test used private temporary XDG configuration/data/state/cache directories, no user credentials and no model submission. Process-only supported flags `OPENCODE_DISABLE_MODELS_FETCH=1` and `OPENCODE_DISABLE_AUTOUPDATE=1` disabled background catalog/update checks.

### Actual host outcomes

- Host loaded rebuilt plugin through the global `cli.json` absolute-directory configuration.
- At 130×40, SGR mouse drag on the **original main transcript** selected `Alpha`. Ctrl+Shift+A opened the optional-comment dialog after the native highlight was cleared by host key routing.
- Enter committed `Native main transcript smoke note` locally. The docked notes-only panel displayed #1. Durable store inspection verified source `msg_fixture_001`, part 0, quote `Alpha`, UTF-16 range 0–5 and complete source text; batches remained empty.
- Clean host exit/restart retained the note and pending-count row.
- Native selection of repeated `beta` was refused with the exact-unique-source message. No note was added.
- Native selection of unique `gamma` and an empty comment committed #2. Durable JSON verified range 11–16, empty comment and two pending notes.
- Clicking/focusing the sidebar then Ctrl+S opened the explicit two-note Send batch confirmation. Escape canceled. Both notes and the visible queue remained; durable batches were still empty.
- Host exited cleanly. No Send confirmation was accepted and no model answer was requested.

The successful persistence record proves the selected original source was mapped and committed in this host. It does not establish every Markdown structure, terminal mouse protocol or layout.

### Automated checks on corrected code

- `npm run typecheck`: pass.
- `npm test`: 20 Node domain/selection/bounds tests pass.
- `npm run test:panel`: 30 real OpenTUI renderer tests pass, 337 assertions in the final recorded run.
- `npm run build`: pass; precompiled `dist/tui.js` and source map regenerated.
- `npm run benchmark`: measured separately; see PERFORMANCE.md. Timing observations are not guarantees on other computers.

Renderer tests use real public Selection/MarkdownRenderable objects and fixture dialogs/storage/admission APIs. They cover native-release capture before selection clearing, optional commit/cancel, revert invalidation, note-only stack, edits/deletes, stable numbering, durable restart, pre-admission write failure, post-admission sent-save failure, incorrect/missing acknowledgment, identical-ID retry, session leave-and-return, replacement-panel closure races, and source/size refusals. The capture fixture emits the public release event carrying a real Selection; actual mouse release was separately exercised in the host.

Storage failure tests model the inspected atomic host store contract. They do not simulate a physical disk fault in the running host. Send success/hide is verified through admission fixtures, not a live remote model request.

### Explicitly unverified

Real model delivery/completion, live server duplicate-admission reconciliation, cross-process storage races, every rendering/formatting mode, plugin removal under active operations, live failed disk writes, exhaustive resize/narrow-terminal behavior of the revised panel, and extended host performance soak testing.

## Superseded prototype evidence

Earlier checks exercised keyboard selection on a copied response inside the sidebar, including live edit/delete, cancel send, restart and narrow-terminal fallback. That interface has been removed. Those checks are not represented as native main-transcript selection coverage; only the corrected checks above establish that behavior.
