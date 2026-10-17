# Performance and clutter review

Local synthetic measurements, 2026-10-17. These are not a guarantee of zero latency or measurements of the complete OpenCode CLI. No model calls or external host/network operations were used. The integration fixture uses real OpenTUI/Solid rendering and a fixture host context, not real host keyboard routing or persistence I/O.

## Reproduce

- `node script/benchmark-annotations.ts`
- `node_modules/.bin/bun script/benchmark-annotations.ts`
- `node --test test/performance-bounds.test.ts`
- `node_modules/.bin/bun test --preload @opentui/solid/preload test/performance-lifecycle.test.tsx`

Raw JSON runs are in `benchmark-results/`. Linux x64, AMD EPYC 9V74, nine visible logical CPUs; Node 24.19.0 and Bun 1.4.3. Five warmups and 30 measured iterations normally; ten measured iterations for 100K+ source cases; drag rejection uses 100 warmups/1,000 iterations. p95 uses the nearest upper order statistic, so small samples and shared-machine scheduling are noisy. Fixtures have approximately 1K characters per prior assistant message, a uniquely identifiable selected response and an exact selected passage near its end.

## Bottleneck found and corrected

The old capture and validation paths allocated grapheme segment objects and a boundary array for the entire selected response. Node baseline capture at 100K characters/1K history messages was 13.54 ms median, 16.70 ms p95; 500K/10K history was 69.15/96.51 ms. Validation repeated comparable work.

Capture and commit now use `Intl.Segmenter.segment(text).containing(offset)` for exact endpoint checks instead of a full boundary array. Tests compare this against full segmentation including combining marks, emoji ZWJ, regional indicators and CRLF. Legacy cursor helpers remain but are not called by the native selection workflow. Larger responses are refused, not truncated.

Representative post-fix run (median/p95 milliseconds):

| Work | Node | Bun |
| --- | ---: | ---: |
| Resolve 1K source / 100 messages | 0.037 / 0.137 | 0.024 / 0.115 |
| Resolve 10K source / 1K messages | 0.090 / 0.499 | 0.127 / 0.152 |
| Resolve 100K source / 1K messages | 0.072 / 0.941 | 0.086 / 0.111 |
| Resolve 100K source / 10K messages | 0.469 / 0.968 | 0.496 / 1.487 |
| Revalidate 100K source / 10K messages | 0.965 / 1.083 | 0.464 / 2.721 |
| Resolve Unicode 50K UTF-16 units / 1K messages | 0.153 / 0.460 | 0.064 / 0.113 |
| Resolve 1K selected renderables / 1K messages | 0.397 / 0.551 | 0.052 / 0.094 |
| Reject repeated passage, 90K source / 1K messages | 0.141 / 0.187 | 0.039 / 0.719 |
| Refuse 500K source | 0.004 / 0.006 | 0.001 / 0.006 |
| Prepare batch, 100 notes on shared 10K source | 5.509 / 7.339 | 1.546 / 2.018 |

The table is a representative preceding run; reruns in the JSON artifacts naturally differ. JSON serialization/storage validation is intentionally measured too: at 100 notes, persisted sent-state serialization was 2.01/2.94 ms Node, 0.27/0.80 ms Bun. Adding a 101st pending note is a refusal, not a successful commit benchmark.

## Idle work and cleanup

`performance-lifecycle.test.tsx` forces 30 real-renderer idle flushes without the plugin, then 30 with the plugin. Mean wall times were 16.37 ms and 16.52 ms per flush, dominated by the renderer's frame scheduler. This is not a meaningful CPU delta and must not be represented as a precise overhead percentage.

More importantly, idle frames caused **zero message-history reads**. Across 100 setup/cleanup cycles, selection listener count always returned to its original baseline; all 200 registered slot cleanups ran. The test verifies these counts rather than asserting machine-sensitive timing thresholds.

Static review: one event-driven selection listener; no polling timer, frame callback or full-transcript re-render loop. Capture invalidation is reactive to session/source changes while a capture exists. Capture retains one bounded source, not a growing cache. Pending-note and sent-reference derivations are memoized. Ancestry traversal is capped at 64 edges, rejecting cycles. Full-history scans run for capture/validation, not ordinary idle frames; they enforce uniqueness conservatively. No cache is used for source validity because stale cached provenance would be unsafe.

## Hard bounds and failure behavior

Character limits count UTF-16 code units. Byte limits use UTF-8 encoding. Supported inputs at the bounds remain eligible, subject to exact-source, unique-quote and other correctness checks. Nothing is silently truncated and stored history is never automatically pruned.

- Selected source part: 100,000 characters. Error: “Response is too large to annotate safely (100,000 characters per selected part). Use a shorter response.”
- Selected response's complete text parts: 250,000 characters. Model-level error: “Response is too large to annotate safely (100,000 characters per selected part; 250,000 across text parts). Use a shorter response. Nothing was removed.”
- History: 10,000 messages; 16,000,000 scanned completed-assistant text characters; 100,000 scanned completed-assistant content parts. Errors identify the bound and say “Use a shorter session.”
- Selection: 2,048 renderables; 64 ancestor edges. Oversize selections say “Selection is too large. Select a shorter passage.” Cyclic/deep ancestry says “Selection render tree is too deep or cyclic; select another passage”.
- Pending queue: 100 notes globally. Error: “Pending annotation limit reached (100). Send or remove pending notes first.”
- Comment: 20,000 characters. Error: “Comment is too long (20,000 characters maximum). Nothing was changed.”
- Prepared payload: 1,000,000 bytes including serialized context/instructions. Error: “Annotation payload exceeds 1 MB. Remove some pending notes and retry; no notes were sent or removed.”
- Persisted state: 8,000,000 bytes. Error: “Annotation storage would exceed 8 MB. Existing notes are preserved; remove unneeded pending notes or use another project.”
- A legacy prepared payload above 1 MB is preserved but refused: “Saved annotation payload exceeds 1 MB. It remains preserved and was not sent; export/review it manually.” Supported-size prepared retries preserve their original ID and exact payload. There is no built-in export/archive UI; manual recovery of oversized legacy records remains a limitation.

Limits reject before mutation. Size checks occur on explicit capture/commit/edit/send work, not every frame. JSON encoding still scales with existing stored history during mutations. The storage cap does not shrink an already oversized legacy store or guarantee a constant-time legacy-store load. Sending a large pending queue can temporarily require substantially more storage while both prepared batch and original notes coexist, and may be refused even below 100 notes.

## Storage and visual tradeoffs

For 1 / 10 / 100 notes all referencing the same 10K response, measured pending state was 20,259 / 202,079 / 2,020,441 bytes. Prepared state was 61,430 / 426,753 / 4,080,397 bytes; sent state 41,225 / 224,729 / 2,060,012 bytes. Payloads were 20,800 / 22,268 / 37,029 bytes. Payload sources deduplicate, but durable note snapshots intentionally remain self-contained and sent history grows until the storage bound prevents new additions. No historical notes are silently lost to optimize space.

The panel renders pending note cards, not duplicated full assistant responses. A compact pending count is shown only while notes exist; successful persisted admission empties the queue and closes the panel. Large legacy queues or unusually long quotes/comments can still cost render/layout time; this review does not claim virtualization or zero cost for visible cards. Full-source context is carried in the explicit Send payload, not pasted into the main composer or shown as a second transcript.
