import { randomUUID } from 'node:crypto'
import { describeActivityStoreContract } from './activityStoreContract'
import { MemoryActivityStore } from './MemoryActivityStore'

describeActivityStoreContract('memory activity store', async () => {
  // A new store each time is an empty store.
  return { store: new MemoryActivityStore(), reset: async () => undefined, newAccount: async () => randomUUID() }
})
