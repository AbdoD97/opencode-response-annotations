# OpenCode Response Annotations

An experimental terminal plugin for **OpenCode V2 2.0.32**. Highlight the **original assistant response in the main transcript**, commit an optional comment locally, review numbered notes stacked in a sidebar, then explicitly send one batch. The sidebar is a notes queue, not a duplicate response editor. The main composer is untouched.

This is a restricted implementation, **not full desktop annotation parity**. Native selection APIs expose rendered text, not stable source ranges. A version-pinned host-structure adapter and conservative exact-text checks accept only unambiguous selections. Repeated quotes, duplicate full responses, cross-message selections, unsupported structures and rendered text that does not match the source are rejected rather than guessed.

## Requirements and installation

- Official V2 distribution `@opencode/cli@2.0.32`, with its CLI-plugin API. Legacy `opencode-ai` V1 is not this API.
- Host-provided OpenTUI/Solid. Development uses OpenTUI 0.5.17 and Solid 1.9.12.
- Docked panels need at least 108 columns in the inspected host. Narrow terminals use the host's fullscreen panel fallback.

Copy this package folder, including `tui.js`, `dist/` and `package.json`, into your project's `.opencode/plugins/response-annotations/`, then restart. That local discovery route is source-verified.

Alternatively add the **absolute plugin directory** to your existing global V2 `cli.json` `plugins` array, preserving other settings. Usually this file is `$XDG_CONFIG_HOME/opencode/cli.json` or `~/.config/opencode/cli.json`. This global configuration route was tested in an isolated official host. Project `.opencode/cli.json` is not the global CLI configuration. Do not install this unpublished name from a package registry.

No OpenCode fork/core build, browser extension, API key or separate model is needed for local annotation.

## Workflow

1. Mouse-drag a passage in a completed assistant response in the original transcript.
2. Press **F6**, or press **Ctrl+P** and choose **Annotations → Annotate selection**. A local optional-comment dialog opens with the selected quote visible. No automatic popup steals focus on selection. Existing command-specific custom bindings remain authoritative.
3. Enter a comment, or leave it empty for a highlight-only note. **Enter** commits; **Esc** cancels without saving. The quote preview wraps in a bounded scroll area: **PgUp/PgDn** or the mouse wheel scroll it while the comment retains focus. The full original quote stays unchanged; preview-only terminal/bidi controls are shown as visible escapes.
4. The sidebar opens with numbered pending notes. Repeat the original-transcript selection to stack more. `/annotate` or **Review pending annotations** reopens the queue. The compact composer row reports the pending count without reading or changing its draft.
5. Focus/click the sidebar and press **e** to select a note, edit its comment or remove it. The edit dialog shows that note's original selected quote. Numbers are stable per session and deleted numbers are not reused. **Esc** closes the panel; **f** changes its presentation; **h** lists saved sent references.
6. **Ctrl+S** opens the explicit **Send batch** confirmation. Cancel keeps the queue. Sending uses the session's configured agent/model and may incur token usage. New batches send only readable numbered exact quotes and optional comments, once per annotation, with one shared instruction paragraph. Full source snapshots, message/part identities and UTF-16 offsets stay local. No automatic excerpts, model tools, extra sessions or model-only transforms are added.
7. The sidebar hides **only after matching prompt admission is returned and sent state is durably saved**. This is admission, not proof the model has finished answering. Failure or uncertainty keeps the batch/notes available.

The main composer's unsent text, attachments and uncommitted model/agent selections are not merged into this separate batch. No model call occurs while highlighting, commenting, editing or deleting.

## Quote previews and shortcut (0.3.1 candidate)

The new default **F6** avoids the old Ctrl+Shift+A collision with OpenCode's input-selection command and the loss of the Shift modifier in legacy Ctrl-letter encodings. The palette label and command ID remain unchanged. Real published-keymap tests exercise synthetic legacy/Kitty input with the composer focused, custom binding overrides and palette dispatch; this is not yet an independently observed Windows terminal keystroke test.

Create/edit comment dialogs use only the public custom-dialog API. They show the saved exact selection as a read-only, wrapped, scrollable preview, preserve comment focus during preview scrolling/resizing, and retain cancellation and stale-note checks. Display escaping never changes saved source text, quotes, comments or the batch formatter/transport. No new model text, tool or model call is added.

The pinned host renders sent user text literally and exposes no individual-message plugin rendering slot. Compact expandable annotation cards in that transcript cannot be supplied by this plugin alone. No separate viewer has been substituted for that request. See [PRESENTATION.md](PRESENTATION.md) for the inspected supported surfaces and options.

## Quote-only batches and optional deduplicated storage (0.3.0)

New batches begin with numbered selected quotes and optional comments instead of raw JSON or internal IDs. Quotes/comments are sent in full, inside literal Markdown fences that safely contain any backticks in the content. Empty comments are labeled as highlight-only notes.

Full selected and sibling response snapshots remain local. Automatic nearby excerpts and the invented `Response N` grouping labels from 0.2.1 are removed from new batches. Quotes/comments are never silently shortened, including Unicode or Markdown delimiters. If a quote is insufficient to identify an earlier reply, the instructions ask for clarification; there is no source resolver or guarantee of retrieval after compaction.

The inspected public OpenCode 2.0.32 `session.prompt` API supplies one `text` field, without separate display/model text fields. The readable message is therefore also the submitted prompt text. The fixed request envelope, historical messages, system text, tool catalog, provider routing and cache options are not changed by this plugin. Client payload reduction is not proof about final server prompts, billing, cache hits or answer quality.

The `annotations-v1` storage key is retained. Existing nonempty v1 files continue to work without migration: they get the new formatter and validation, but keep their old local snapshot duplication. Optional schema v2 stores each immutable source revision once and references it from notes/history. Its hash binds session, message, original content-part index, selected snapshot and all sibling snapshots; differing sibling revisions are not merged. Coordinates are explicitly UTF-16 within the selected part, with an exclusive end.

Migration is never automatic. Do not convert a live store while an older window is running. The offline tool verifies a byte-exact backup before replacement and supports a lossless v1 export for rollback. Existing sent history and every prepared batch's ID, text, time, note IDs/numbers/comments/provenance remain intact. The prepared payload may still contain old JSON or excerpts because uncertain retries must not be reformatted. See [STORAGE.md](STORAGE.md) for initialization, opt-in migration, recovery and rollback.

Unreadable/malformed state, invalid revision graphs and ambiguous completely empty v1 state block annotation mutations and sends. The host's invalid initial sentinel, and the known empty fallback of a cached older plugin generation, are both refused. New installations require explicit offline initialization; valid empty legacy files can be migrated offline. Never reset or delete a corrupt store to bypass recovery.

Run `node script/measure-payloads.ts` for synthetic before/after byte measurements and the explicitly labeled token heuristic. No host/model request is made by this measurement.

## Selection limits and source provenance

The plugin captures the public OpenTUI selection at mouse release, before the host clears it for command/dialog keys. It accepts one enclosing `MarkdownRenderable`, requires a completed assistant text snapshot and a unique exact quote, and validates again before commit. Pending notes retain their original snapshots if the transcript later changes; they are not silently re-anchored.

OpenCode 2.0.32 does **not** expose a supported selection-to-message/source-offset bridge. This adapter additionally checks the publicly readable parent chain against the inspected host's internal row-ID conventions. Those conventions are **version-coupled implementation details, not a stable public metadata contract**. Unknown host versions/structures fail closed. It does not patch private APIs or edit host core. It is not a security boundary against another malicious plugin impersonating host nodes.

Selections containing removed Markdown syntax, altered whitespace/table layout, repeated text, duplicate source snapshots, multiple parts/messages, unfinished responses or reverted sessions can be refused. There are no persistent numbered decorations or clickable saved-range overlays in the original transcript. Original selection works for supported unambiguous passages; exact arbitrary rendered-range parity needs a host source-range API.

## Durability and safety

- Same `annotations-v1` storage key, with validated v1/v2 readers. No automatic schema migration, old-message rewrite or history pruning.
- Host durable JSON storage writes atomically before updating live state. A prepared batch is saved with a stable ID before admission. Unknown-outcome retries reuse the identical ID and payload; the inspected V2 admission API is idempotent.
- Prepared batches are frozen against edit/removal. This version has no discard or manual reconciliation UI. Never delete an uncertain batch just to retry under a new ID.
- Failed prepared-state writes prevent sending; failed sent-state writes retain the retry batch and do not hide the sidebar. Returned admission ID/session/type are checked.
- Dialog/session-change guards and cleanup prevent stale dialogs from editing another session or closing a replacement panel. Concurrent note changes during confirmation require another review.
- Conservative size limits refuse without truncating or pruning data: selected part 100,000 characters; selected response text parts 250,000 total; comment 20,000; 100 pending notes; batch 1 MB; store 8 MB. Selection scans also cap nodes/depth/history. See [PERFORMANCE.md](PERFORMANCE.md).
- Oversized legacy prepared batches remain stored unchanged but cannot be sent under the new payload cap. There is no in-plugin export/recovery UI yet; manually preserve/review the store before any recovery. Do not rely on the plugin for unlimited annotation archives.

## Development and verification

```sh
npm ci
npm test
npm run typecheck
npm run test:panel
npm run test:host
npm run build
npm run benchmark
npm run benchmark:storage
```

Tests include the real OpenTUI renderer with fixture host APIs, actual native Selection objects, local commits, queue editing, durable-failure simulations and admission uncertainty. See [VALIDATION.md](VALIDATION.md) for actual isolated-host mouse/keyboard/restart results and what remains untested. [PARITY.md](PARITY.md) distinguishes implemented behavior from limitations; [REFERENCE-BEHAVIOR.md](REFERENCE-BEHAVIOR.md) records independently inspected reference behavior.

Original MIT-licensed implementation. Official API/source inspected at commit `594af423e8676b8458d6ef125ddde6766afad392` and published 2.0.32 typings: [CLI plugin documentation](https://opencode.ai/v2/docs/build/plugins/cli/). No proprietary reference application code/assets are included.
