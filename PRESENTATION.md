# Sent annotation presentation: supported surfaces

Inspected official OpenCode 2.0.32, source commit `594af423e8676b8458d6ef125ddde6766afad392`, and published plugin typings. This is a feasibility record, not a claim that expandable transcript cards were implemented.

## Exact limitation

The [user-message row](https://github.com/anomalyco/opencode/blob/594af423e8676b8458d6ef125ddde6766afad392/packages/tui/src/routes/session/index.tsx) renders `message.text` with a plain text component. Its click handler opens the host's message-actions dialog. It does not read annotation metadata, offer a custom user-message renderer or mount a plugin slot inside that row. This explains why a sent batch's Markdown headings/fences appear literally.

The [public SlotMap](https://github.com/anomalyco/opencode/blob/594af423e8676b8458d6ef125ddde6766afad392/packages/plugin/src/tui/context.ts) provides coarse app/home/prompt/footer/composer/panel/sidebar surfaces. There is no individual transcript-message slot. The app replacement slot would take over the whole application; rebuilding the session UI is outside this plugin's scope. Custom routes/dialogs/panels are separate surfaces, not replacements for one transcript row.

The public Markdown code-block renderer registration concerns Markdown blocks; it cannot intercept the plain-text user row. Native tool output has collapsible presentation, but annotation submission is a user message. Fabricating a tool result, adding model tools/requests, or relabeling annotations as file/skill attachments is not a display-only solution and is not used.

## Supported options

1. Keep the existing host transcript row and request an upstream per-message display extension. A supported renderer given the message ID and safe metadata could later draw local expandable quote/comment items without changing the durable submitted text.
2. With the user's explicit choice, add a separate read-only compact viewer in a supported dialog, panel or plugin route. It could show collapsed items and expand locally, using saved batch notes. The native transcript row would remain. This alternative is not implemented or substituted automatically.

No arbitrary transcript interception, private-renderer patch, host fork, hidden prompt, side session or model-only history transformation is introduced. The existing deterministic text, `session.prompt` envelope, frozen retries, history/system/tool/provider state and cache policy stay unchanged. Local display improvements do not establish actual cache hits, billing savings or source recovery after compaction.

## Implemented independent work

The 0.3.1 candidate fixes the default shortcut to F6 and adds quote previews while creating/editing comments through public custom dialogs. Those local UI changes neither require nor imply support for expandable sent-message cards.
