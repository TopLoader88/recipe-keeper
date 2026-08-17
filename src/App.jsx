import { useRouter, matchRoute } from './hooks/useRouter.js'
import Library from './components/Library.jsx'
import RecipeView from './components/RecipeView.jsx'
import Import from './components/Import.jsx'
import Editor from './components/Editor.jsx'
import Settings from './components/Settings.jsx'
import { IconBook, IconPlus, IconSettings } from './components/icons.jsx'

export default function App() {
  const { path, navigate } = useRouter()

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
        <button className={activeTab === 'import' ? 'active' : ''} onClick={() => navigate('/import')}>
          <IconPlus />
          <span>Import</span>
        </button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => navigate('/settings')}>
          <IconSettings />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}
