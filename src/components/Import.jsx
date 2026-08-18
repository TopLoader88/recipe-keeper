import { useState, useEffect, useRef } from 'react'
import { importFromUrl, importFromText } from '../lib/importer.js'
import { putRecipe, putSource } from '../lib/db.js'
import { scheduleAutoBackup } from '../lib/backup.js'
import { recognizeImages, recognizeVideoFrames } from '../lib/ocr.js'
import { useRouter } from '../hooks/useRouter.js'
import { IconLink, IconClipboard, IconPlus, IconCamera } from './icons.jsx'

function goodTitle(t) {
  const s = String(t || '').trim()
  if (!s || s === 'Untitled recipe') return false
  if (/^recipe from /i.test(s)) return false
  if (/^(video|facebook|instagram|tiktok) recipe$/i.test(s)) return false
  return true
}

export default function Import() {
  const { navigate } = useRouter()
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [mode, setMode] = useState('url')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [needsPaste, setNeedsPaste] = useState(null)
  const abortRef = useRef(null)
  const photoInputRef = useRef(null)
  const [photos, setPhotos] = useState([])
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrPct, setOcrPct] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')
    const sharedUrl = params.get('url')
    const sharedText = params.get('text')
    if (sharedUrl) { setUrl(sharedUrl); setMode('url') }
    else if (sharedText) { setText(sharedText); setMode('text') }
    else if (params.get('shared') === 'photo') { loadSharedPhotos() }
  }, [])

  async function handleImportUrl(e) {
    e.preventDefault()
    if (!url.trim() || busy) return
    setError('')
    setWarnings([])
    setBusy(true)
    setStatus('Starting…')
    setNeedsPaste(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await importFromUrl(url.trim(), {
        signal: controller.signal,
        onProgress: setStatus
      })

      if (result.warnings?.length) setWarnings(result.warnings)

      if (result.needsPaste) {
        setNeedsPaste(result)
        if (result.caption) setText(result.caption)
        setStatus('')
        setBusy(false)
        setMode('text')
        // When the real video file was extracted (Facebook), read the recipe
        // straight off its on-screen text - that's what the user is here for.
        // Best-effort and non-blocking; they can still paste or take a screenshot.
        if (result.video && result.video.fileUrl) scanVideoForText(result.video)
        return
      }

      await putRecipe(result.recipe)
      await putSource(result.original)
      scheduleAutoBackup()
      navigate(`/recipe/${result.recipe.id}`)
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError(err?.message || 'Import failed')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  async function handleImportText(e) {
    e.preventDefault()
    if (!text.trim()) return
    setError('')

    const sourceUrl = needsPaste?.recipe?.source?.url || url.trim() || ''
    const video = needsPaste?.video || null

    const result = needsPaste
      ? (() => {
          const built = importFromText(text.trim(), { sourceUrl, video })
          built.recipe = {
            ...needsPaste.recipe,
            ...built.recipe,
            id: needsPaste.recipe.id,
            createdAt: needsPaste.recipe.createdAt,
            image: built.recipe.image || needsPaste.recipe.image || null,
            // For a video import the caption/og title is the real dish name, so
            // keep it rather than letting a garbled scanned line become the title.
            title: goodTitle(needsPaste.recipe.title)
              ? needsPaste.recipe.title
              : (built.recipe.title && built.recipe.title !== 'Untitled recipe' ? built.recipe.title : needsPaste.recipe.title || built.recipe.title)
          }
          built.original = { ...needsPaste.original, ...built.original, recipeId: needsPaste.recipe.id }
          return built
        })()
      : importFromText(text.trim(), { sourceUrl })

    if (!result.recipe.ingredients?.length && !result.recipe.steps?.length) {
      setError('Could not find ingredients or steps in that text. Try formatting them with clear headings.')
      return
    }

    await putRecipe(result.recipe)
    await putSource(result.original)
    scheduleAutoBackup()
    navigate(`/recipe/${result.recipe.id}`)
  }

  async function loadSharedPhotos() {
    setMode('photo')
    try {
      const cache = await caches.open('shared-media')
      const keys = await cache.keys()
      const imgKeys = keys.filter((k) => k.url.includes('__shared_img_'))
      const picked = []
      for (const k of imgKeys) {
        const res = await cache.match(k)
        if (!res) continue
        const blob = await res.blob()
        picked.push({ file: new File([blob], 'shared.jpg', { type: blob.type || 'image/jpeg' }), url: URL.createObjectURL(blob) })
        await cache.delete(k)
      }
      if (picked.length) {
        setPhotos(picked)
        scanPhotos(picked.map((p) => p.file))
      }
    } catch {}
  }

  function onPickPhotos(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setError('')
    setPhotos((prev) => [...prev, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
    e.target.value = ''
  }

  function removePhoto(i) {
    setPhotos((prev) => {
      const next = prev.slice()
      const [gone] = next.splice(i, 1)
      if (gone) URL.revokeObjectURL(gone.url)
      return next
    })
  }

  async function scanPhotos(fileList) {
    const files = fileList || photos.map((p) => p.file)
    if (!files.length || ocrBusy) return
    setError('')
    setWarnings([])
    setOcrBusy(true)
    setOcrPct(0)
    setOcrStatus('Getting ready\u2026')
    try {
      const out = await recognizeImages(files, (frac, label) => {
        setOcrPct(Math.round(frac * 100))
        if (label) setOcrStatus(label)
      })
      if (!out.trim()) {
        setError('No readable text was found in those images. Try a clearer, tighter screenshot of the recipe text.')
        return
      }
      setText((prev) => (prev.trim() ? prev.trim() + '\n\n' + out : out))
      setMode('text')
    } catch (err) {
      setError((err && err.message) || 'Text recognition failed.')
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  async function scanVideoForText(videoObj) {
    const vid = (videoObj && (videoObj.fileUrl || videoObj.embedUrl || videoObj.url)) ? videoObj : (needsPaste && needsPaste.video) || null
    const videoUrl = (vid && (vid.fileUrl || vid.embedUrl || vid.url)) || ''
    if (!videoUrl || ocrBusy) return
    setError('')
    setOcrBusy(true)
    setOcrPct(0)
    setOcrStatus('Loading the video\u2026')
    try {
      const out = await recognizeVideoFrames(videoUrl, (frac, label) => {
        setOcrPct(Math.round(frac * 100))
        if (label) setOcrStatus(label)
      })
      if (!out.trim()) {
        setError('No on-screen text was found in the video. Try a screenshot of the recipe text instead.')
        return
      }
      setText((prev) => (prev.trim() ? prev.trim() + '\n\n' + out : out))
    } catch (err) {
      setError((err && err.message) || 'The video could not be scanned. Take a screenshot of the recipe text and use "From photo".')
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  function handleNew() {
    navigate('/new')
  }

  return (
    <div className="page">
      <header className="topbar"><h1>Import</h1></header>

      <div className="tabs">
        <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>From link</button>
        <button className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')}>From photo</button>
        <button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>Paste text</button>
      </div>

      {mode === 'url' && (
        <form onSubmit={handleImportUrl}>
          <div className="field">
            <label>Recipe URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
            <div className="hint">Works with recipe blogs, YouTube, TikTok, Instagram, and more</div>
          </div>

          {status && (
            <div className="progress"><span className="spinner" /> {status}</div>
          )}

          {error && <div className="note error">{error}</div>}

          {warnings.map((w, i) => (
            <div key={i} className="note warn">{w}</div>
          ))}

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary block" type="submit" disabled={busy || !url.trim()}>
              <IconLink /> Import
            </button>
          </div>
        </form>
      )}

      {mode === 'photo' && (
        <div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onPickPhotos}
          />
          {photos.length === 0 ? (
            <div className="field">
              <label>Scan a recipe from a photo</label>
              <button type="button" className="btn primary block" onClick={() => photoInputRef.current && photoInputRef.current.click()} disabled={ocrBusy}>
                <IconCamera /> Choose photos or screenshots
              </button>
              <div className="hint">
                Point it at a screenshot of the recipe text from a video, or a photo of a cookbook page. You can add more than one image (ingredients + steps) and they'll be read together.
              </div>
            </div>
          ) : (
            <div className="field">
              <label>{photos.length} image{photos.length === 1 ? '' : 's'} ready</label>
              <div className="photo-grid">
                {photos.map((p, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={p.url} alt="" />
                    <button type="button" className="photo-x" onClick={() => removePhoto(i)} disabled={ocrBusy} aria-label="Remove">\u00d7</button>
                  </div>
                ))}
                <button type="button" className="photo-add" onClick={() => photoInputRef.current && photoInputRef.current.click()} disabled={ocrBusy}>
                  <IconPlus /> Add
                </button>
              </div>
            </div>
          )}

          {ocrBusy && (
            <div className="progress"><span className="spinner" /> {ocrStatus || 'Reading\u2026'} {ocrPct ? `${ocrPct}%` : ''}</div>
          )}

          {error && <div className="note error">{error}</div>}

          {photos.length > 0 && (
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="btn primary block" onClick={() => scanPhotos()} disabled={ocrBusy}>
                <IconCamera /> {ocrBusy ? 'Scanning\u2026' : 'Scan for recipe'}
              </button>
            </div>
          )}

          <div className="hint" style={{ marginTop: 10 }}>
            The first scan downloads the text-recognition engine (a few MB); after that it works offline.
          </div>
        </div>
      )}

      {mode === 'text' && (
        <form onSubmit={handleImportText}>
          <div className="field">
            <label>{needsPaste ? 'Paste the recipe text from the video' : 'Recipe text'}</label>
            <textarea
              className="textarea"
              rows={10}
              placeholder={'Ingredients:\n1 cup flour\n2 eggs\n...\n\nInstructions:\n1. Mix together…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="hint">
              Paste from a caption, transcript, or screenshot text. Headings like "Ingredients:" and "Instructions:" help.
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 4, marginBottom: 4 }}>
            <button type="button" className="btn ghost" onClick={() => setMode('photo')} disabled={ocrBusy}>
              <IconCamera /> Scan a photo instead
            </button>
            {needsPaste && needsPaste.video && (
              <button
                type="button"
                className={needsPaste.video.fileUrl ? 'btn primary' : 'btn ghost'}
                onClick={() => scanVideoForText()}
                disabled={ocrBusy}
              >
                <IconClipboard /> {needsPaste.video.fileUrl ? 'Read recipe from video' : 'Scan the video for text'}
              </button>
            )}
          </div>

          {needsPaste && needsPaste.video && needsPaste.video.fileUrl && (
            <div className="hint" style={{ marginTop: 6 }}>
              The recipe is read straight off the video's on-screen text, so it's a rough draft - play the video and fix anything that came out garbled before importing.
            </div>
          )}

          {ocrBusy && (
            <div className="progress"><span className="spinner" /> {ocrStatus || 'Reading\u2026'} {ocrPct ? `${ocrPct}%` : ''}</div>
          )}

          {error && <div className="note error">{error}</div>}

          {warnings.map((w, i) => (
            <div key={i} className="note warn">{w}</div>
          ))}

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary block" type="submit" disabled={!text.trim()}>
              <IconClipboard /> Import text
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button className="link-btn" onClick={handleNew}>
          <IconPlus style={{ width: 14, height: 14, verticalAlign: -2 }} /> Or write one from scratch
        </button>
      </div>
    </div>
  )
}
