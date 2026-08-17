import { useState, useEffect, useMemo } from 'react'
import { getRecipe, putRecipe } from '../lib/db.js'
import { blankRecipe } from '../lib/importer.js'
import { ingredientsToText, stepsToText, textToIngredients, textToSteps, normalizeTemperatures } from '../lib/normalize.js'
import { extractTemperature } from '../lib/parse.js'
import { cleanNutrition } from '../lib/nutrition.js'
import { scheduleAutoBackup } from '../lib/backup.js'
import { detectVideo } from '../lib/video.js'
import { useRouter } from '../hooks/useRouter.js'
import PhotoField from './PhotoField.jsx'
import { IconChevronLeft, IconCheck, IconPlay } from './icons.jsx'

export default function Editor({ id }) {
  const { navigate, back } = useRouter()
  const isNew = !id
  const [loading, setLoading] = useState(!isNew)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [servings, setServings] = useState('')
  const [prepMinutes, setPrepMinutes] = useState('')
  const [cookMinutes, setCookMinutes] = useState('')
  const [temperature, setTemperature] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [ingredientsText, setIngredientsText] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [image, setImage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [original, setOriginal] = useState(null)

  // Detect as you type so a link that won't embed says so before you save it.
  const video = useMemo(() => detectVideo(videoUrl.trim()), [videoUrl])

  useEffect(() => {
    if (isNew) {
      const r = blankRecipe()
      setOriginal(r)
      return
    }
    getRecipe(id).then((r) => {
      if (!r) { navigate('/'); return }
      setOriginal(r)
      setTitle(r.title || '')
      setDescription(r.description || '')
      setServings(r.servings != null ? String(r.servings) : '')
      setPrepMinutes(r.prepMinutes != null ? String(r.prepMinutes) : '')
      setCookMinutes(r.cookMinutes != null ? String(r.cookMinutes) : '')
      setTemperature(r.temperature || '')
      setCalories(r.nutrition?.calories != null ? String(r.nutrition.calories) : '')
      setProtein(r.nutrition?.protein != null ? String(r.nutrition.protein) : '')
      setCarbs(r.nutrition?.carbs != null ? String(r.nutrition.carbs) : '')
      setFat(r.nutrition?.fat != null ? String(r.nutrition.fat) : '')
      setIngredientsText(ingredientsToText(r.ingredients))
      setStepsText(stepsToText(r.steps))
      setTags((r.tags || []).join(', '))
      setNotes(r.notes || '')
      setImage(r.image || '')
      setVideoUrl(r.video?.url || '')
      setLoading(false)
    })
  }, [id])

  async function handleSave(e) {
    e.preventDefault()
    const ingredients = textToIngredients(ingredientsText)
    const steps = textToSteps(stepsText)
    const parsedTags = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    const servingsNum = servings ? Number(servings) : null
    const prepNum = prepMinutes ? Number(prepMinutes) : null
    const cookNum = cookMinutes ? Number(cookMinutes) : null
    let tempStr = temperature.trim()
    if (tempStr) tempStr = normalizeTemperatures(extractTemperature(tempStr) || tempStr)

    const recipe = {
      ...(original || {}),
      title: title.trim() || 'Untitled recipe',
      userEdited: true,
      description: description.trim(),
      servings: servingsNum && Number.isFinite(servingsNum) ? servingsNum : null,
      prepMinutes: prepNum && Number.isFinite(prepNum) ? prepNum : null,
      cookMinutes: cookNum && Number.isFinite(cookNum) ? cookNum : null,
      totalMinutes: (prepNum || 0) + (cookNum || 0) || null,
      temperature: tempStr || null,
      nutrition: cleanNutrition({ calories, protein, carbs, fat }),
      ingredients,
      steps,
      tags: parsedTags.slice(0, 12),
      notes: notes.trim(),
      image: image || null,
      video
    }

    const saved = await putRecipe(recipe)
    scheduleAutoBackup()
    navigate(`/recipe/${saved.id}`)
  }

  if (loading) {
    return (
      <div className="page">
        <header className="topbar">
          <button className="btn icon ghost" onClick={back}><IconChevronLeft /></button>
          <h1>Loading…</h1>
        </header>
        <div className="center muted"><span className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn icon ghost" onClick={back}><IconChevronLeft /></button>
        <h1>{isNew ? 'New recipe' : 'Edit recipe'}</h1>
      </header>

      <form onSubmit={handleSave}>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recipe name" />
        </div>

        <div className="field">
          <label>Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short tagline (optional)" />
        </div>

        <PhotoField value={image} onChange={setImage} />

        <div className="field">
          <label>Video link</label>
          <input
            className="input"
            type="url"
            inputMode="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste a TikTok, Reel, Short, YouTube or Drive link"
          />
          {video && video.kind !== 'unresolved' && (
            <div className="hint ok"><IconPlay /> {video.label} — plays inside the recipe.</div>
          )}
          {video && video.kind === 'unresolved' && (
            <div className="hint">
              That is a short share link, so it can't be embedded. Open it once and paste the
              full link to play it here — it's still saved either way.
            </div>
          )}
          {!video && videoUrl.trim() && (
            <div className="hint">Saved as a plain link — that host has no player the app can embed.</div>
          )}
          {!videoUrl.trim() && (
            <div className="hint">Keeps the clip with the recipe, so you can rewatch the technique.</div>
          )}
        </div>

        <div className="row">
          <div className="field">
            <label>Servings</label>
            <input className="input" type="number" min="0" step="any" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
          </div>
          <div className="field">
            <label>Prep (min)</label>
            <input className="input" type="number" min="0" value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} placeholder="15" />
          </div>
          <div className="field">
            <label>Cook (min)</label>
            <input className="input" type="number" min="0" value={cookMinutes} onChange={(e) => setCookMinutes(e.target.value)} placeholder="30" />
          </div>
          <div className="field">
            <label>Oven temp</label>
            <input className="input" type="text" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="400°F" />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Calories</label>
            <input className="input" type="number" min="0" step="any" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="450" />
          </div>
          <div className="field">
            <label>Protein (g)</label>
            <input className="input" type="number" min="0" step="any" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="30" />
          </div>
          <div className="field">
            <label>Carbs (g)</label>
            <input className="input" type="number" min="0" step="any" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="40" />
          </div>
          <div className="field">
            <label>Fat (g)</label>
            <input className="input" type="number" min="0" step="any" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="15" />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -6 }}>Per serving — powers calorie tracking in the food log (optional).</div>

        <div className="field">
          <label>Ingredients</label>
          <textarea
            className="textarea mono"
            rows={8}
            value={ingredientsText}
            onChange={(e) => setIngredientsText(e.target.value)}
            placeholder={'1 cup flour\n2 large eggs\n1/2 tsp salt\n\n# For the sauce:\n1 can tomatoes'}
          />
          <div className="hint">One per line. Start a line with # for a section heading.</div>
        </div>

        <div className="field">
          <label>Method</label>
          <textarea
            className="textarea mono"
            rows={8}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'Preheat oven to 180°C.\nMix dry ingredients together.\nAdd wet ingredients and stir.'}
          />
          <div className="hint">One step per line. Start a line with # for a section heading.</div>
        </div>

        <div className="field">
          <label>Tags</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dinner, pasta, quick" />
          <div className="hint">Comma-separated, up to 12</div>
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            className="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Storage tips, variations, etc."
          />
        </div>

        <button className="btn primary block" type="submit" style={{ marginTop: 8 }}>
          <IconCheck /> {isNew ? 'Create recipe' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
