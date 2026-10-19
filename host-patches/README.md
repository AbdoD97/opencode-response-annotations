# Pinned OpenCode message-body extension

This directory contains the complete host patch against official OpenCode
`594af423e8676b8458d6ef125ddde6766afad392` (`2.0.32`). It is an experimental
patch for review, not an upstream release or an approved replacement installation.

The host owns a declarative user-message **body** disclosure API. Plugins provide
bounded labels and ranges into canonical text; they cannot replace native message
wrappers, attachments, delivery indicators or actions. Invalid/stale/conflicting
plans and plugin failures fall back to original text. Registration follows plugin
disable/reload cleanup. Mouse handling preserves selection and native row actions;
keyboard focus and scrolling stay in the host.

The annotation plugin recognizes frozen local batches by session/message identity,
the existing marker and exact canonical text equality. Each note starts collapsed.
No new prompt metadata, message roles, history transforms, tools or model requests
are introduced. Copy/Revert retain canonical data. Export without local batch data
retains text but loses folding.

## Reproduce

Use a fresh checkout and fresh test profile, never a working server or live store.

```text
git clone --filter=blob:none --no-checkout https://github.com/anomalyco/opencode.git host
git -C host fetch --depth=1 origin 594af423e8676b8458d6ef125ddde6766afad392
git -C host checkout --detach FETCH_HEAD
git -C host apply --index <absolute-path>/opencode-2.0.32-message-body.patch
git -C host write-tree
```

The resulting tree must be `9a34c429f4d6a519b4aa605b565c154b4404fd53`.
The patch bytes must match `provenance.json`; keep LF bytes intact.
Retain and follow the upstream `AGENTS.md` files and test skills.

With Bun **1.4.3**, from `host`:

```text
bun install --linker=hoisted --filter @opencode/cli --filter @opencode/tui --filter @opencode/plugin --filter @opencode/core --filter @opencode/util --filter @opencode/ai --frozen-lockfile --ignore-scripts
```

Use a fresh dependency layout: changing linker alone can leave stale nested links.
OpenTUI and Solid must resolve to shared instances across TUI, Theme and Plugin.
The patch's small dev-only dependency additions use existing lockfile-pinned
versions and enable filtered type checking/direct compiler invariance tests.

Run from `packages/tui`:

```text
bun run typecheck
bun test --timeout 30000 test/component/user-message-body.test.tsx test/plugin/message-body.test.ts test/plugin-message-body.test.tsx
```

Run `bun run typecheck` from `packages/plugin`. From `packages/core`:

```text
bun test --timeout 30000 test/session-runner-message.test.ts test/session-model-request.test.ts test/session-model-request-hooks.test.ts
```

From `packages/ai`:

```text
bun test --timeout 30000 test/compile.test.ts test/cache-policy.test.ts test/compaction.test.ts test/tool-history.test.ts
```

Use process-only fresh `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` and
`XDG_CACHE_HOME`, plus `OPENCODE_DISABLE_MODELS_FETCH=1` and
`OPENCODE_DISABLE_AUTOUPDATE=1`. These tests use fixtures/offline compilation.

## Native CLI build

Set process-only `OPENCODE_VERSION=2.0.32-folding.1` and
`OPENCODE_CHANNEL=folding`. Then, from `host`:

```text
bun packages/cli/script/build.ts --target=opencode-windows-x64 --skip-install --skip-web-ui --outdir=dist-folding
```

For standard Apple Silicon macOS, use `--target=opencode-darwin-arm64`.
Verify the resolved output path is inside this fresh checkout before invoking
the upstream build, which removes/recreates that output directory. The browser
web UI is intentionally omitted. `--version` is a binary startup smoke check;
it does not establish physical terminal UI verification.

## Known wider-monorepo limits

The intended lint chain completed with 1,307 warnings and zero errors; every
warning was in files identical to the pinned baseline and rules/config were
unchanged. SDK documentation checking reported zero problems. This does **not**
mean the entire upstream monorepo check passed: the filtered install does not
include the website's Astro toolchain, so the broad typecheck stopped there.

After installing extra root lint tools, a hoisted `marked-shiki` peer can resolve
root Marked 17 while the UI uses its pinned Marked 18. An unchanged baseline UI
reproduced that mismatch. An owner-local byte-identical copy of `marked-shiki`
1.2.1 restored its UI peer resolution; baseline and candidate UI checks then
passed. No source casts, version changes or lockfile overrides were used.

## Attribution

OpenCode is MIT-licensed, copyright (c) 2025 opencode. The original notice and
terms are retained in [OPENCODE-LICENSE.txt](OPENCODE-LICENSE.txt). The parent
plugin's existing MIT license and copied-fixture notices remain in place.
