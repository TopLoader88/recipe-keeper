import { useState, useEffect, useRef } from 'react'
import { importFromUrl, importFromText } from '../lib/importer.js'
import { putRecipe, putSource } from '../lib/db.js'
import { scheduleAutoBackup } from '../lib/backup.js'
import { useRouter } from '../hooks/useRouter.js'
import { IconLink, IconClipboard, IconPlus } from './icons.jsx'

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

  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')
    const shared = params.get('url') || params.get('text') || ''
    if (shared) {
      if (/^https?:\/\//i.test(shared)) setUrl(shared)
      else { setText(shared); setMode('text') }
    }
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
        setStatus('')
        setBusy(false)
        setMode('text')
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
          built.recipe = { ...needsPaste.recipe, ...built.recipe, id: needsPaste.recipe.id, createdAt: needsPaste.recipe.createdAt }
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

  function handleNew() {
    navigate('/new')
  }

  return (
    <div className="page">
      <header className="topbar"><h1>Import</h1></header>

      <div className="tabs">
        <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>From link</button>
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
