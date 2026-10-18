# Annotation storage and offline migration

0.3.0 does not migrate data during plugin setup or ordinary CRUD. Existing nonempty v1 stores use the quote-only formatter immediately after reload, with existing snapshots/history preserved. Their local snapshot duplication remains until the user opts into v2. No resolver, extra model tool/session, context hook, provider override or cache policy is introduced.

## State and validation

The TUI storage key remains `annotations-v1`; its host file is normally `plugin.response-annotations.annotations-v1.json` under the active channel's `tui` state directory. Use the state path for the actual profile, not a different default profile. `opencode debug paths` reports the profile's state root; the pinned host then adds the channel (usually `latest`) and `tui`.

Schema v2 declares `coordinates: utf16-selected-part-v1`. It retains a table of immutable source records keyed by SHA-256 of session ID, message ID, original content-part index, exact selected-part text and the complete sibling-text snapshot array. Each pending and batch note refers to that revision. This deduplicates shared source records across pending, prepared and sent notes; it does not pretend to deduplicate every equal substring within a record.

The codec verifies IDs, counters, status, graph references/hashes, same-ID content consistency, session ownership within batches, exact `quote === source.text.slice(start, end)`, and grapheme endpoints. Unknown fields/units, conflicting copies, orphan/missing revisions and ambiguous graphs are refused for explicit recovery. Deleting the last pending reference may release its now-unused revision; revisions still referenced by prepared or sent history are retained.

A note ID may belong to only one batch. A sent note cannot remain pending; the only allowed overlap is an identical pending note and its own prepared batch. These ownership rules apply to both schemas and are checked before any transaction or migration changes data. Edit and remove dialogs capture the displayed note's canonical contents, then compare that snapshot with the freshly locked note before changing it. A changed or removed target produces a visible review-again error; an unrelated note change does not block the action.

The host performs locked fresh loads and atomic rename, but catches parse/read errors and returns its initial object. The plugin supplies an invalid sentinel and refuses the known entirely empty v1 fallback of older cached generations too. A genuinely empty v1 file is indistinguishable from that fallback, so only the offline migrator may accept it. New stores must be explicitly initialized. An error display is not a writable empty queue. This is structural corruption protection, not authentication against another malicious plugin replacing a file with valid fabricated data, and not proof of power-loss durability.

## Safe opt-in procedure

1. Leave any currently active test session alone until the user is ready to close it. Close all OpenCode windows normally before applying migration; do not run old and new storage writers together.
2. In this repository with its locked development dependencies installed (`npm ci`), identify the explicit absolute file for the intended profile. The helper uses Node and the pinned host lock implementation; it does not need credentials or a model.
3. Preview: `node script/manage-annotation-store.ts migrate "ABSOLUTE_STORE_FILE"`. A preview validates and reports only counts, hashes and bytes; host lock bookkeeping may be created, but data is not rewritten.
4. Apply: `node script/manage-annotation-store.ts migrate "ABSOLUTE_STORE_FILE" --apply --offline`.
5. Restart OpenCode with the same profile and plugin. Existing batch text stays unchanged; only new batches use the quote-only formatter.

The apply path performs a read-only process inventory and refuses if an official `opencode`/`opencode2` process is detected or the inventory cannot be checked. This is a conservative guard, not proof against a renamed/custom TUI or a new old-version process launched after the check. The operator's offline precondition remains necessary. The helper never closes a process, changes permissions/settings or authenticates.

Within the host's per-file lock it validates, writes/verifies a byte-identical sibling backup named with the original SHA-256, checks frozen manifests, writes/fsyncs a unique temporary file, verifies source bytes again, then renames. The backup is not overwritten with different content. Interrupted writes preserve the original plus verified backup; stale source bytes refuse replacement. Directory fsync/power-loss recovery is not claimed. Outputs and malformed-JSON errors do not print quote/comment content.

For a genuinely new missing file, use `initialize` instead of `migrate`, with the same `--apply --offline` gates. Initialize refuses every existing file, including corrupt files. For an existing valid empty v1 file, use migration, which backs it up first.

## Rollback and recovery

Close all OpenCode windows first. Preview/apply `rollback` with the same command shape to export the **current** v2 notes and history into v1, with a backup. Then restore compatible older plugin code and restart. Do not simply restore an old data backup after new notes were added: that would hide later data. Lossless rollback can exceed the old 8 MB write cap; it keeps all records, and older code may refuse subsequent writes rather than silently trim them.

Corrupt or unsupported input is not repaired automatically. Keep the original and backups for manual review. Never delete an uncertain batch or create a new retry ID to bypass an error. A backup contains private annotation data; keep it local and do not publish it with source or review artifacts.

The VM release workflow deliberately defers live migration while the user's session is open. Shipping the compatible code does not claim that the live store has been deduplicated.
