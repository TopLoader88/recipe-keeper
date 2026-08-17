import { useState, useEffect, useMemo } from 'react'
import { useRecipes } from '../hooks/useRecipes.js'
import { useRouter } from '../hooks/useRouter.js'
import { putRecipe } from '../lib/db.js'
import { formatMinutes } from '../lib/format.js'
import { IconSearch, IconHeart, IconHeartFilled, IconClock, IconBook, IconPlay } from './icons.jsx'

export default function Library() {
  const { recipes, loading } = useRecipes()
  const { navigate } = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const url = params.get('url') || params.get('text')
    if (url) {
      history.replaceState(null, '', location.pathname + location.hash)
      navigate(`/import?url=${encodeURIComponent(url)}`)
    }
  }, [])

  const filtered = useMemo(() => {
    let list = recipes
    if (filter === 'favorites') list = list.filter((r) => r.favorite)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((r) =>
        r.title?.toLowerCase().includes(q) ||
        r.tags?.some((t) => t.includes(q)) ||
        r.source?.siteName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [recipes, query, filter])

  async function toggleFavorite(e, recipe) {
    e.stopPropagation()
    await putRecipe({ ...recipe, favorite: !recipe.favorite })
  }

  if (loading) {
    return (
      <div className="page">
        <header className="topbar"><h1>Recipes</h1></header>
        <div className="center muted"><span className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Recipes <span className="sub">{recipes.length}</span></h1>
      </header>

      {recipes.length > 0 && (
        <>
          <div className="search-wrap">
            <IconSearch />
            <input
              className="input"
              type="search"
              placeholder="Search recipes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="chips" style={{ marginBottom: 14 }}>
            <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`chip ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilter('favorites')}>
              <IconHeart /> Favorites
            </button>
          </div>
        </>
      )}

      {filtered.length === 0 && recipes.length === 0 && (
        <div className="empty">
          <IconBook />
          <h2>No recipes yet</h2>
          <p>Import one from a website, paste from a video caption, or write your own.</p>
          <button className="btn primary" onClick={() => navigate('/import')}>Import a recipe</button>
        </div>
      )}

      {filtered.length === 0 && recipes.length > 0 && (
        <div className="empty">
          <IconSearch />
          <h2>No matches</h2>
          <p>Try a different search or filter.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid">
          {filtered.map((recipe) => (
            <article key={recipe.id} className="recipe-card">
              <div className="thumb">
                {recipe.image ? (
                  <img src={recipe.image} alt="" loading="lazy" />
                ) : (
                  <IconBook />
                )}
              </div>
              {recipe.video && (
                <span className="badge"><IconPlay /> Video</span>
              )}
              <button
                className={`fav ${recipe.favorite ? 'on' : ''}`}
                onClick={(e) => toggleFavorite(e, recipe)}
                aria-label={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {recipe.favorite ? <IconHeartFilled /> : <IconHeart />}
              </button>
              <div className="body">
                {/* Stretched to cover the card, so the whole tile is one target
                    without nesting the favourite button inside another button. */}
                <button className="name" onClick={() => navigate(`/recipe/${recipe.id}`)}>
                  {recipe.title}
                </button>
                <div className="meta">
                  {recipe.totalMinutes && <span><IconClock />{formatMinutes(recipe.totalMinutes)}</span>}
                  {recipe.source?.siteName && <span>{recipe.source.siteName}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
