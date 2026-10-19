# In-transcript annotation folding preview

This feature branch publishes the plugin changes and a pinned OpenCode host patch
for independent cloud review. Stable `main` remains the ordinary `0.3.1` plugin;
this preview is **not approved for stable rollout**.

- Plugin: private package `0.3.1-folding.1`.
- Host: custom `2.0.32-folding.1`, based on official `@opencode/cli` 2.0.32.
- Host patch, license, exact hash/tree and reproduction commands:
  [host-patches/README.md](host-patches/README.md).
- Native host/plugin sources and tests are public here; no user stores,
  conversations, credentials, native binaries, dependency folders or cache dumps
  are part of this publication.

Each sent annotation has a collapsed row in its original conversation. Click a
row, or choose **Focus folded content** from native message actions and use
Up/Down plus Enter/Space. `o` shows the complete original message; Escape returns
focus. Expanded text stays selectable. Missing plugin/local batch data or an
unsupported plan shows the canonical original text.

This is display-only. Saved prepared retries, model text/history/tools/routing
and cache policy are unchanged. No model request is made by folding. There is no
claim of source recovery after compaction or actual cache hits/billing savings.
Official 2.0.32 without the new API continues to show plain text.

## Recorded local validation

220 tests passed: 47 Node unit, 44 panel, 19 host/client, 16 host disclosure,
40 Core lowering/request and 54 AI compiler/cache/compaction/tool-history tests.
TUI, SDK and plugin type checks and formatting passed. The disclosure tests cover
the real headless application/plugin lifecycle, mouse event isolation, native
selection, equivalent resync, focus/escape, narrow/wide resize, 60-note scrolling,
invalid/stale fallback, idle bounds and before/after OpenAI/Anthropic compiled
request equality. Payload measurements equal published 0.3.1.

The original 14 disclosure tests and three focused type checks passed again after
the owner-local peer-layout repair described in the host guide. After the review
performance fix, all 16 disclosure cases (including two new regressions) and the
TUI type check passed again. The other unchanged suites were not rerun for that
fix. Broader monorepo limits are recorded in the host guide; no full-monorepo pass
is claimed.

Plan validation now checks only the bounded requested grapheme endpoints, using
one segmentation object and cached endpoint results. It does not enumerate an
entire 1 MB message to validate a few ranges. The regressions admit a valid body
at the byte/item/section caps without enumeration and check every endpoint pair
in mixed Unicode text for both previews and sections. The caps and exact Unicode
requirements are unchanged. Local measurements are in
[host-patches/performance.json](host-patches/performance.json); they are observations,
not timing guarantees.

The Windows build compiled and reported `opencode v2.0.32-folding.1`. Native
screen/click/typing access was unavailable; headless tests are not a physical
Windows UI test. No live model request, paid CI or real conversation mutation
was used in this validation. A new independent review must pass before any
stable installation is replaced.

## Plugin reproduction

Use Bun 1.4.3 and Node 24.19.0. From this repository:

```text
bun install --frozen-lockfile --ignore-scripts
node --test --test-isolation=none test/*.test.ts
bun run test:panel
bun run test:host
bun run typecheck
bun script/build.ts
```

Use the declared Node runner for unit files, rather than running them all through
Bun's default five-second test limit. Use fresh test profiles and disposable
stores. Host-storage worker tests need normal subprocess support. Direct
`bun script/build.ts` avoids an ignored npm Bun-shim install script on Windows.

Do not share the working installation's profile or annotation store with a
custom build. Keep a verified backup and the official launcher as rollback.
