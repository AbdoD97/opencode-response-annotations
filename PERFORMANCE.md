# Performance, payload and storage evidence

Current candidate: 0.3.0, measured 18 October 2026 on Windows x64 with Node 24.19.0 and Bun 1.4.3. All fixtures are synthetic. No provider traffic, real conversation, credential or active user store was used. Numbers are observations on a shared VM, not latency/cost guarantees.

## Reproduce and distinguish the boundaries

- `node script/measure-payloads.ts`: constructed prompt text, JSON argument and HTTP-body bytes, with a labeled token heuristic. No network.
- `node script/benchmark-storage.ts`: pure codec/send-preparation timings and the adapted pinned OpenCode host's real locked file load/atomic rename on disposable files.
- `node script/benchmark-annotations.ts`: selection/bounds and domain work. It does not include complete host storage or provider latency.
- `npm run test:panel`: real OpenTUI renderer with fixture dialogs/admission; frame timing/cleanup, not native Windows keyboard routing.
- `npm run test:host`: actual published client with offline transport, pinned host storage fixture and separate headless process locking.

Current raw results: `benchmark-results/v030-payloads.json` and `v030-storage-windows-node.json`. Older `node-before.json`, `node-after.json` and `bun-after.json` are historical 0.2.0-era Linux results, not measurements of the current serializer/storage implementation. In particular, earlier claims that new sends carry full source context or that durable snapshots always remain self-contained per note are obsolete for the opt-in v2 format.

## Client payload bytes are not tokens or cache hits

New batches contain exact quotes/comments once per annotation, stable numbers and one shared instruction paragraph. They add no nearby excerpts, response-group labels, full snapshots, timestamps, source IDs or offsets. Deliberately repeated/overlapping annotations remain distinct. Existing prepared payloads are frozen and may retain older formatting/context.

| Synthetic fixture | 0.2.0 text bytes | 0.2.1 text bytes | 0.3.0 text bytes | Reduction from 0.2.1 |
|---|---:|---:|---:|---:|
| One note / 10K source | 20,843 | 633 | 355 | 43.92% |
| Five notes / same 100K source | 201,559 | 1,053 | 775 | 26.40% |
| Six notes / two selected parts / three-part 120K response | 322,234 | 1,527 | 885 | 42.04% |

For those fixtures, the current JSON HTTP-body sizes are 477 / 945 / 1,069 bytes, compared with 763 / 1,231 / 1,737 for 0.2.1. These are client construction sizes; HTTP framing/headers and final host/provider prompt compilation are excluded. The actual published client envelope is separately checked by an offline fetch fixture.

The explicit estimator is `ceil(UTF-8 text bytes / 4)`: 0.2.1 estimates 159 / 264 / 382 tokens; 0.3.0 estimates 89 / 194 / 222. It is a coarse English-oriented heuristic, not a tokenizer, billable usage or model-context measurement. Unicode, provider lowering, history/compaction and model tokenizers can differ. No cache-read/write savings, unchanged answer quality or actual context-window reduction was measured.

## Local deduplication is optional and separate

Without migration, v1 files keep their existing duplicated snapshots. Opt-in v2 stores one immutable source record per revision and small note references, including across prepared/sent history. Identity binds session/message/part/text and the complete sibling snapshot array; differing sibling revisions are retained separately. Source text may still occur twice within a single record if the selected part also exists in its full response-parts snapshot; this is not universal substring deduplication.

Synthetic 10K source shared by 1 / 10 / 100 notes; sizes count UTF-8 JSON bytes:

| Notes | Pending v1 → v2 | Prepared v1 → v2 | Sent v1 → v2 |
|---:|---:|---:|---:|
| 1 | 20,222 → 20,429 | 40,820 → 21,017 | 20,646 → 20,853 |
| 10 | 201,844 → 21,961 | 404,973 → 24,990 | 203,178 → 23,295 |
| 100 | 2,018,316 → 37,533 | 4,047,187 → 65,404 | 2,028,921 → 48,138 |

For one pending/sent note the revision table is slightly larger; for many shared notes it is much smaller. Sources unique to every note can still dominate storage. Sent history grows until the cap refuses new writes. A source is released only when no pending/prepared/sent note references it; malformed orphan records are refused for recovery, not silently discarded. No historical notes are pruned to improve these numbers.

## Validation, preparation and actual file-write cost

Three warmups and 15 pure iterations; file edits have two warmups and 10 measured operations. p95 is the nearest upper order statistic; samples are small and noisy. Both formats use the new validation, not an unvalidated old-code baseline.

Median/p95 milliseconds:

| Shared notes | Prepare v1 | Prepare v2 | Host locked edit+rename v1 | Host locked edit+rename v2 |
|---:|---:|---:|---:|---:|
| 1 | 1.149 / 4.775 | 1.428 / 1.879 | 19.265 / 25.650 | 18.663 / 22.885 |
| 10 | 5.322 / 6.662 | 4.846 / 10.074 | 22.783 / 24.704 | 19.821 / 20.706 |
| 100 | 49.400 / 71.595 | 40.519 / 49.609 | 84.197 / 96.836 | 25.663 / 50.949 |

Preparation includes clone, graph/provenance validation, deterministic message creation and output encoding. It excludes actual model admission and provider latency. Whole-store validation, hashing, read/clone/write and retained history are not constant-time. Integrity checks add work even when payloads are small; v2 does not universally make every operation faster. The fixture retains the pinned host's storage/Flock/atomic-rename implementation, with UI provider imports removed; it is not a running complete OpenCode TUI.

## Render and idle behavior

The final combined renderer fixture observed mean flush times of 17.392 ms baseline and 17.036 ms with the plugin, dominated by frame scheduling. This is not evidence of a negative CPU cost or a meaningful speedup. Idle frames read message history zero times. In 100 setup/cleanup cycles, plugin selection listeners returned to baseline and all 200 slot cleanups ran. Validation/view decoding is reactive to store changes rather than a polling/frame loop.

The sidebar still renders note cards, not full response copies. Many long quotes/comments can cost layout time; virtualization, exhaustive resizing and a long performance soak were not tested. Native terminal input and live model latency are unverified.

## Bounds, failure and migration caveats

Character/range limits use JavaScript UTF-16 units; file/prompt limits use UTF-8 bytes. Existing conservative bounds remain: 100K selected part, 250K response text parts, 10K history messages, 16M history characters, 100K history parts, 2,048 selected renderables, 64 ancestor edges, 100 pending notes, 20K comment units, 1 MB prepared payload and 8 MB persisted state. Nothing is truncated to fit. Oversized legacy prepared text is preserved but refused for sending.

Revision graph validation checks exact quotes, endpoints, identities, hash, counters and frozen-note consistency. The host's unreadable-JSON fallback is not accepted as writable empty data, including the known cached older empty-v1 fallback. New/ambiguous empty stores require offline initialization/migration. This does not authenticate valid fabricated data or demonstrate hard power-loss durability.

Live migration is deliberately deferred while an older session is open. The offline tool verifies a backup, retains prepared text/IDs, uses the host lock, refuses stale bytes and supports lossless current-state rollback. An expanded rollback may exceed the old write cap; data is retained and later writes may refuse. See [STORAGE.md](STORAGE.md). Smaller client payload is not a reason to weaken source validation, regenerate old messages or alter host-owned system/tool/provider/cache state.
