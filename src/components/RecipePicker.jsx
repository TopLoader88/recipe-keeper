import { useState, useMemo } from 'react'
import { useRecipes } from '../hooks/useRecipes.js'
import { formatMinutes } from '../lib/format.js'
import { IconSearch, IconX, IconBook, IconClock, IconPlay } from './icons.jsx'

/* A bottom sheet that lists saved recipes so the meal planner can drop one into
   a day/slot. Stateless about where it lands - the caller passes onPick. */
export default function RecipePicker({ title = 'Add a recipe', onPick, onClose, onWriteIn }) {
  const { recipes } = useRecipes()
  const [query, setQuery] = useState('')
  const [writein, setWritein] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) =>
      r.title?.toLowerCase().includes(q) || r.tags?.some((t) => t.includes(q))
    )
  }, [recipes, query])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet picker" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="picker-head">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose}><IconX /></button>
        </div>
        <div className="search-wrap">
          <IconSearch />
          <input
            className="input"
            type="search"
            placeholder="Search recipes…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {onWriteIn && (
          <div className="picker-writein">
            <input
              className="input"
              type="text"
              placeholder="Or write in your own (e.g. Leftovers)"
              value={writein}
              onChange={(e) => setWritein(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = writein.trim(); if (v) onWriteIn(v) } }}
            />
            <button className="btn small" disabled={!writein.trim()} onClick={() => { const v = writein.trim(); if (v) onWriteIn(v) }}>Add</button>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="picker-empty">
            <IconBook />
            <p>{recipes.length === 0 ? 'No recipes yet — import one first.' : 'No matches.'}</p>
          </div>
        ) : (
          <ul className="picker-list">
            {filtered.map((r) => (
              <li key={r.id}>
                <button className="picker-item" onClick={() => onPick(r)}>
                  <div className="picker-thumb">
                    {r.image ? <img src={r.image} alt="" loading="lazy" /> : <IconBook />}
                  </div>
                  <div className="picker-info">
                    <span className="picker-name">{r.title}</span>
                    <span className="picker-meta">
                      {r.totalMinutes ? <span><IconClock /> {formatMinutes(r.totalMinutes)}</span> : null}
                      {r.video ? <span className="pill"><IconPlay /> Video</span> : null}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
