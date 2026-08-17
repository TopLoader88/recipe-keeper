import { useState, useEffect } from 'react'
import {
  exportToDownload, readBundleFile, restoreBundle,
  supportsFolderSync, chooseBackupFile, saveToBackupFile,
  forgetBackupFile, getBackupStatus, hasBackupFile, setAutoBackup
} from '../lib/backup.js'
import { estimateStorage, formatBytes, requestPersistentStorage, isStoragePersisted, isFileBuild, clearAllData } from '../lib/db.js'
import { useRecipes } from '../hooks/useRecipes.js'
import { useRouter } from '../hooks/useRouter.js'
import { IconDownload, IconUpload, IconFolder, IconTrash } from './icons.jsx'
import ConfirmSheet from './ConfirmSheet.jsx'

export default function Settings() {
  const { recipes } = useRecipes()
  const { navigate } = useRouter()
  const [storage, setStorage] = useState(null)
  const [backup, setBackup] = useState(null)
  const [hasFile, setHasFile] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [persisted, setPersisted] = useState(false)

  useEffect(() => {
    estimateStorage().then(setStorage)
    getBackupStatus().then(setBackup)
    hasBackupFile().then(setHasFile)
    isStoragePersisted().then(setPersisted)
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }

  async function handleExport() {
    setBusy('export')
    try {
      const counts = await exportToDownload()
      showToast(`Exported ${counts.recipes} recipes`)
    } catch (err) {
      showToast(err?.message || 'Export failed')
    }
    setBusy('')
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('restore')
    try {
      const bundle = await readBundleFile(file)
      const result = await restoreBundle(bundle, 'merge')
      showToast(`Added ${result.added}, updated ${result.updated}, skipped ${result.skipped}`)
    } catch (err) {
      showToast(err?.message || 'Restore failed')
    }
    setBusy('')
    e.target.value = ''
  }

  async function handleChooseFile() {
    try {
      await chooseBackupFile()
      setHasFile(true)
      await saveToBackupFile()
      const status = await getBackupStatus()
      setBackup(status)
      showToast('Backup file set')
    } catch (err) {
      if (err?.name !== 'AbortError') showToast(err?.message || 'Failed')
    }
  }

  async function handleSaveNow() {
    setBusy('sync')
    try {
      const result = await saveToBackupFile()
      if (result.ok) {
        setBackup(result.status)
        showToast('Saved')
      } else {
        showToast('Permission needed — tap to grant access')
      }
    } catch (err) {
      showToast(err?.message || 'Save failed')
    }
    setBusy('')
  }

  async function handleForgetFile() {
    await forgetBackupFile()
    setHasFile(false)
    setBackup(await getBackupStatus())
    showToast('Backup file removed')
  }

  async function handleAutoToggle(e) {
    await setAutoBackup(e.target.checked)
    setBackup(await getBackupStatus())
  }

  async function handlePersist() {
    const ok = await requestPersistentStorage()
    setPersisted(ok)
    showToast(ok ? 'Storage is now persistent' : 'Browser declined — install the app to qualify')
  }

  async function handleClear() {
    setConfirmClear(false)
    await clearAllData()
    showToast('All data cleared')
    navigate('/')
  }

  return (
    <div className="page">
      <header className="topbar"><h1>Settings</h1></header>

      {/* Storage */}
      <p className="section-title">Storage</p>
      <div className="card">
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} saved locally
          {storage && <> &middot; {formatBytes(storage.usage)} used</>}
        </p>

        {/* Say what is actually true rather than offering a button that can't work.
            Opened as a plain file, the browser gives no eviction protection and the
            library is tied to this file's exact path — so point at Backup instead. */}
        {persisted ? (
          <p className="hint" style={{ color: 'var(--green)', marginTop: 6 }}>
            Protected — the browser won't evict this library to reclaim space.
          </p>
        ) : isFileBuild ? (
          <p className="hint" style={{ marginTop: 6 }}>
            Opened as a file, so the browser won't grant eviction protection, and the
            library is tied to this file's exact location — moving or copying it starts
            an empty one. Keep a backup below. Installing the app instead gets both.
          </p>
        ) : (
          <button className="link-btn small" onClick={handlePersist} style={{ marginTop: 8 }}>
            Request persistent storage
          </button>
        )}
      </div>

      {/* Backup */}
      <p className="section-title">Backup</p>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={handleExport} disabled={!!busy}>
          <IconDownload /> Export
        </button>
        <label className="btn" style={{ cursor: 'pointer' }}>
          <IconUpload /> Restore
          <input type="file" accept=".json" onChange={handleRestore} hidden disabled={!!busy} />
        </label>
      </div>

      {supportsFolderSync() && (
        <div className="card">
          {hasFile ? (
            <>
              <div className="switch">
                <div>
                  <div className="label">Auto-save</div>
                  <div className="desc">Save after every edit to your backup file</div>
                </div>
                <input type="checkbox" checked={backup?.auto || false} onChange={handleAutoToggle} />
              </div>
              {backup?.lastSavedAt && (
                <p className="small muted" style={{ marginTop: 4 }}>
                  Last saved {new Date(backup.lastSavedAt).toLocaleString()}
                </p>
              )}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn small" onClick={handleSaveNow} disabled={!!busy}>Save now</button>
                <button className="btn small danger" onClick={handleForgetFile}>Remove file</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                Pick a file in a synced folder (OneDrive, Google Drive) and your library backs up automatically.
              </p>
              <button className="btn small" onClick={handleChooseFile}>
                <IconFolder /> Choose backup file
              </button>
            </>
          )}
        </div>
      )}

      {/* Danger zone */}
      <p className="section-title">Danger zone</p>
      <button className="btn danger" onClick={() => setConfirmClear(true)} disabled={!recipes.length}>
        <IconTrash /> Delete all recipes
      </button>

      {confirmClear && (
        <ConfirmSheet
          title={`Delete all ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}?`}
          body="Everything in your library is removed. This can't be undone — export a backup first if you're unsure."
          confirmLabel="Delete everything"
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
