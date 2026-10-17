# Capability and readiness matrix

| Requested behavior | Implementation | Verification / difference |
|---|---|---|
| Select a response passage | Exact grapheme-safe keyboard range selection on a chosen completed assistant text part | Domain + rendered component tests; real host Shift+arrow dispatch verified |
| Annotation sidebar beside conversation | Public session.panel slot, default docked presentation | Host source confirms 108-column threshold; narrow terminals become fullscreen |
| In-place transcript highlight / mouse drag | Not implemented | No documented semantic response-range or message-render slot; no private render-tree hacks |
| Numbered, anchored notes | Session/message/part/snapshot/range, stable numbers and underline/start markers | Repeated quotes, reversed selection, whitespace and Unicode tested |
| Optional comment, edit, remove | Separate dialogs; highlight-only shortcut | Rendered component workflow tested; prepared uncertain batches cannot be edited |
| Several pending notes | Durable host JSON store | Domain isolation and JSON restoration tested; disk write and host restart verified; multi-process propagation pending |
| Compact main composer | Pending-count row; untouched main draft | Slot/source implementation checked; live loading, close/focus return and restart smoke-tested |
| Batch with full context | Explicit confirmation; full selected source and sibling assistant text parts, precise numbered quotes/comments | Payload tests; no real model call performed |
| Sent references | Saved references open their original snapshots in sidebar | Component test; no clickable decorations in main transcript |
| Duplicate/uncertain sends | Prepared stable ID, queue admission, retry same payload/ID | Failed-response/retry tests; host source confirms idempotent admission |
| Cross-session / changed confirmation | Source reset, async result guards, note-snapshot comparison, revert checks | Component tests and independent review; real multi-instance race testing pending |
| Supported local install | Root tui.js + package ./tui export and compiled dist | Published Host.resolve/import smoke test succeeds; live official V2 2.0.32 host loaded plugin via global cli.json |

## Important remaining limitations

- This is a terminal **sidebar adaptation**, not one-to-one in-transcript desktop annotation parity.
- Live host tests cover loading, real keys/focus, reopening/restart persistence and narrow-terminal fallback. Dynamic resize, plugin removal/reload, multi-process races, performance limits and actual model delivery remain unverified.
- The host integration harness uses fixture data and storage callbacks. Passing it does not prove disk-failure atomicity or remote-server behavior.
- The panel displays raw Markdown source. Tables, links and formatting are not rendered like the main transcript. Tabs/newlines use visible glyphs; stored quotes preserve original bytes/UTF-16 text.
- Mouse dragging is not an annotation selection method. Use keyboard ranges. Clicking the composer count opens the panel and clicking the panel requests focus, but actual mouse routing remains unverified; keyboard focus return was exercised.
- Sent batches are immutable. An uncertain or failed prepared batch must be retried; this version cannot discard a permanently rejected one. No transcript edit or delivery rollback is attempted.
- Each note stores a source snapshot. Very large responses and many notes increase local storage and prompt token usage. Confirmation reports selected-source character count, not an exact model-token estimate. No truncation is performed.
- Retention follows the host plugin store; there is no separate data-export/retention UI yet. Removing the plugin does not promise deletion of existing stored annotations.
- Source-history display uses snapshots; it does not silently re-anchor to revised transcript text or force-fetch deleted historical messages.
- OpenCode V1, desktop GUI, and unsupported V2 versions are not supported. Official platform binary availability must be confirmed before asking a user to upgrade.
