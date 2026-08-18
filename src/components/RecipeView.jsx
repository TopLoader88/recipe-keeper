import { useState, useEffect, useCallback, useRef } from 'react'
import { getRecipe, getSource, putRecipe, deleteRecipe, getAllGrocery, putGroceryBulk, putMealPlan, putDiary } from '../lib/db.js'
import { formatIngredient, normalizeTemperatures } from '../lib/normalize.js'
import { extractTemperature } from '../lib/parse.js'
import { perServingNutrition, scaleNutrition, cleanNutrition, formatCalories, formatGrams, MEAL_TYPES, mealLabel } from '../lib/nutrition.js'
import { syncLogEntry } from '../lib/nutritionSync.js'
import { formatMinutes, formatNumber } from '../lib/format.js'
import { shareRecipe } from '../lib/share.js'
import { scheduleAutoBackup } from '../lib/backup.js'
import { playableEmbedUrl } from '../lib/video.js'
import { lineFromIngredient, addLine } from '../lib/grocery.js'
import { SLOTS, startOfWeek, weekDays, toISODate, weekdayShort, dayOfMonth, slotLabel } from '../lib/mealplan.js'
import { useRouter } from '../hooks/useRouter.js'
import ConfirmSheet from './ConfirmSheet.jsx'
import {
  IconChevronLeft, IconClock, IconUsers, IconEdit, IconShare,
  IconTrash, IconHeart, IconHeartFilled, IconMinus, IconPlus, IconPlay, IconX,
  IconCart, IconCalendar, IconThermometer, IconFlame
} from './icons.jsx'

export default function RecipeView({ id }) {
  const { navigate, back } = useRouter()
  const [recipe, setRecipe] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const [editingServings, setEditingServings] = useState(false)
  const [editingTime, setEditingTime] = useState(false)
  const [editingTemp, setEditingTemp] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logServings, setLogServings] = useState(1)
  const [logDate, setLogDate] = useState(toISODate(new Date()))
  const [logCals, setLogCals] = useState('')
  const [logProtein, setLogProtein] = useState('')
  const [logCarbs, setLogCarbs] = useState('')
  const [logFat, setLogFat] = useState('')
  const [logSaveToRecipe, setLogSaveToRecipe] = useState(false)
  const [checked, setChecked] = useState({})
  const [doneSteps, setDoneSteps] = useState({})
  const [showSheet, setShowSheet] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState('recipe')
  const [toast, setToast] = useState('')

  // The full title lives in the page body where it can wrap; the bar only takes
  // it over once you've scrolled past it, so a long name is never just clipped.
  const titleRef = useRef(null)
  const [titleInBar, setTitleInBar] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getRecipe(id), getSource(id)]).then(([r, s]) => {
      if (cancelled) return
      setRecipe(r)
      setSource(s)
      setLoading(false)
      if (!r) return
      if (r.servings) setScale(1)
    })
    return () => { cancelled = true }
  }, [id])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }, [])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setTitleInBar(!e.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px' // the bar's own height
    })
    io.observe(el)
    return () => io.disconnect()
  }, [recipe])

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

  if (!recipe) {
    return (
      <div className="page">
        <header className="topbar">
          <button className="btn icon ghost" onClick={() => navigate('/')}><IconChevronLeft /></button>
          <h1>Not found</h1>
        </header>
        <div className="empty"><p>This recipe may have been deleted.</p></div>
      </div>
    )
  }

  const servings = recipe.servings
  const scaledServings = servings ? servings * scale : null
  const nutrition = perServingNutrition(recipe)

  async function toggleFavorite() {
    const updated = { ...recipe, favorite: !recipe.favorite }
    await putRecipe(updated)
    setRecipe(updated)
    scheduleAutoBackup()
  }

  async function handleDelete() {
    setConfirmDelete(false)
    await deleteRecipe(id)
    scheduleAutoBackup()
    navigate('/')
  }

  async function handleShare(as) {
    setShowSheet(false)
    const result = await shareRecipe(recipe, { as, scale, original: source })
    if (result === 'copied') showToast('Copied to clipboard')
    else if (result === 'downloaded') showToast('Downloaded')
  }

  async function commitServings(value) {
    setEditingServings(false)
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return
    if (recipe.servings) {
      setScale(n / recipe.servings)
    } else {
      const updated = { ...recipe, servings: n }
      await putRecipe(updated)
      setRecipe(updated)
      setScale(1)
      scheduleAutoBackup()
    }
  }

  async function commitTime(value) {
    setEditingTime(false)
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n <= 0) return
    const updated = { ...recipe, cookMinutes: n, totalMinutes: (recipe.prepMinutes || 0) + n }
    await putRecipe(updated)
    setRecipe(updated)
    scheduleAutoBackup()
  }

  async function commitTemp(value) {
    setEditingTemp(false)
    const raw = String(value || '').trim()
    if (!raw) return
    let canonical = extractTemperature(raw)
    if (!canonical) {
      const n = parseInt(raw, 10)
      if (!Number.isFinite(n) || n < 90 || n > 550) return
      canonical = `${n}°${n >= 250 ? 'F' : 'C'}`
    }
    const updated = { ...recipe, temperature: normalizeTemperatures(canonical) }
    await putRecipe(updated)
    setRecipe(updated)
    scheduleAutoBackup()
  }

  async function addToGrocery() {
    let list = await getAllGrocery()
    let added = 0
    let skipped = 0
    let i = -1
    for (const ing of recipe.ingredients || []) {
      i++
      const line = lineFromIngredient(ing, scale)
      if (!line) continue
      if (checked[i]) { skipped++; continue }
      list = addLine(list, line, { source: recipe.title })
      added++
    }
    await putGroceryBulk(list)
    if (added) {
      showToast(`Added ${added} item${added > 1 ? 's' : ''}${skipped ? ` · skipped ${skipped} you have` : ''}`)
    } else {
      showToast(skipped ? 'Everything was checked off already' : 'No ingredients to add')
    }
  }

  async function planTo(dateIso, slot) {
    setPlanOpen(false)
    const gid = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : 'm-' + Math.random().toString(36).slice(2)
    await putMealPlan({ id: gid, date: dateIso, slot, recipeId: id, title: recipe.title, image: recipe.image || null, createdAt: Date.now() })
    showToast(`Planned for ${slotLabel(slot)}`)
  }

  function openLog() {
    setLogServings(scaledServings ? Math.round(scaledServings * 100) / 100 : 1)
    setLogDate(toISODate(new Date()))
    const per = perServingNutrition(recipe)
    setLogCals(per && per.calories != null ? String(per.calories) : '')
    setLogProtein(per && per.protein != null ? String(per.protein) : '')
    setLogCarbs(per && per.carbs != null ? String(per.carbs) : '')
    setLogFat(per && per.fat != null ? String(per.fat) : '')
    setLogSaveToRecipe(!per)
    setLogOpen(true)
  }

  async function logToDiary(mealKey) {
    setLogOpen(false)
    const servings = Number(logServings) || 1
    const num = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) && n >= 0 ? n : null }
    const per = { calories: num(logCals), protein: num(logProtein), carbs: num(logCarbs), fat: num(logFat) }
    const totals = scaleNutrition(per, servings) || { calories: null, protein: null, carbs: null, fat: null }
    const gid = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : 'd-' + Math.random().toString(36).slice(2)
    const entry = {
      id: gid, date: logDate, mealType: mealKey, recipeId: id, title: recipe.title,
      servings,
      calories: totals.calories, protein: totals.protein, carbs: totals.carbs, fat: totals.fat,
      createdAt: Date.now()
    }
    await putDiary(entry)
    syncLogEntry(entry)
    const cleaned = cleanNutrition(per)
    if (logSaveToRecipe && cleaned) {
      const next = { ...recipe, nutrition: cleaned, updatedAt: Date.now() }
      await putRecipe(next)
      setRecipe(next)
    }
    showToast(totals.calories != null ? `Logged ${formatCalories(totals.calories)} cal to ${mealLabel(mealKey)}` : `Logged to ${mealLabel(mealKey)}`)
  }

  function toggleIngredient(idx) {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  function toggleStep(idx) {
    setDoneSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  const video = recipe.video

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn icon ghost" onClick={back}><IconChevronLeft /></button>
        <h1 className={titleInBar ? '' : 'hide'}>{recipe.title}</h1>
        <button className="btn icon ghost" onClick={toggleFavorite}>
          {recipe.favorite ? <IconHeartFilled /> : <IconHeart />}
        </button>
        <button className="btn icon ghost" onClick={() => setShowSheet(true)}><IconShare /></button>
      </header>

      {/* Video / Image */}
      {(video || recipe.image) && (
        <div className="media">
          {video && tab === 'video' ? (
            video.kind === 'iframe' ? (
              <div className="frame" style={{ aspectRatio: video.aspect }}>
                <iframe
                  src={playableEmbedUrl(video)}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            ) : video.kind === 'file' ? (
              <video src={video.url} controls playsInline />
            ) : (
              <div className="fallback">
                <a href={video.url} target="_blank" rel="noopener noreferrer">
                  Open {video.label} video
                </a>
              </div>
            )
          ) : recipe.image ? (
            <img className="hero" src={recipe.image} alt="" />
          ) : null}
        </div>
      )}

      {video && recipe.image && (
        <div className="media-switch">
          <button className={`chip ${tab === 'recipe' ? 'active' : ''}`} onClick={() => setTab('recipe')}>Photo</button>
          <button className={`chip ${tab === 'video' ? 'active' : ''}`} onClick={() => setTab('video')}><IconPlay /> Video</button>
        </div>
      )}
      {video && !recipe.image && tab !== 'video' && (
        <div className="media-switch">
          <button className="chip active" onClick={() => setTab('video')}><IconPlay /> Watch video</button>
        </div>
      )}

      {/* Meta */}
      <h2 className="recipe-title" ref={titleRef}>{recipe.title}</h2>
      <div className="meta-row">
        {scaledServings && (
          <span className="meta-item"><IconUsers /> {formatNumber(scaledServings)} servings</span>
        )}
        {recipe.prepMinutes && (
          <span className="meta-item"><IconClock /> Prep {formatMinutes(recipe.prepMinutes)}</span>
        )}
        {recipe.cookMinutes && (
          <span className="meta-item"><IconClock /> Cook {formatMinutes(recipe.cookMinutes)}</span>
        )}
        {!recipe.prepMinutes && !recipe.cookMinutes && recipe.totalMinutes && (
          <span className="meta-item"><IconClock /> {formatMinutes(recipe.totalMinutes)}</span>
        )}
        {!recipe.prepMinutes && !recipe.cookMinutes && !recipe.totalMinutes && (
          editingTime ? (
            <span className="meta-item">
              <IconClock />
              <input
                className="input time-input"
                type="number"
                min="1"
                step="1"
                autoFocus
                placeholder="min"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTime(e.currentTarget.value) }
                  else if (e.key === 'Escape') setEditingTime(false)
                }}
                onBlur={(e) => commitTime(e.currentTarget.value)}
              />
              min
            </span>
          ) : (
            <button className="meta-item add-meta" onClick={() => setEditingTime(true)}>
              <IconClock /> Add cook time
            </button>
          )
        )}
        {recipe.temperature ? (
          <span className="meta-item"><IconThermometer /> {recipe.temperature}</span>
        ) : (
          editingTemp ? (
            <span className="meta-item">
              <IconThermometer />
              <input
                className="input time-input"
                type="text"
                autoFocus
                placeholder="400°F"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTemp(e.currentTarget.value) }
                  else if (e.key === 'Escape') setEditingTemp(false)
                }}
                onBlur={(e) => commitTemp(e.currentTarget.value)}
              />
            </span>
          ) : (
            <button className="meta-item add-meta" onClick={() => setEditingTemp(true)}>
              <IconThermometer /> Add temp
            </button>
          )
        )}
      </div>

      {recipe.description && <p className="recipe-desc">{recipe.description}</p>}

      {/* Serving scaler - always available, even when the source gave no count */}
      <div className="card">
        <div className="scaler">
          <button
            className="btn icon small"
            onClick={() => setScale((s) => Math.max(0.25, Math.round((s - 0.5) * 100) / 100))}
            disabled={scale <= 0.25}
          >
            <IconMinus />
          </button>
          <div className="value">
            {editingServings ? (
              <input
                className="input serving-input"
                type="number"
                min="1"
                step="any"
                autoFocus
                defaultValue={servings ? String(Math.round(scaledServings * 100) / 100) : ''}
                placeholder="e.g. 4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitServings(e.currentTarget.value) }
                  else if (e.key === 'Escape') setEditingServings(false)
                }}
                onBlur={(e) => commitServings(e.currentTarget.value)}
              />
            ) : (
              <button className="value-btn" onClick={() => setEditingServings(true)}>
                {servings ? (
                  <>
                    <strong>{formatNumber(scaledServings)}</strong>
                    <span>servings &middot; tap to set</span>
                  </>
                ) : (
                  <>
                    <strong>{scale}&times;</strong>
                    <span>tap to set servings</span>
                  </>
                )}
              </button>
            )}
          </div>
          <button className="btn icon small" onClick={() => setScale((s) => Math.round((s + 0.5) * 100) / 100)}>
            <IconPlus />
          </button>
        </div>
        {scale !== 1 && (
          <button className="link-btn small scaler-reset" onClick={() => setScale(1)}>Reset to original</button>
        )}
      </div>

      {nutrition && (
        <div className="card nutrition-card">
          <div className="nutrition-head">
            <h2 className="section-title" style={{ margin: 0 }}>Nutrition</h2>
            <span className="muted small">per serving</span>
          </div>
          <div className="macros">
            <div className="macro"><strong>{formatCalories(nutrition.calories)}</strong><span>cal</span></div>
            <div className="macro"><strong>{formatGrams(nutrition.protein)}</strong><span>protein</span></div>
            <div className="macro"><strong>{formatGrams(nutrition.carbs)}</strong><span>carbs</span></div>
            <div className="macro"><strong>{formatGrams(nutrition.fat)}</strong><span>fat</span></div>
          </div>
          {scaledServings && nutrition.calories != null && (
            <p className="muted small nutrition-total">{formatNumber(scaledServings)} servings is about {formatCalories(scaleNutrition(nutrition, scaledServings).calories)} cal total</p>
          )}
        </div>
      )}

      {/* Ingredients */}
      {recipe.ingredients?.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">Ingredients</h2>
            <button className="link-btn small" onClick={addToGrocery}><IconCart /> Add to list</button>
          </div>
          <p className="list-hint">Tick off what you already have — those are skipped when adding to your list.</p>
          <ul className="checklist">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.section ? (
                  <div className="group">{ing.section}</div>
                ) : (
                  <label>
                    <input type="checkbox" checked={!!checked[i]} onChange={() => toggleIngredient(i)} />
                    <span>
                      {formatIngredient(ing, scale)}
                      {ing.optional && <span className="opt"> (optional)</span>}
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Steps */}
      {recipe.steps?.length > 0 && (
        <>
          <h2 className="section-title">Method</h2>
          <ol className="steps">
            {(() => {
              let n = 0
              return recipe.steps.map((step, i) => {
                if (step.section) {
                  return <li key={i} className="group-head">{step.section}</li>
                }
                n++
                return (
                  <li key={i} className={doneSteps[i] ? 'done' : ''} onClick={() => toggleStep(i)}>
                    <span className="num">{n}</span>
                    <span className="text">
                      {step.text}
                      {step.minutes && (
                        <span className="timer"><IconClock /> {formatMinutes(step.minutes)}</span>
                      )}
                    </span>
                  </li>
                )
              })
            })()}
          </ol>
        </>
      )}

      {/* Notes */}
      {recipe.notes && (
        <>
          <h2 className="section-title">Notes</h2>
          <div className="card"><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{recipe.notes}</p></div>
        </>
      )}

      {/* Tags */}
      {recipe.tags?.length > 0 && (
        <div className="chips" style={{ marginTop: 16 }}>
          {recipe.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
        </div>
      )}

      {/* Source */}
      {recipe.source?.url && (
        <div style={{ marginTop: 16 }}>
          <p className="small muted">
            Imported from{' '}
            <a href={recipe.source.url} target="_blank" rel="noopener noreferrer">
              {recipe.source.siteName || 'the web'}
            </a>
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={openLog}><IconFlame /> Log</button>
        <button className="btn" onClick={() => setPlanOpen(true)}><IconCalendar /> Plan</button>
        <button className="btn" onClick={() => navigate(`/recipe/${id}/edit`)}><IconEdit /> Edit</button>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}><IconTrash /> Delete</button>
      </div>

      {confirmDelete && (
        <ConfirmSheet
          title="Delete this recipe?"
          body="It will be removed from your library. This can't be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* Share sheet */}
      {showSheet && (
        <div className="sheet-backdrop" onClick={() => setShowSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <h2>Share recipe</h2>
            <button className="sheet-item" onClick={() => handleShare('text')}>
              <IconShare /> <div>As text<span className="sub">Readable in any app</span></div>
            </button>
            <button className="sheet-item" onClick={() => handleShare('file')}>
              <IconShare /> <div>As file<span className="sub">.recipe.json — lossless import</span></div>
            </button>
            {recipe.source?.url && (
              <button className="sheet-item" onClick={() => handleShare('link')}>
                <IconShare /> <div>Original link<span className="sub">{recipe.source.url}</span></div>
              </button>
            )}
            <button className="sheet-item" onClick={() => setShowSheet(false)}>
              <IconX /> <div>Cancel</div>
            </button>
          </div>
        </div>
      )}

      {planOpen && (
        <div className="sheet-backdrop" onClick={() => setPlanOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <h2>Add to meal plan</h2>
            <div className="plan-picker">
              {weekDays(startOfWeek(new Date())).map((d) => {
                const iso = toISODate(d)
                return (
                  <div key={iso} className="plan-picker-row">
                    <span className="plan-picker-day">{weekdayShort(d)} {dayOfMonth(d)}</span>
                    <div className="plan-picker-slots">
                      {SLOTS.map((sl) => (
                        <button key={sl.key} className="chip" onClick={() => planTo(iso, sl.key)}>{sl.emoji} {sl.label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <button className="sheet-item" onClick={() => setPlanOpen(false)}><IconX /> <div>Cancel</div></button>
          </div>
        </div>
      )}

      {logOpen && (
        <div className="sheet-backdrop" onClick={() => setLogOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <h2>Log to food diary</h2>
            <div className="log-form">
              <div className="log-row">
                <span className="log-label">Servings eaten</span>
                <div className="log-stepper">
                  <button className="btn icon small" onClick={() => setLogServings((v) => Math.max(0.25, Math.round((Number(v) - 0.5) * 100) / 100))}><IconMinus /></button>
                  <input className="input serving-input" type="number" min="0" step="any" value={logServings} onChange={(e) => setLogServings(e.target.value)} />
                  <button className="btn icon small" onClick={() => setLogServings((v) => Math.round((Number(v) + 0.5) * 100) / 100)}><IconPlus /></button>
                </div>
              </div>
              <div className="log-row">
                <span className="log-label">Date</span>
                <input className="input log-date" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              </div>
              <div className="log-row">
                <span className="log-label">Calories <span className="log-sub">/ serving</span></span>
                <input className="input log-num" type="number" min="0" step="any" inputMode="decimal" placeholder="e.g. 250" value={logCals} onChange={(e) => setLogCals(e.target.value)} />
              </div>
              <div className="log-macros">
                <label className="log-macro"><span>Protein</span><input className="input" type="number" min="0" step="any" placeholder="g" value={logProtein} onChange={(e) => setLogProtein(e.target.value)} /></label>
                <label className="log-macro"><span>Carbs</span><input className="input" type="number" min="0" step="any" placeholder="g" value={logCarbs} onChange={(e) => setLogCarbs(e.target.value)} /></label>
                <label className="log-macro"><span>Fat</span><input className="input" type="number" min="0" step="any" placeholder="g" value={logFat} onChange={(e) => setLogFat(e.target.value)} /></label>
              </div>
              {logCals !== '' && (Number(logServings) || 0) > 0 ? (
                <p className="muted small">Logs {formatCalories((Number(logCals) || 0) * (Number(logServings) || 0))} cal total for {formatNumber(Number(logServings) || 0)} {(Number(logServings) || 0) === 1 ? 'serving' : 'servings'}.</p>
              ) : (
                <p className="muted small">Add calories per serving so this meal counts toward your daily total.</p>
              )}
              <label className="log-save">
                <input type="checkbox" checked={logSaveToRecipe} onChange={(e) => setLogSaveToRecipe(e.target.checked)} />
                <span>Save nutrition to this recipe</span>
              </label>
              <span className="log-label">Add to</span>
              <div className="plan-picker-slots">
                {MEAL_TYPES.map((m) => (
                  <button key={m.key} className="chip" onClick={() => logToDiary(m.key)}>{m.emoji} {m.label}</button>
                ))}
              </div>
            </div>
            <button className="sheet-item" onClick={() => setLogOpen(false)}><IconX /> <div>Cancel</div></button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
