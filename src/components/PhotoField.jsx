import { useRef, useState, useEffect, useCallback } from 'react'
import { toStoredImage, imageFromTransfer, dataUrlBytes, fetchAsStoredImage } from '../lib/image.js'
import { detectShareLink, imageUrlFor } from '../lib/share-links.js'
import { formatBytes } from '../lib/db.js'
import { IconPlus, IconX, IconClipboard, IconLink, IconCheck } from './icons.jsx'

/* Attach a photo by picking a file, pasting a screenshot, dropping one in, or
   pointing at a cloud share link.

   Screenshotting a video or a post is how most of these recipes get saved, so
   paste is the path that matters most — Ctrl+V anywhere on this screen. */
export default function PhotoField({ value, onChange }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [linkMode, setLinkMode] = useState(false)
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const [broken, setBroken] = useState(false)

  const isStored = value?.startsWith('data:')

  const accept = useCallback(async (blob) => {
    if (!blob) return
    setBusy(true)
    setError('')
    setNote('')
    setBroken(false)
    const dataUrl = await toStoredImage(blob)
    setBusy(false)
    if (dataUrl) onChange(dataUrl)
    else setError("That file didn't look like an image the browser can read.")
  }, [onChange])

  useEffect(() => {
    const onPaste = (e) => {
      const img = imageFromTransfer(e.clipboardData)
      if (!img) return // let normal text pastes through untouched
      e.preventDefault()
      accept(img)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [accept])

  async function useLink() {
    const raw = link.trim()
    if (!raw) return
    setError('')
    setNote('')
    setBroken(false)

    const share = detectShareLink(raw)
    if (share?.private) { setError(share.note); return }

    const direct = imageUrlFor(raw)
    if (!direct) {
      setError(
        share
          ? "That share link didn't resolve to a picture."
          : "That doesn't look like a link to a picture. Drive, OneDrive, Dropbox and direct image links all work."
      )
      return
    }

    // Keep a copy if the host allows it. Opened as a file the app has a null
    // origin and this always fails, which is fine — the <img> below still loads.
    setBusy(true)
    const inlined = await fetchAsStoredImage(direct)
    setBusy(false)
    onChange(inlined || direct)
    setNote(inlined ? '' : share?.note || 'Shown straight from the link, so it needs a connection.')
    setLinkMode(false)
    setLink('')
  }

  return (
    <div className="field">
      <label>Photo</label>

      {value ? (
        <div className="photo-preview">
          <img src={value} alt="" onError={() => setBroken(true)} onLoad={() => setBroken(false)} />
          <button type="button" className="remove" onClick={() => { onChange(''); setNote(''); setBroken(false) }} aria-label="Remove photo">
            <IconX />
          </button>
          <span className="size">{isStored ? formatBytes(dataUrlBytes(value)) : 'from a link'}</span>
        </div>
      ) : (
        <div
          className={`photo-drop ${dragging ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            accept(imageFromTransfer(e.dataTransfer))
          }}
        >
          {busy ? (
            <span className="muted small"><span className="spinner" /> Processing…</span>
          ) : linkMode ? (
            <div className="link-row">
              <input
                className="input"
                type="url"
                inputMode="url"
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); useLink() } }}
                placeholder="Paste a Drive, OneDrive or Dropbox link"
              />
              <button type="button" className="btn small" onClick={useLink}><IconCheck /></button>
              <button type="button" className="btn small ghost" onClick={() => { setLinkMode(false); setError('') }}><IconX /></button>
            </div>
          ) : (
            <>
              <div className="btn-row">
                <button type="button" className="btn small" onClick={() => inputRef.current?.click()}>
                  <IconPlus /> Choose photo
                </button>
                <button type="button" className="btn small ghost" onClick={() => { setLinkMode(true); setError('') }}>
                  <IconLink /> Use a link
                </button>
              </div>
              <span className="muted small"><IconClipboard /> or paste a screenshot</span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = '' // let the same file be picked again after removing
        }}
      />

      {error && <div className="hint" style={{ color: 'var(--red)' }}>{error}</div>}
      {!error && broken && (
        <div className="hint" style={{ color: 'var(--red)' }}>
          That link didn't load. The file is probably not shared as "Anyone with the link".
        </div>
      )}
      {!error && !broken && note && <div className="hint">{note}</div>}
      {!error && !broken && !note && isStored && <div className="hint">Stored in the recipe — works offline.</div>}
    </div>
  )
}
