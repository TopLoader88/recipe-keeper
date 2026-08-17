import { useState, useCallback } from 'react'
import { useGrocery } from '../hooks/useGrocery.js'
import { parseIngredient } from '../lib/normalize.js'
import {
  groupBySection, formatAmounts, lineFromIngredient, addLine, groceryToText,
  SECTIONS, instacartSearchUrl, INSTACART_SAFEWAY
} from '../lib/grocery.js'
import {
  putGrocery, putGroceryBulk, deleteGrocery, clearCheckedGrocery, clearGrocery
} from '../lib/db.js'
import ConfirmSheet from './ConfirmSheet.jsx'
import {
  IconPlus, IconShare, IconClipboard, IconTrash, IconCart,
  IconExternalLink, IconChevronRight, IconX
} from './icons.jsx'

export default function Grocery() {
  const { items, loading } = useGrocery()
  const [text, setText] = useState('')
  const [sheetItem, setSheetItem] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }, [])

  const active = items.filter((i) => !i.checked)
  const done = items.filter((i) => i.checked)
  const groups = groupBySection(active)

  async function add(e) {
    e.preventDefault()
    const parsed = parseIngredient(text)
    const line = parsed && lineFromIngredient(parsed)
    setText('')
    if (!line) return
    await putGroceryBulk(addLine(items, line, { manual: true }))
  }

  async function toggle(it) { await putGrocery({ ...it, checked: !it.checked }) }
  async function remove(it) { await deleteGrocery(it.id) }
  async function move(it, section) { await putGrocery({ ...it, section }); setSheetItem(null) }

  async function copy() {
    const t = groceryToText(items)
    if (!t) { showToast('List is empty'); return }
    try { await navigator.clipboard.writeText(t); showToast('Copied list') }
    catch { showToast('Could not copy') }
  }

  async function share() {
    const t = groceryToText(items)
    if (!t) { showToast('List is empty'); return }
    try {
      if (navigator.share) { await navigator.share({ title: 'Grocery list', text: t }); return }
    } catch (err) { if (err && err.name === 'AbortError') return }
    await copy()
  }

  if (loading) {
    return (
      <div className="page">
        <header className="topbar"><h1>Grocery</h1></header>
        <div className="center muted"><span className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Grocery {active.length > 0 && <span className="sub">{active.length}</span>}</h1>
        <button className="btn icon ghost" onClick={share} title="Share list"><IconShare /></button>
      </header>

      <form className="grocery-add" onSubmit={add}>
        <input
          className="input"
          type="text"
          placeholder="Add an item…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary" type="submit" aria-label="Add"><IconPlus /></button>
      </form>

      {items.length > 0 && (
        <div className="grocery-tools">
          <button className="chip" onClick={copy}><IconClipboard /> Copy</button>
          <a className="chip" href={INSTACART_SAFEWAY} target="_blank" rel="noopener noreferrer">
            <IconCart /> Shop at Safeway
          </a>
          {done.length > 0 && (
            <button className="chip" onClick={() => clearCheckedGrocery()}>Clear checked</button>
          )}
          <button className="chip danger" onClick={() => setConfirmClear(true)}><IconTrash /> Clear all</button>
        </div>
      )}

      {items.length === 0 && (
        <div className="empty">
          <IconCart />
          <h2>Your list is empty</h2>
          <p>Add items above, or open a recipe and tap <strong>Add to list</strong>. Items are grouped by where they sit in the store.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.section.key} className="aisle">
          <h2 className="aisle-head"><span className="aisle-emoji">{g.section.emoji}</span> {g.section.label}</h2>
          <ul className="grocery-list">
            {g.items.map((it) => {
              const amt = formatAmounts(it.amounts)
              return (
                <li key={it.id}>
                  <label className="grocery-check">
                    <input type="checkbox" checked={false} onChange={() => toggle(it)} />
                    <span className="grocery-name">
                      {amt && <span className="amt">{amt}</span>} {it.name}
                      {it.note && <span className="opt"> ({it.note})</span>}
                    </span>
                  </label>
                  <button className="grocery-more" onClick={() => setSheetItem(it)} aria-label="Item options">
                    <IconChevronRight />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="aisle cart-done">
          <h2 className="aisle-head">In the cart <span className="sub">{done.length}</span></h2>
          <ul className="grocery-list">
            {done.map((it) => (
              <li key={it.id} className="checked">
                <label className="grocery-check">
                  <input type="checkbox" checked readOnly onChange={() => toggle(it)} />
                  <span className="grocery-name">
                    {formatAmounts(it.amounts) && <span className="amt">{formatAmounts(it.amounts)}</span>} {it.name}
                  </span>
                </label>
                <button className="grocery-more" onClick={() => remove(it)} aria-label="Remove"><IconX /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheetItem && (
        <div className="sheet-backdrop" onClick={() => setSheetItem(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grabber" />
            <h2>{sheetItem.name}</h2>
            <a
              className="sheet-item"
              href={instacartSearchUrl(sheetItem.name)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSheetItem(null)}
            >
              <IconExternalLink /> <div>Find at Safeway<span className="sub">Search on Instacart</span></div>
            </a>
            <div className="aisle-picker">
              <span className="aisle-picker-label">Move to aisle</span>
              <div className="chips">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    className={`chip ${sheetItem.section === s.key ? 'active' : ''}`}
                    onClick={() => move(sheetItem, s.key)}
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="sheet-item danger" onClick={() => { remove(sheetItem); setSheetItem(null) }}>
              <IconTrash /> <div>Remove from list</div>
            </button>
            <button className="sheet-item" onClick={() => setSheetItem(null)}>
              <IconX /> <div>Cancel</div>
            </button>
          </div>
        </div>
      )}

      {confirmClear && (
        <ConfirmSheet
          title="Clear the whole list?"
          body="Every item, checked or not, will be removed."
          onConfirm={() => { clearGrocery(); setConfirmClear(false) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
