import { createStorage } from './upstream-storage.ts'
import { mutateStoredState } from '../../src/storage.ts'
import { addNote } from '../../src/model.ts'

const [root, id] = process.argv.slice(2)
const host = createStorage(root, 'latest')
const [, update] = host.storage.store<object>('plugin.response-annotations.annotations-v1', { initial: { version: 0 } })
try {
  await update(raw => mutateStoredState(raw, state => addNote(state, { sessionID: 's', messageID: 'm', part: 0, text: 'Alpha beta' }, 0, 5, id, id)))
  await host.storage.flush()
} finally { host.close() }
