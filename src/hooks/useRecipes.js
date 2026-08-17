import { useSyncExternalStore, useCallback, useRef } from 'react'
import { getAllRecipes, subscribe } from '../lib/db.js'

let cache = null
let loading = true
let version = 0

function load() {
  getAllRecipes().then((rows) => {
    cache = rows
    loading = false
    version++
    notify()
  })
}

const listeners = new Set()
function notify() { for (const fn of listeners) fn() }
function sub(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function snap() { return version }

subscribe(() => { load() })
load()

export function useRecipes() {
  useSyncExternalStore(sub, snap)
  const refresh = useCallback(() => load(), [])
  return { recipes: cache || [], loading, refresh }
}
