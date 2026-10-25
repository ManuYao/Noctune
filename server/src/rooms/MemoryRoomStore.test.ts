import { randomUUID } from 'node:crypto'
import { MemoryRoomStore } from './MemoryRoomStore'
import { describeRoomStoreContract } from './roomStoreContract'

describeRoomStoreContract('memory room store', async () => {
  // A new store each time is a store with the rooms of the team and nothing else.
  return { store: new MemoryRoomStore(), reset: async () => undefined, newAccount: async () => ({ id: randomUUID(), pseudo: `m${randomUUID().slice(0, 6)}` }) }
})
