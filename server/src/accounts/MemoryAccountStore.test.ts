import { describeAccountStoreContract } from './accountStoreContract'
import { MemoryAccountStore } from './MemoryAccountStore'

describeAccountStoreContract('memory account store', async () => {
  const store = new MemoryAccountStore()
  // A new store each time is an empty store.
  return { store, reset: async () => undefined }
})
