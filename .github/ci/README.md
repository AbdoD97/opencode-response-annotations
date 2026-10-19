# Manual preview validation

This CI-only entrypoint lives on stable `main` because GitHub requires a manual
workflow on the default branch. It does not change or install the stable plugin.
Dispatch `preview-validation.yml` on `main`, with a full candidate commit SHA from
this public repository. The initial reviewed candidate is
`74eb2d11df3c105726f7d561b5afa6f817319662` on `folding-disclosure-preview`.

The default is one standard `ubuntu-24.04` job (10-minute limit): frozen installs,
47 Node unit tests, 44 panel tests, 19 host/client tests, 16 host disclosure tests,
40 Core tests, 54 AI tests, three focused type checks and the plugin build. These
are offline fixtures/compiler checks, not live model calls or physical UI tests.
The full upstream website/tooling matrix is intentionally outside this workflow.

Explicit `release_validation=true` adds standard `windows-2022` x64 and `macos-15`
Apple Silicon jobs after Linux succeeds. Each has a 15-minute limit and runs the
presentation unit file, native-selection/comment-dialog fixtures, the 16 host
disclosure cases, one native CLI build and `--version`. Startup and headless
integration are not physical terminal testing. No production rollout is performed.

There are no push, PR or scheduled triggers. Superseded runs on the same workflow
branch cancel. Public repository and default-branch guards prevent this workflow
from being used as a private/paid fallback. There is no larger runner fallback.
Action revisions, Bun 1.4.3, Node 24.19.0, upstream base, patch digest and patched
Git tree are pinned. Input is validated as a SHA and passed as data, never shell
code. Checkouts persist no credentials; workflow token permission is contents-read
only. Tests use isolated process-only XDG paths, disabled catalog/update fetching,
fixture requests and no supplied provider credentials.

Only Bun download caches are retained, split by OS, architecture, Bun version and
lockfile/host-patch hashes. Dependency folders and binaries are not cached or
uploaded. Failure-only diagnostics retain the last 24 KiB per command (under 1 MiB
per job) for one day. No store, profile, environment dump or conversation is
uploaded. The known pinned `marked-shiki` peer-placement repair copies and checks
the same installed bytes under its UI owner only when needed; versions/locks stay
unchanged. Native output is confined to the newly created disposable host checkout.

One initial bounded release validation is authorized. Diagnose and report its
failure before any rerun; do not blindly retry, raise limits or select paid runners.
An independent review must pass before folding is installed as the stable plugin.
