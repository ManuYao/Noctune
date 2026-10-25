import { randomUUID } from 'node:crypto'
import { MemoryPlaylistStore } from './MemoryPlaylistStore'
import { describePlaylistStoreContract } from './playlistStoreContract'

describePlaylistStoreContract('memory playlist store', async () => {
  // A new store each time is an empty store.
  return { store: new MemoryPlaylistStore(), reset: async () => undefined, newAccount: async () => randomUUID() }
})
