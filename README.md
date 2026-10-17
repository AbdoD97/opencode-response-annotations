# OpenCode Response Annotations

A small **experimental OpenCode V2 terminal plugin**, not a fork or custom OpenCode build. Review assistant response text in a docked sidebar, select precise passages with the keyboard, save numbered highlights or comments, then explicitly send the whole batch. The main prompt draft is not read, overwritten, or submitted.

**Readiness:** type checks, build, domain/renderer tests and an actual isolated OpenCode 2.0.32 host smoke test pass. Real keyboard selection, editing, cancel-send, disk persistence/restart, deletion and narrow-terminal fallback were exercised. Real model delivery, cross-process races and exhaustive lifecycle/performance tests remain unverified; this is not a claim of complete ChatGPT feature parity. See [PARITY.md](PARITY.md) for what is and is not established.

## Requirements

- OpenCode V2 with the CLI-plugin API tested against `@opencode/plugin@2.0.32`.
- The official V2 distribution is `@opencode/cli@2.0.32`. The legacy `opencode-ai` package's `latest` was `1.19.3` when checked and is **not** this API. Do not assume an existing V1 install will load this plugin.
- The host must provide OpenTUI and Solid, as supported by its plugin runtime. Development tests use OpenTUI 0.5.17, Solid 1.9.12, Bun 1.4.3 and TypeScript 5.9.3.
- Docking needs at least **108 terminal columns** in the inspected host. Below that, OpenCode itself uses a fullscreen panel. `f` toggles presentation when space permits.

## Local installation (no publishing or core build)

The release folder contains the precompiled `dist/tui.js`, root `tui.js`, and `package.json`. There is no need to build OpenCode, install a browser extension, or change system permissions.

Copy that folder as a directory into your project's `.opencode/plugins/response-annotations/`, then restart the V2 CLI in that project. OpenCode's supported local-plugin discovery finds plugin directories there. Preserve both `tui.js` and `dist/`; the root entrypoint supports local-directory discovery, and the package's `./tui` export supports package loading.

Alternatively add the **absolute path to the plugin directory** to the existing `plugins` array in the V2 **global** `cli.json` (under its user config directory, normally `$XDG_CONFIG_HOME/opencode/cli.json` or `~/.config/opencode/cli.json`), preserving all other settings. This is a CLI-only plugin; use `cli.json`, not the server-only plugin list. Do not run `opencode plugin add` with this unpublished package name; that command expects a published registry or Git package.

Installation has not been performed on the user's computer. The global `cli.json` path with an absolute plugin directory was verified in an isolated live 2.0.32 host. Project `.opencode/cli.json` is not the global CLI configuration and was not loaded in that test. The alternate local-directory discovery route remains source-verified, not independently smoke-tested.

## Use

1. Open an existing conversation, enter `/annotate` or choose **Annotate assistant response** from the command palette.
2. Press `r` to choose a **completed** assistant text part. The sidebar displays raw Markdown source, not the rendered transcript. The original conversation remains visible on a wide terminal.
3. Arrow keys move the source cursor. `Shift` + arrows extend an exact passage selection. `Ctrl+Home/End` goes to the start/end; add Shift to extend. Grapheme clusters such as emoji and combining characters stay intact.
4. `a` saves a highlight without a comment; `n` opens an optional comment prompt. Canceling it saves nothing. Save as many notes as needed. Notes have stable per-session numbers; deleted numbers are not reused.
5. `e` opens pending notes, including view, edit-comment and remove actions. Existing ranges are underlined; `[N]` marks their start. Several notes at the same start display `[first+count]`; the full list retains every number.
6. `Ctrl+S` asks before sending. Cancel keeps notes editable. Send uses this session's configured agent/model and can incur token usage. It includes exact quotes, source message/part IDs, offsets, full selected-text snapshots and all sibling assistant text parts. Reasoning/tool internals are not included. The payload is visible as a normal message, not hidden context.
7. `h` opens sent references and returns to their saved passage snapshots. `Esc` closes the sidebar.

The compact composer row reports pending notes. It does **not** merge notes with the main composer's unsent text, selected-but-uncommitted agent/model, attachments, or instructions. Send annotations independently after reviewing them.

## Durability and send safety

- Uses the host's durable, instance-synchronized JSON plugin store, not a private global DOM or unsupported transcript hooks.
- Anchors retain session, message, text-part index, source snapshot and UTF-16 offsets. Duplicate phrases cannot be confused. Changed original text does not silently move a saved note.
- Pending notes remain until prompt admission succeeds and the local success record persists. A prepared batch gets a stable message ID **before** submission. Retrying an uncertain response reuses that ID; V2 admission's idempotency prevents duplicate admission.
- A prepared/uncertain batch is frozen against comment edits/removal. Retry the same batch to reconcile it. This conservative version has no discard/recovery UI for a permanently rejected prepared batch; see limitations before relying on it.
- Reentrant commands are locked while dialogs/writes/submission are active. A session switch clears the source selection; asynchronous dialog results from another session are discarded. A changed note set during confirmation requires another review. Reverted sessions are blocked.
- Source selection is cached by response, so cursor movement does not re-segment the entire response each time. Only a small source viewport is rendered.

## Development and verification

Install dependencies in this plugin directory, never the OpenCode checkout:

```sh
npm ci
npm test
npm run typecheck
npm run test:panel
npm run build
```

`npm test` runs Node's dependency-free domain tests; `test:panel` runs Bun with the OpenTUI Solid preload. The latter renders the real component against fixture host APIs and invokes registered commands. It is **not** a substitute for host, mouse or remote-server testing. Separate live-host checks are recorded in [VALIDATION.md](VALIDATION.md).

No GitHub Actions, model/API calls, login flow, package publishing or user-machine installation is part of these tests.

## Provenance

Original plugin implementation. Public API shape was checked against official OpenCode source commit `594af423e8676b8458d6ef125ddde6766afad392`, the published 2.0.32 plugin typings, and [official CLI plugin documentation](https://opencode.ai/v2/docs/build/plugins/cli/). The existing source checkout was read-only; no OpenCode core patch is needed. Dependencies retain their respective licenses. This plugin is MIT-licensed.
