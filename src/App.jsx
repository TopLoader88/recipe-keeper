import { useState, useEffect } from 'react'
import { useRouter, matchRoute } from './hooks/useRouter.js'
import Library from './components/Library.jsx'
import RecipeView from './components/RecipeView.jsx'
import Import from './components/Import.jsx'
import Editor from './components/Editor.jsx'
import Settings from './components/Settings.jsx'
import Grocery from './components/Grocery.jsx'
import MealPlan from './components/MealPlan.jsx'
import { IconBook, IconPlus, IconSettings, IconCart, IconCalendar } from './components/icons.jsx'
import { getSetting, setSetting } from './lib/db.js'
import { APP_VERSION } from './lib/version.js'
import { entriesSince } from './lib/changelog.js'
import { backfillMetadata } from './lib/migrate.js'
import WhatsNew from './components/WhatsNew.jsx'

export default function App() {
  const { path, navigate } = useRouter()
  const [whatsNew, setWhatsNew] = useState(null)

  useEffect(() => {
    let cancelled = false
    getSetting('lastSeenVersion', null).then((seen) => {
      if (cancelled || seen === APP_VERSION) return
      const entries = entriesSince(seen)
      if (entries.length) setWhatsNew(entries)
      else setSetting('lastSeenVersion', APP_VERSION)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { backfillMetadata() }, [])

  function closeWhatsNew() {
    setWhatsNew(null)
    setSetting('lastSeenVersion', APP_VERSION)
  }

  let page = null
  let activeTab = null
  let recipeMatch, editMatch

  if ((recipeMatch = matchRoute(path, '/recipe/:id/edit'))) {
    page = <Editor id={recipeMatch.id} />
  } else if (path === '/new') {
    page = <Editor />
  } else if ((recipeMatch = matchRoute(path, '/recipe/:id'))) {
    page = <RecipeView id={recipeMatch.id} />
  } else if (path === '/import' || path.startsWith('/import')) {
    page = <Import />
    activeTab = 'import'
  } else if (path === '/plan') {
    page = <MealPlan />
    activeTab = 'plan'
  } else if (path === '/grocery') {
    page = <Grocery />
    activeTab = 'grocery'
  } else if (path === '/settings') {
    page = <Settings />
    activeTab = 'settings'
  } else {
    page = <Library />
    activeTab = 'library'
  }

  return (
    <div className="app">
      {page}
      <nav className="tabbar">
        <button className={activeTab === 'library' ? 'active' : ''} onClick={() => navigate('/')}>
          <IconBook />
          <span>Library</span>
        </button>
        <button className={activeTab === 'plan' ? 'active' : ''} onClick={() => navigate('/plan')}>
          <IconCalendar />
          <span>Plan</span>
        </button>
        <button className={activeTab === 'import' ? 'active' : ''} onClick={() => navigate('/import')}>
          <IconPlus />
          <span>Import</span>
        </button>
        <button className={activeTab === 'grocery' ? 'active' : ''} onClick={() => navigate('/grocery')}>
          <IconCart />
          <span>Grocery</span>
        </button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => navigate('/settings')}>
          <IconSettings />
          <span>Settings</span>
        </button>
      </nav>
      {whatsNew && <WhatsNew entries={whatsNew} onClose={closeWhatsNew} />}
    </div>
  )
}
