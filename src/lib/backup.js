/* Backup and restore.

   The whole library is one JSON file. Point it at a folder that OneDrive or
   Google Drive already syncs and the backup rides along with no account,
   no API keys and nothing sent anywhere the user did not choose. */

import {
  getAllRecipes, getAllSources, putRecipes, putSources,
  getSetting, setSetting, clearAllData
} from './db.js'
import { downloadBlob } from './share.js'

export const BACKUP_FILENAME = 'recipe-keeper-backup.json'

export function supportsFolderSync() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

export async function buildBundle() {
  const [recipes, sources] = await Promise.all([getAllRecipes(), getAllSources()])
  return {
    format: 'recipe-keeper',
    version: 1,
    kind: 'library',
    exportedAt: Date.now(),
    counts: { recipes: recipes.length, sources: sources.length },
    recipes,
    sources
  }
}

export function bundleToJson(bundle) {
  return JSON.stringify(bundle, null, 2)
}

/* ---------- plain download / upload ---------- */

export async function exportToDownload() {
  const bundle = await buildBundle()
  const stamp = new Date(bundle.exportedAt).toISOString().slice(0, 10)
  downloadBlob(new Blob([bundleToJson(bundle)], { type: 'application/json' }), `recipe-keeper-${stamp}.json`)
  return bundle.counts
}

export async function readBundleFile(file) {
  const text = await file.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (data?.format !== 'recipe-keeper' || !Array.isArray(data.recipes)) {
    throw new Error('That is not a Recipe Keeper backup or shared recipe.')
  }
  return data
}

/**
 * @param {'merge'|'replace'} mode
 *   merge   – keep whichever copy of a recipe was edited most recently
 *   replace – wipe the library first
 */
export async function restoreBundle(bundle, mode = 'merge') {
  if (mode === 'replace') await clearAllData()

  const existing = mode === 'merge' ? await getAllRecipes() : []
  const byId = new Map(existing.map((r) => [r.id, r]))

  const incoming = []
  let added = 0
  let updated = 0
  let skipped = 0

  for (const recipe of bundle.recipes) {
    if (!recipe?.id) continue
    const current = byId.get(recipe.id)
    if (!current) {
      incoming.push(recipe)
      added += 1
    } else if ((recipe.updatedAt || 0) > (current.updatedAt || 0)) {
      incoming.push(recipe)
      updated += 1
    } else {
      skipped += 1
    }
  }

  if (incoming.length) await putRecipes(incoming)

  const keepIds = new Set(incoming.map((r) => r.id))
  const sources = (bundle.sources || []).filter((s) => s?.recipeId && (mode === 'replace' || keepIds.has(s.recipeId)))
  if (sources.length) await putSources(sources)

  return { added, updated, skipped }
}

/* ---------- synced-folder file (OneDrive / Google Drive / anywhere) ---------- */

const HANDLE_KEY = 'backup.handle'
const STATUS_KEY = 'backup.status'

export async function getBackupStatus() {
  return (await getSetting(STATUS_KEY, null)) || { lastSavedAt: null, lastCounts: null, fileName: '', auto: false }
}

async function setBackupStatus(patch) {
  const current = await getBackupStatus()
  const next = { ...current, ...patch }
  await setSetting(STATUS_KEY, next)
  return next
}

export async function getBackupHandle() {
  return getSetting(HANDLE_KEY, null)
}

export async function hasBackupFile() {
  return Boolean(await getBackupHandle())
}

async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle?.queryPermission) return true
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  return (await handle.requestPermission({ mode })) === 'granted'
}

/** Asks once for a backup file location, then remembers it. */
export async function chooseBackupFile() {
  if (!supportsFolderSync()) throw new Error('This browser cannot write directly to a folder. Use Export instead.')
  const handle = await window.showSaveFilePicker({
    suggestedName: BACKUP_FILENAME,
    types: [{ description: 'Recipe Keeper backup', accept: { 'application/json': ['.json'] } }]
  })
  await setSetting(HANDLE_KEY, handle)
  await setBackupStatus({ fileName: handle.name || BACKUP_FILENAME })
  return handle
}

export async function forgetBackupFile() {
  await setSetting(HANDLE_KEY, null)
  await setBackupStatus({ auto: false, fileName: '' })
}

/**
 * Writes the library to the chosen file.
 * @param {{silent?:boolean}} options silent skips the permission prompt and
 *        simply reports failure — used by the automatic save.
 */
export async function saveToBackupFile({ silent = false } = {}) {
  const handle = await getBackupHandle()
  if (!handle) throw new Error('No backup file chosen yet.')

  if (silent) {
    const state = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
    if (state !== 'granted') return { ok: false, reason: 'permission' }
  } else if (!(await ensurePermission(handle))) {
    return { ok: false, reason: 'permission' }
  }

  const bundle = await buildBundle()
  const writable = await handle.createWritable()
  await writable.write(bundleToJson(bundle))
  await writable.close()

  const status = await setBackupStatus({
    lastSavedAt: Date.now(),
    lastCounts: bundle.counts,
    fileName: handle.name || BACKUP_FILENAME
  })
  return { ok: true, counts: bundle.counts, status }
}

export async function restoreFromBackupFile(mode = 'merge') {
  const handle = await getBackupHandle()
  if (!handle) throw new Error('No backup file chosen yet.')
  if (!(await ensurePermission(handle, 'read'))) throw new Error('Permission to read the backup was refused.')
  const file = await handle.getFile()
  const bundle = await readBundleFile(file)
  return restoreBundle(bundle, mode)
}

export async function setAutoBackup(enabled) {
  await setBackupStatus({ auto: Boolean(enabled) })
}

/* ---------- automatic save ---------- */

let timer = null
let running = false

/** Debounced background save; safe to call after every edit. */
export function scheduleAutoBackup(delay = 4000) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (running) return
    running = true
    try {
      const status = await getBackupStatus()
      if (!status.auto) return
      if (!(await hasBackupFile())) return
      await saveToBackupFile({ silent: true })
    } catch {
      /* a failed background save must never interrupt cooking */
    } finally {
      running = false
    }
  }, delay)
}
