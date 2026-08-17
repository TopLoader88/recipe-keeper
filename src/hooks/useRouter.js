import { useSyncExternalStore, useCallback } from 'react'

function getHash() {
  return location.hash.replace(/^#/, '') || '/'
}

function subscribeHash(cb) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRouter() {
  const path = useSyncExternalStore(subscribeHash, getHash)

  const navigate = useCallback((to) => {
    location.hash = to
  }, [])

  const back = useCallback(() => {
    history.back()
  }, [])

  return { path, navigate, back }
}

export function matchRoute(path, pattern) {
  const parts = path.split('/')
  const pats = pattern.split('/')
  if (parts.length !== pats.length) return null
  const params = {}
  for (let i = 0; i < pats.length; i++) {
    if (pats[i].startsWith(':')) {
      params[pats[i].slice(1)] = decodeURIComponent(parts[i])
    } else if (pats[i] !== parts[i]) {
      return null
    }
  }
  return params
}
