import { useSyncExternalStore, useCallback } from 'react'
import { getAllDiary, subscribe } from '../lib/db.js'

let cache = null
let loading = true
let version = 0

function load() {
  getAllDiary().then((rows) => {
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

export function useDiary() {
  useSyncExternalStore(sub, snap)
  const refresh = useCallback(() => load(), [])
  return { entries: cache || [], loading, refresh }
}
