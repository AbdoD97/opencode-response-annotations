# Validation record — 2026-10-17

## Automated checks

- TypeScript SDK type check: PASS.
- Seven Node domain tests: PASS.
- Ten OpenTUI component/edge-case tests, 36 assertions: PASS.
- Compiled plugin build: PASS.
- Independent reviewer found a short-line vertical navigation regression; fixed and its regression test now passes.

Renderer tests use real OpenTUI with fixture host APIs. They do not alone prove host key routing or remote delivery.

## Actual host smoke test

Official `@opencode/cli-linux-x64` 2.0.32 binary, isolated temporary XDG config/data/state/cache, no account or model credentials and no model calls. A synthetic assistant session was imported through the official session import command.

- Load absolute plugin directory through global `cli.json`: PASS. `/annotate` appears in slash suggestions.
- No-session command safety: PASS; shows “Open a session first.”
- At 140 columns, command opens docked annotation sidebar beside transcript: PASS.
- Actual `r` key opens source picker; Enter selects fixture response: PASS.
- Actual Shift+Right selects exact `Alpha` range 0–5; `a` saves highlight-only note #1: PASS.
- Disk JSON retains source session/message/part, snapshot, range, exact quote and blank comment: PASS.
- Actual edit dialog updates comment to `Clarify this passage`: PASS.
- Ctrl+S opens review/confirmation; Escape cancels without admission: PASS. No model request made.
- Full host restart at 90 columns restores note/comment and uses fullscreen panel fallback: PASS.
- Actual edit/remove flow removes the note and pending indicator: PASS.
- Escape closes panel and main composer accepts an unsent draft: PASS. No draft submitted.

## Not verified

Real-model delivery, server idempotency under network faults, multi-process storage races, dynamic resize while selecting, mouse-drag selection, platform-specific Windows/macOS behavior, exhaustive performance/stress, and plugin removal/data lifecycle. No claim of full feature parity or production certification.

Same-ID admission deduplication is supported by inspected host source; failure/retry behavior is unit/component-tested, not exercised against a live remote model. The source viewer is Markdown text in a separate sidebar, not in-place rendered-transcript annotations.
