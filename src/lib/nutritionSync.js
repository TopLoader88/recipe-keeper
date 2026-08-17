/* Sync-adapter seam for the food diary. Today everything is local-only (offline,
   no accounts), but diary logging routes through here so a future provider - e.g.
   Fitbit once its OAuth app is registered, or its Google Health successor - can be
   dropped in without touching the diary UI.

   An adapter implements:
     id           string
     label        string
     isConnected() -> boolean
     connect()     -> Promise         (kick off OAuth / pairing)
     disconnect()  -> Promise
     logEntry(e)   -> Promise         (push one diary entry to the provider)

   Register one with registerSyncAdapter() and select it with setActiveAdapter().
   syncLogEntry() is called after every local diary write and must never throw. */

const localAdapter = {
  id: 'local',
  label: 'This device only',
  isConnected: () => true,
  connect: async () => true,
  disconnect: async () => true,
  logEntry: async () => true
}

const adapters = new Map([[localAdapter.id, localAdapter]])
let activeId = 'local'

export function registerSyncAdapter(adapter) {
  if (adapter && adapter.id) adapters.set(adapter.id, adapter)
}

export function listSyncAdapters() {
  return Array.from(adapters.values())
}

export function getActiveAdapter() {
  return adapters.get(activeId) || localAdapter
}

export function setActiveAdapter(id) {
  if (adapters.has(id)) activeId = id
}

/** Fire-and-forget push of one diary entry to the active provider. A failure here
    (offline, revoked token) must never break the local log, so it's swallowed. */
export async function syncLogEntry(entry) {
  const adapter = getActiveAdapter()
  if (!adapter || adapter.id === 'local') return { ok: true, local: true }
  try {
    await adapter.logEntry(entry)
    return { ok: true }
  } catch (err) {
    console.warn('diary sync failed', err)
    return { ok: false, error: String(err) }
  }
}
