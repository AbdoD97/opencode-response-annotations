# Validation record

## F6 and selected-quote dialogs, 0.3.1 candidate (2026-10-18)

Source/staging only on the isolated Windows validation VM, based on published 0.3.0 commit `d744923d2b026eb87256eacdc7a3f71a66507da3`. The running installed 0.3.0 session is not edited, restarted or automated. No model request, stored-data migration, configuration/routing change, publication or activation of this candidate is performed.

- **44 Node tests pass**, including all existing storage/quote/frozen-retry validation.
- **63 Bun tests pass across seven files, 553 assertions**. Twelve new dialog/keymap cases use the real published OpenTUI/keymap 0.5.17 packages with a small pinned-host layer/mode/config bridge and synthetic renderer input. F6 works with legacy and Kitty encoding while the composer remains focused, and command-specific custom binding overrides and palette dispatch are exercised. These tests do not claim actual Windows/VM keystroke delivery.
- Create and edit flows show the originally selected quote, including an exact native Unicode capture. Long Unicode/CRLF quotes are wrapped and scrollable at **24x12, 40x18 and 80x24**, and after resize. The fixture models the pinned host dialog's quarter-height offset/top padding and width cap. Page keys and mouse-wheel preview scrolling retain comment focus/value. Cancellation, replacement, oversized-comment correction, session invalidation, stale edits/deletes and zero draft model requests remain covered.
- All **12 new cases repeated ten times: 120 passes, 1,060 assertions, no retries**. The frame assertions wait for rendered content rather than only a callback. These are synthetic renderer tests, not native terminal automation.
- Typecheck and build/import pass. Constructed payload measurements are exactly equal to the checked-in 0.3.0 JSON; formatter, storage codec and submission-envelope source files are unchanged. Preview control escaping affects display only; original stored quotes and frozen batch bytes remain intact.

The only added dependency is development-only `@opentui/keymap@0.5.17`, matching the inspected host. Existing peer packages are retained and no React peer or global package is added. npm repeats the pre-existing core package's Node engine warning (Node >=26.4; this VM uses 24.19); renderer/keymap tests and builds run under supported Bun 1.4.3. No runtime installation is upgraded.

Sent expandable transcript cards remain unsupported by the pinned per-message plugin surface; no sidebar/viewer has been substituted. [PRESENTATION.md](PRESENTATION.md) records the public API/native-row evidence and supported alternatives. The historical 0.3.0 candidate record below predates its later publication/activation and does not describe the currently installed version.

## Quote-only baseline and optional revision storage, 0.3.0 candidate (2026-10-18)

Source-only candidate on the isolated Windows validation VM; the active installed 0.2.1 files/session/store have not been updated or migrated. Publication and installed activation are held for independent review. No paid/live model request, authentication change, terminal UI automation or old-message rewrite was performed.

- **44** Node domain/selection/storage tests pass (`node --test --test-isolation=none test/*.test.ts`). This includes exact Unicode/CRLF/comments, no neighboring excerpts, deterministic ID/time-independent new text, graph/hash/unit/counter validation, frozen old prepared bytes/IDs/time/note data, differing sibling revisions, rollback and large shared sources. Six review regressions reject sent/pending overlap and multiple owning batches in v1/v2 without changing input; the valid historical migration/rollback case still passes.
- **34** OpenTUI renderer + published-client tests pass, **380** assertions. They cover draft CRUD/cancel with zero requests, one actual client request construction on Send, byte-identical envelope after uncertain retry/restart, unavailable recovery UI, durable-failure retention and success-only hide. Fetch is an offline response fixture; no remote host or provider is contacted.
- **17** pinned-host storage/renderer tests pass, **69** assertions. The fixture retains the inspected `createStorage`/atomic-write bodies from OpenCode commit `594af423e8676b8458d6ef125ddde6766afad392`, removing UI-provider imports and redirecting the local persistence import. Published `@opencode/util` 2.0.32 supplies the real file lock. Tests use disposable files, two instances and two headless child processes; they cover stale confirmation, one logical prepared ID across windows, sent-save failure, corrupt/old-cached fallback refusal, verified backups, interruption, stale replacement, initialization and rollback. Six added two-window renderer cases reject stale edit/delete targets, preserve unrelated concurrent edits, and retain the originally displayed snapshot across a reactive update while the note picker remains open. Dialogs and model admission remain fixtures.
- Typecheck includes source/tests/scripts. Build regenerates the candidate distribution. No live user data is included in tests or benchmark artifacts.

Review synchronization correction: the two stale-target edit/remove tests wait for the rendered review-again status after the busy indicator clears, retaining the toast and visible-text assertions. Each case also passes 25 repeated runs (50 passes, 250 assertions, no retries). Production conflict behavior is unchanged. Artifact receipts distinguish raw archived CRLF bytes from the LF-normalized content hash.

The actual client fixture verifies the fixed `session.prompt` JSON envelope and untouched synthetic prior-message/system/tool/provider objects. It is **not** an execution of OpenCode's complete history lowering, compaction, model-request compiler or provider cache policy. Those compiled-provider tests are unavailable in this installed CLI-only workspace; no upstream provider test suite or actual caching/billing experiment was run. Cache eligibility is not a cache-hit guarantee.

New prompt bytes for the three documented synthetic cases are **355 / 775 / 885**, compared with 0.2.1's **633 / 1,053 / 1,527**. The explicit coarse estimator remains `ceil(UTF-8 text bytes / 4)`, giving **89 / 194 / 222** estimates, not actual model tokens. See [PERFORMANCE.md](PERFORMANCE.md) and raw JSON for separate text/body/storage/timing boundaries.

Existing nonempty v1 data uses the new format and validation without schema migration, retaining its local duplication. V2 deduplication is opt-in and deliberately deferred for the live store. Fresh or ambiguous empty stores require explicit offline initialize/migrate, never automatic reset. [STORAGE.md](STORAGE.md) describes verified backup, process/offline guards, current-state rollback and the limits of cooperative locking/power-loss protection.

## Readable compact batches, 0.2.1 (2026-10-18)

Validated on Windows VM the isolated Windows validation VM with official `@opencode/cli` 2.0.32, Node 24.19.0 and Bun 1.4.3. This change does not alter selection capture, model routing or the `annotations-v1` storage schema. No real batch was sent or replayed during this validation.

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
