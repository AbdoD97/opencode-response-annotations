import solidPlugin from '@opentui/solid/bun-plugin'
const result = await Bun.build({entrypoints:['src/tui.tsx'],outdir:'dist',target:'bun',format:'esm',plugins:[solidPlugin],external:['@opencode/plugin/tui','@opentui/core','@opentui/solid','solid-js','solid-js/store'],minify:false,sourcemap:'external'})
if(!result.success) { console.error(result.logs); process.exit(1) }
