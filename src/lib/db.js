/* IndexedDB storage. Everything the app needs lives here, so the library
   works with no account and no connection.

   recipes  – the normalized, editable recipe
   sources  – the untouched capture of where it came from (kept forever)
   settings – small key/value preferences
   grocery  – the shopping list (items grouped by store section)
   mealplan – planned meals per day/slot
*/

const DB_NAME = 'recipe-keeper'
const DB_VERSION = 2

let dbPromise = null

export function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('recipes')) {
        const store = db.createObjectStore('recipes', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
        store.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'recipeId' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings')
      }
      if (!db.objectStoreNames.contains('grocery')) {
        db.createObjectStore('grocery', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('mealplan')) {
        const mp = db.createObjectStore('mealplan', { keyPath: 'id' })
        mp.createIndex('date', 'date')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database is blocked by another open tab.'))
  })
  return dbPromise
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(name, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode)
    let result
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
    Promise.resolve(fn(tx.objectStore(name), tx)).then((r) => { result = r }).catch(reject)
  })
}

/* ---------- change notification ---------- */

const listeners = new Set()

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) {
    try { fn() } catch { /* a broken listener must not block the write */ }
  }
}

/* ---------- recipes ---------- */

export async function getAllRecipes() {
  const rows = await withStore('recipes', 'readonly', (store) => promisify(store.getAll()))
  return (rows || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function getRecipe(id) {
  return withStore('recipes', 'readonly', (store) => promisify(store.get(id)))
}

/* Without a persistence grant the browser may evict IndexedDB under disk
   pressure, and the library is the only copy. Asking on the first write means
   protection is on by default instead of waiting for someone to find the
   button in Settings. Fire-and-forget: a refusal must not fail the save. */
let askedToPersist = false
function persistOnce() {
  if (askedToPersist) return
  askedToPersist = true
  requestPersistentStorage().catch(() => {})
}

export async function putRecipe(recipe) {
  const record = { ...recipe, updatedAt: Date.now() }
  if (!record.createdAt) record.createdAt = record.updatedAt
  await withStore('recipes', 'readwrite', (store) => promisify(store.put(record)))
  persistOnce()
  emit()
  return record
}

/** Bulk write used by restore/merge; emits once. */
export async function putRecipes(recipes) {
  await withStore('recipes', 'readwrite', (store) => {
    for (const r of recipes) store.put(r)
  })
  persistOnce()
  emit()
}

export async function deleteRecipe(id) {
  await withStore('recipes', 'readwrite', (store) => promisify(store.delete(id)))
  await withStore('sources', 'readwrite', (store) => promisify(store.delete(id)))
  emit()
}

/* ---------- cached original sources ---------- */

export async function getSource(recipeId) {
  return withStore('sources', 'readonly', (store) => promisify(store.get(recipeId)))
}

export async function getAllSources() {
  return (await withStore('sources', 'readonly', (store) => promisify(store.getAll()))) || []
}

export async function putSource(source) {
  await withStore('sources', 'readwrite', (store) => promisify(store.put(source)))
}

export async function putSources(sources) {
  await withStore('sources', 'readwrite', (store) => {
    for (const s of sources) store.put(s)
  })
}

/* ---------- settings ---------- */

export async function getSetting(key, fallback = null) {
  const value = await withStore('settings', 'readonly', (store) => promisify(store.get(key)))
  return value === undefined ? fallback : value
}

export async function setSetting(key, value) {
  await withStore('settings', 'readwrite', (store) => promisify(store.put(value, key)))
  emit()
}

/* ---------- grocery list ---------- */

export async function getAllGrocery() {
  const rows = await withStore('grocery', 'readonly', (store) => promisify(store.getAll()))
  return (rows || []).sort((a, b) => (a.order || 0) - (b.order || 0))
}

export async function putGrocery(item) {
  await withStore('grocery', 'readwrite', (store) => promisify(store.put(item)))
  persistOnce()
  emit()
}

/** Bulk write used when adding a recipe's ingredients; emits once. */
export async function putGroceryBulk(items) {
  await withStore('grocery', 'readwrite', (store) => {
    for (const it of items) store.put(it)
  })
  persistOnce()
  emit()
}

export async function deleteGrocery(id) {
  await withStore('grocery', 'readwrite', (store) => promisify(store.delete(id)))
  emit()
}

export async function clearCheckedGrocery() {
  await withStore('grocery', 'readwrite', (store) => new Promise((resolve, reject) => {
    const req = store.openCursor()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) { resolve(); return }
      if (cursor.value && cursor.value.checked) cursor.delete()
      cursor.continue()
    }
  }))
  emit()
}

export async function clearGrocery() {
  await withStore('grocery', 'readwrite', (store) => promisify(store.clear()))
  emit()
}

/* ---------- meal plan ---------- */

export async function getAllMealPlan() {
  return (await withStore('mealplan', 'readonly', (store) => promisify(store.getAll()))) || []
}

export async function putMealPlan(entry) {
  await withStore('mealplan', 'readwrite', (store) => promisify(store.put(entry)))
  persistOnce()
  emit()
}

export async function deleteMealPlan(id) {
  await withStore('mealplan', 'readwrite', (store) => promisify(store.delete(id)))
  emit()
}

export async function clearMealPlan() {
  await withStore('mealplan', 'readwrite', (store) => promisify(store.clear()))
  emit()
}

/* ---------- housekeeping ---------- */

export async function clearAllData() {
  await withStore('recipes', 'readwrite', (store) => promisify(store.clear()))
  await withStore('sources', 'readwrite', (store) => promisify(store.clear()))
  await withStore('grocery', 'readwrite', (store) => promisify(store.clear()))
  await withStore('mealplan', 'readwrite', (store) => promisify(store.clear()))
  emit()
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage: usage || 0, quota: quota || 0 }
  } catch {
    return null
  }
}

/** Asks the browser not to evict the library under storage pressure. */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/* Read-only check, for showing the true state rather than a claim.
   Worth knowing: a page opened from file:// can never get this grant — Chromium
   awards it on site engagement, which an opaque file origin never accumulates.
   Measured in Edge: persist() returns false, permission stays "prompt". On that
   build backups are the only real protection, so the UI says so. */
export async function isStoragePersisted() {
  try {
    return (await navigator.storage?.persisted?.()) || false
  } catch {
    return false
  }
}

export const isFileBuild = location.protocol === 'file:'

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}
