import { createMemo } from 'solid-js'
import type { Context } from '@opencode/plugin/tui/context'
import { initialState } from './model.ts'
import type { State } from './model.ts'
import { readStoredState, mutateStoredState, UNINITIALIZED_STORE } from './storage.ts'

export function annotationStore(storage: Context['storage']) {
  const [raw, rawUpdate] = storage.store<object>('annotations-v1', { initial: UNINITIALIZED_STORE })
  const empty = initialState() // Display fallback only. Never supplied to storage.
  const view = createMemo(() => {
    try { return { state: readStoredState(raw), error: undefined } }
    catch (error) { return { state: empty, error: error instanceof Error ? error.message : String(error) } }
  })
  return {
    get state() { return view().state },
    get error() { return view().error },
    update(mutation: (state: State) => void) { return rawUpdate(draft => mutateStoredState(draft, mutation)) },
  }
}
