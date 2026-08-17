import { useState, useCallback } from 'react'
import { useMealPlan } from '../hooks/useMealPlan.js'
import { useRouter } from '../hooks/useRouter.js'
import {
  SLOTS, startOfWeek, weekDays, addDays, toISODate, weekdayShort, dayOfMonth,
  weekRangeLabel, dayHeading, isToday, slotLabel
} from '../lib/mealplan.js'
import {
  putMealPlan, deleteMealPlan, getRecipe, getAllGrocery, putGroceryBulk
} from '../lib/db.js'
import { lineFromIngredient, addLine } from '../lib/grocery.js'
import RecipePicker from './RecipePicker.jsx'
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconListPlus, IconCalendar } from './icons.jsx'

function newId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  return 'm-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function MealPlan() {
  const { entries, loading } = useMealPlan()
  const { navigate } = useRouter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [picker, setPicker] = useState(null)
  const [toast, setToast] = useState('')

  const days = weekDays(weekStart)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }, [])

  async function addEntry(recipe) {
    const ctx = picker
    setPicker(null)
    if (!ctx) return
    await putMealPlan({
      id: newId(),
      date: ctx.date,
      slot: ctx.slot,
      recipeId: recipe.id,
      title: recipe.title,
      image: recipe.image || null,
      createdAt: Date.now()
    })
    showToast(`Added to ${slotLabel(ctx.slot)}`)
  }

  async function addCustom(text) {
    const ctx = picker
    setPicker(null)
    if (!ctx || !text) return
    await putMealPlan({
      id: newId(),
      date: ctx.date,
      slot: ctx.slot,
      recipeId: null,
      title: text,
      image: null,
      custom: true,
      createdAt: Date.now()
    })
    showToast(`Added to ${slotLabel(ctx.slot)}`)
  }

  async function removeEntry(id) { await deleteMealPlan(id) }

  async function addWeekToGrocery() {
    const isoSet = new Set(days.map(toISODate))
    const weekEntries = entries.filter((e) => isoSet.has(e.date))
    if (!weekEntries.length) { showToast('No meals planned this week'); return }
    const ids = [...new Set(weekEntries.map((e) => e.recipeId).filter(Boolean))]
    const recipes = await Promise.all(ids.map((id) => getRecipe(id)))
    const byId = new Map(recipes.filter(Boolean).map((r) => [r.id, r]))
    let list = await getAllGrocery()
    let added = 0
    for (const e of weekEntries) {
      const r = byId.get(e.recipeId)
      if (!r) continue
      for (const ing of r.ingredients || []) {
        const line = lineFromIngredient(ing)
        if (!line) continue
        list = addLine(list, line, { source: r.title })
        added++
      }
    }
    await putGroceryBulk(list)
    showToast(added ? `Added ${added} items to grocery` : 'Those recipes have no ingredients')
  }

  if (loading) {
    return (
      <div className="page">
        <header className="topbar"><h1>Meal plan</h1></header>
        <div className="center muted"><span className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Meal plan</h1>
        <button className="btn icon ghost" onClick={addWeekToGrocery} title="Add this week to grocery list">
          <IconListPlus />
        </button>
      </header>

      <div className="week-nav">
        <button className="btn icon ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <IconChevronLeft />
        </button>
        <button className="week-label" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          {weekRangeLabel(weekStart)}
        </button>
        <button className="btn icon ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <IconChevronRight />
        </button>
      </div>

      <div className="week-strip">
        {days.map((d) => {
          const iso = toISODate(d)
          const count = entries.filter((e) => e.date === iso).length
          return (
            <button
              key={iso}
              className={`wd ${isToday(d) ? 'today' : ''}`}
              onClick={() => document.getElementById(`day-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <span className="wd-name">{weekdayShort(d)}</span>
              <span className="wd-num">{dayOfMonth(d)}</span>
              <span className={`wd-dot ${count ? 'on' : ''}`}>{count || ''}</span>
            </button>
          )
        })}
      </div>

      <div className="days">
        {days.map((d) => {
          const iso = toISODate(d)
          return (
            <section key={iso} id={`day-${iso}`} className={`day-card ${isToday(d) ? 'today' : ''}`}>
              <h2 className="day-head">{dayHeading(d)}</h2>
              {SLOTS.map((slot) => {
                const list = entries.filter((e) => e.date === iso && e.slot === slot.key)
                return (
                  <div key={slot.key} className="slot">
                    <div className="slot-label">{slot.emoji} {slot.label}</div>
                    <div className="slot-body">
                      {list.map((e) => (
                        <div key={e.id} className={`plan-chip ${e.recipeId ? '' : 'custom'}`}>
                          <button className="plan-open" onClick={() => e.recipeId && navigate(`/recipe/${e.recipeId}`)}>
                            {e.title}
                          </button>
                          <button className="plan-x" onClick={() => removeEntry(e.id)} aria-label="Remove"><IconX /></button>
                        </div>
                      ))}
                      <button className="slot-add" onClick={() => setPicker({ date: iso, slot: slot.key })}>
                        <IconPlus /> Add
                      </button>
                    </div>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>

      {entries.length === 0 && (
        <div className="hint-card">
          <IconCalendar />
          <p>Plan meals for the week, then tap <strong>Add week to list</strong> to build a grocery list from everything you picked.</p>
        </div>
      )}

      {picker && (
        <RecipePicker
          title={`Add to ${slotLabel(picker.slot)}`}
          onPick={addEntry}
          onWriteIn={addCustom}
          onClose={() => setPicker(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
