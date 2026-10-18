# Capability and readiness matrix

| Behavior | Current implementation | Evidence / limitation |
|---|---|---|
| Highlight original response | Native terminal mouse selection in main transcript | Actual 2.0.32 host mouse drag accepted unique Alpha/gamma selections |
| Source identity/ranges | Snapshot, message ID, part index, UTF-16 range | Exact unique source/quote only; version-pinned row-structure adapter, not stable host metadata API |
| Repeated text / formatted ranges | Conservative refusal | Actual repeated beta refused; no first-match guessing, not full desktop range parity |
| Optional local comments | Explicit Annotate selection command, optional dialog, commit/cancel | Real native-selection fixture and actual empty-comment host commit |
| Pending sidebar stack | Scrollable numbered notes only | No source-copy picker/editor; actual two-note docked stack |
| Review/edit/delete | Pending note dialogs, stable numbering | Real renderer fixtures; uncertain prepared batches remain frozen |
| Explicit batch send | One deterministic readable append-only message; exact quote/comment once per annotation, no automatic excerpts or invented response labels | Published client exercised with offline transport; no live model/compiler/cache proof |
| Hide after successful send | Close only after validated admission + durable sent save | Renderer ordering/failure/race tests; no live model admission exercised |
| Uncertain delivery | Stable prepared ID/text, retry identical batch | Admission mismatch, rejected/unknown outcome and failed sent-save/restart tests |
| Existing saved notes | Same key, compatible v1 reader; optional revision-deduplicated v2 via verified offline backup/migration | Frozen batch manifests, corruption refusal, lossless rollback and actual host file locking tested; live migration deferred |
| Main composer | Draft not read/modified/submitted by annotations | Source and fixture checks; separate confirmed model submission |
| Transcript markers | Native temporary selection only | No persistent numbered in-transcript markers or click-to-source restoration |
| Sidebar on narrow terminals | Host fullscreen fallback | Prior prototype host fallback test; corrected layout fixtures, not newly retested live narrow |
| Lightweight idle behavior | No timers/polling/model calls; selection listener cleaned up | 100 setup/cleanup cycles, no idle history reads; see PERFORMANCE.md |

## Remaining limits

- Experimental OpenCode V2 2.0.32 only, not V1 or the desktop GUI. Unknown versions fail closed.
- The host does not provide a stable semantic source-range bridge. Parent/row-ID conventions can change; grouped/unknown layouts are rejected. Other untrusted plugins are outside the adapter's trust boundary.
- Original-highlight workflow is supported for unambiguous exact passages, not arbitrary repeated/Markdown/table/cross-message selections. Source snapshots are not live re-anchored.
- The desktop reference uses message-scoped source offsets and exact anchor validation, also supports direct single-note submission and composer integration. This plugin deliberately provides the requested separate batch queue, not those additional modes.
- Stable per-session numbering differs from the reference's array-index numbering.
- No actual model delivery, end-to-end server deduplication, physical disk failure, compiled provider request/cache behavior, exhaustive dynamic resize or long-running host soak test was performed. Separate-process locking and two-instance mutations were tested on disposable files with the pinned host fixture.
- Source message/part/range provenance stays local. Quote-only prompts do not establish a resolver after compaction, and no backend model-only transform/tool/side session is installed.
- Legacy oversize prepared batches remain intact but are blocked by conservative payload caps; no discard/export/recovery UI is supplied. Sent history is retained, not pruned.
- Previous release validation of the copied-source sidebar does not establish the corrected native-selection workflow. Current evidence is recorded separately in VALIDATION.md.
