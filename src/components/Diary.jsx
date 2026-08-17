import { useState, useCallback, useEffect } from 'react'
import { useDiary } from '../hooks/useDiary.js'
import { useRouter } from '../hooks/useRouter.js'
import {
  startOfWeek, weekDays, addDays, fromISODate, toISODate, weekdayShort, dayOfMonth,
  dayHeading, isToday
} from '../lib/mealplan.js'
import { putDiary, deleteDiary, getSetting, setSetting } from '../lib/db.js'
import { MEAL_TYPES, mealLabel, sumNutrition, formatCalories, formatGrams, cleanNutrition } from '../lib/nutrition.js'
import { syncLogEntry } from '../lib/nutritionSync.js'
import { formatNumber } from '../lib/format.js'
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconFlame } from './icons.jsx'

function newId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  return 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function Diary() {
  const { entries, loading } = useDiary()
  const { navigate } = useRouter()
  const [selected, setSelected] = useState(() => toISODate(new Date()))
  const [goal, setGoal] = useState(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [q, setQ] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' })
  const [toast, setToast] = useState('')

  useEffect(() => { getSetting('calorieGoal', null).then(setGoal) }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }, [])

  const selDate = fromISODate(selected)
  const week = weekDays(startOfWeek(selDate))
  const dayEntries = entries.filter((e) => e.date === selected)
  const totals = sumNutrition(dayEntries)

  async function commitGoal(value) {
    setEditingGoal(false)
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n <= 0) {
      await setSetting('calorieGoal', null)
      setGoal(null)
      return
    }
    await setSetting('calorieGoal', n)
    setGoal(n)
  }

  async function remove(id) { await deleteDiary(id) }

  async function quickAdd(mealKey) {
    const nut = cleanNutrition(q) || {}
    const entry = {
      id: newId(),
      date: selected,
      mealType: mealKey,
      recipeId: null,
      title: q.name.trim() || 'Quick entry',
      servings: 1,
      calories: nut.calories ?? null,
      protein: nut.protein ?? null,
      carbs: nut.carbs ?? null,
      fat: nut.fat ?? null,
      custom: true,
      createdAt: Date.now()
    }
    await putDiary(entry)
    syncLogEntry(entry)
    setQuickOpen(false)
    setQ({ name: '', calories: '', protein: '', carbs: '', fat: '' })
    showToast(`Logged to ${mealLabel(mealKey)}`)
  }

  if (loading) {
    return (
      <div className="page">
        <header className="topbar"><h1>Food log</h1></header>
        <div className="center muted"><span className="spinner" /></div>
      </div>
    )
  }

  const remaining = goal != null ? goal - totals.calories : null
  const pct = goal ? Math.min(100, Math.round((totals.calories / goal) * 100)) : 0

  return (
    <div className="page">
      <header className="topbar">
        <h1>Food log</h1>
        <button className="btn icon ghost" onClick={() => setQuickOpen(true)} title="Quick add a food">
          <IconPlus />
        </button>
      </header>

      <div className="week-nav">
        <button className="btn icon ghost" onClick={() => setSelected(toISODate(addDays(selDate, -1)))} aria-label="Previous day">
          <IconChevronLeft />
        </button>
        <button className="week-label" onClick={() => setSelected(toISODate(new Date()))}>
          {dayHeading(selDate)}
        </button>
        <button className="btn icon ghost" onClick={() => setSelected(toISODate(addDays(selDate, 1)))} aria-label="Next day">
          <IconChevronRight />
        </button>
      </div>

      <div className="week-strip">
        {week.map((d) => {
          const iso = toISODate(d)
          const cals = sumNutrition(entries.filter((e) => e.date === iso)).calories
          return (
            <button
              key={iso}
              className={`wd ${iso === selected ? 'sel' : ''} ${isToday(d) ? 'today' : ''}`}
              onClick={() => setSelected(iso)}
            >
              <span className="wd-name">{weekdayShort(d)}</span>
              <span className="wd-num">{dayOfMonth(d)}</span>
              <span className={`wd-dot ${cals ? 'on' : ''}`}>{cals || ''}</span>
            </button>
          )
        })}
      </div>

      <div className="card totals-card">
        <div className="totals-cal">
          <div className="totals-main">
            <strong>{formatCalories(totals.calories)}</strong>
            <span>cal{goal ? ` of ${formatCalories(goal)}` : ''}</span>
          </div>
          {editingGoal ? (
            <input
              className="input goal-input"
              type="number"
              min="0"
              autoFocus
              defaultValue={goal || ''}
              placeholder="daily goal"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitGoal(e.currentTarget.value) }
                else if (e.key === 'Escape') setEditingGoal(false)
              }}
              onBlur={(e) => commitGoal(e.currentTarget.value)}
            />
          ) : (
            <button className="link-btn small" onClick={() => setEditingGoal(true)}>{goal ? 'Edit goal' : 'Set goal'}</button>
          )}
        </div>
        {goal ? (
          <>
            <div className="goal-bar"><span className={remaining < 0 ? 'over' : ''} style={{ width: `${pct}%` }} /></div>
            <p className="muted small">{remaining >= 0 ? `${formatCalories(remaining)} cal left` : `${formatCalories(-remaining)} cal over`}</p>
          </>
        ) : null}
        <div className="macros">
          <div className="macro"><strong>{formatGrams(totals.protein)}</strong><span>protein</span></div>
          <div className="macro"><strong>{formatGrams(totals.carbs)}</strong><span>carbs</span></div>
          <div className="macro"><strong>{formatGrams(totals.fat)}</strong><span>fat</span></div>
        </div>
      </div>

      {MEAL_TYPES.map((m) => {
        const list = dayEntries.filter((e) => e.mealType === m.key)
        if (!list.length) return null
        const mealCals = sumNutrition(list).calories
        return (
          <section key={m.key} className="diary-meal">
            <div className="section-head">
              <h2 className="section-title">{m.emoji} {m.label}</h2>
              <span className="muted small">{formatCalories(mealCals)} cal</span>
            </div>
            <ul className="diary-list">
              {list.map((e) => (
                <li key={e.id} className="diary-item">
                  <button className="diary-open" onClick={() => e.recipeId && navigate(`/recipe/${e.recipeId}`)} disabled={!e.recipeId}>
                    <span className="diary-title">{e.title}</span>
                    <span className="diary-sub">
                      {formatNumber(e.servings)} {e.servings === 1 ? 'serving' : 'servings'}
                      {e.calories != null ? ` \u00b7 ${formatCalories(e.calories)} cal` : ''}
                    </span>
                  </button>
                  <button className="plan-x" onClick={() => remove(e.id)} aria-label="Remove"><IconX /></button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {dayEntries.length === 0 && (
        <div className="hint-card">
          <IconFlame />
          <p>Nothing logged for this day yet. Open a recipe and tap <strong>Log</strong>, or use <strong>+</strong> to quick-add a food.</p>
        </div>
      )}

      {quickOpen && (
        <div className="sheet-backdrop" onClick={() => setQuickOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <h2>Quick add a food</h2>
            <div className="field">
              <label>Food</label>
              <input className="input" value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="e.g. Banana" autoFocus />
            </div>
            <div className="row">
              <div className="field">
                <label>Calories</label>
                <input className="input" type="number" min="0" value={q.calories} onChange={(e) => setQ({ ...q, calories: e.target.value })} placeholder="105" />
              </div>
              <div className="field">
                <label>Protein (g)</label>
                <input className="input" type="number" min="0" value={q.protein} onChange={(e) => setQ({ ...q, protein: e.target.value })} placeholder="1" />
              </div>
              <div className="field">
                <label>Carbs (g)</label>
                <input className="input" type="number" min="0" value={q.carbs} onChange={(e) => setQ({ ...q, carbs: e.target.value })} placeholder="27" />
              </div>
              <div className="field">
                <label>Fat (g)</label>
                <input className="input" type="number" min="0" value={q.fat} onChange={(e) => setQ({ ...q, fat: e.target.value })} placeholder="0" />
              </div>
            </div>
            <span className="log-label">Add to</span>
            <div className="plan-picker-slots">
              {MEAL_TYPES.map((m) => (
                <button key={m.key} className="chip" onClick={() => quickAdd(m.key)}>{m.emoji} {m.label}</button>
              ))}
            </div>
            <button className="sheet-item" onClick={() => setQuickOpen(false)}><IconX /> <div>Cancel</div></button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
