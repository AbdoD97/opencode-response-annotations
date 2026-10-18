# Desktop response-annotation reference

## Evidence and scope

Inspected on 2026-10-17: the bundled renderer assets in **ChatGPT Linux preview 26.1013.40934, amd64**. Package metadata identifies OpenAI as maintainer. The official [Linux desktop documentation](https://learn.chatgpt.com/docs/linux/linux-app) links the [x64 Debian package](https://persistent.oaistatic.com/codex-app-prod/linux/deb/latest/chatgpt_amd64.deb). That `latest` URL is mutable; the version above identifies this inspection.

This was static archive inspection, not a running-app observation. No application installation, execution, sign-in, or user data was needed. The downloaded Debian archive had an incomplete tail, but the three inspected renderer files were complete and their SHA-256 digests matched the integrity entries embedded in its ASAR manifest. This is an internal consistency check, not independent signature verification of the complete package.

These findings concern the **Codex response-text annotation path inside the desktop package**. The package also contains a separate ChatGPT selected-text attachment path. They do not establish identical behavior in all ChatGPT modes, releases, operating systems, or feature-flag configurations.

## Verified behavior

1. A response-text selection can open an editor for an optional comment. Empty comments are allowed; the default create action saves rather than immediately sends.
2. Each saved annotation has its own ID, selected text, optional comment, source information, and a UI anchor. The add handler appends a new entry rather than merging entries with identical text.
3. Pending annotations are held in composer state and backed by a per-conversation draft store. They are not merely a temporary selection popup.
4. Response markers are numbered by their position in the annotation array. A marker can reopen the editor; editing updates the comment and deleting removes the entry by ID.
5. Normal composer submission gathers the pending annotations into one request. The model-facing representation includes selected text, optional comment, and source message/offset information, rather than the local DOM locator or annotation ID.
6. Accepted/successful and queued submission paths use composer clearing that empties the annotation array and closes its editor. The marker layer renders nothing when there are no annotations. Failure and uncertain-outcome handling has separate paths; this inspection does not claim every error case has been exercised.
7. A separate single-annotation direct-send path also exists. It preserves the other composer draft and removes the submitted annotation after acceptance only if that annotation is still current. The reference is therefore not exclusively batch-only.

## Source anchoring and repeated wording

The UI anchor scopes a selector to both conversation and response message. It stores DOM text offsets and the exact selected range text. Source information separately carries the response message ID and start/end offsets relative to the response-text root.

When restoring an anchor, the implementation resolves the offsets and checks that the reconstructed text matches the saved selection. A mismatch does not silently attach the marker to the first identical phrase elsewhere. Identical text in different positions can remain distinct selections, and the add handler does not impose text-only deduplication.

This suggests an independent implementation should preserve source identity and offsets, retain distinct repeated selections, and clear only annotations covered by an accepted submission. It does not require copying the reference's code or rendering system.

## Traceable asset references

All names below are within `webview/assets/` in the package's `app.asar`. Minified symbols are version-specific.

- `annotation-editor-6fde431ae893.js`: exported `SelectedTextAnnotationEditor`; optional comment, empty submission, saved default, editing/deletion callbacks.
- `app-initial-a68277f60b93.js`: `JAa`/`YAa` create entries; `XAa` edits; `ZAa` deletes; `mAa`/`s_a` connect per-conversation drafts; `J4l` captures anchors and source offsets; `PAa`/`FAa` clear composer state. Its context serializer emits the response annotation array.
- `app-primary-f5ea123a0407.js`: `Ynt`/`Unt` render numbered markers; `Nnt` validates restored range text; `nrt` handles direct-send acceptance; `ylt` snapshots annotations for submission; `b2e` clears the composer.

Verified SHA-256 digests:

- `annotation-editor-6fde431ae893.js`: `73659ca5e566355f1497f3fa1eb99428b463d5e6fe1134d0b864d801b299aed0`
- `app-initial-a68277f60b93.js`: `b318e416b71c011ebb74202454f98cfa85defa8baaa17b7eadfb7e8e474b60fb`
- `app-primary-f5ea123a0407.js`: `df25f4adacd596d1280b5a1ad5ba75d7aeb73adbc7ca6524c0fcf48e6891814c`

## Not established

No runtime interaction test, screenshots, exact visual-layout comparison, account availability check, cross-platform comparison, or exhaustive failure/concurrency test was performed on the reference application. The findings are a behavioral reading of shipped assets, not a supported public API or a claim of runtime parity for this project.

This document is an original summary. No proprietary implementation code or extracted application assets are included in this project.

## Request-construction follow-up (2026-10-18)

A separate read-only inspection of the same 26.1013.40934 desktop assets reverified the above asset digests and traced the composer snapshot through the context serializer, prompt wrapper and request builder into `request.input`, then `turn/start` or `turn/addUserMessage`. The annotation section is a compact array of selected `text`, optional `annotation`, and optional `source` containing `messageId`, `startOffset` and `endOffset`, accompanied by one shared instruction paragraph. Full response/sibling snapshots, local annotation IDs and DOM anchors are absent from that serialized annotation section; richer state remains in local/draft storage.

This follow-up is static request-construction evidence reported by the parallel researcher, not traffic captured on this VM or observation of a final server/model prompt. It supports retaining snapshots locally instead of automatically expanding them into prompts. It does not require this independent plugin to expose JSON, and OpenCode has no corresponding source-ID resolver established by this inspection. The plugin therefore sends self-contained readable quotes/comments with bounded context rather than opaque IDs alone.
