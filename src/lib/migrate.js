/* Retroactively fills in metadata that a newer parser can extract but an older
   import missed - currently cook time and oven temperature. It runs once per
   BACKFILL_VERSION, only ever fills BLANK fields, and never touches a recipe the
   user wrote by hand or edited in the editor. Bump BACKFILL_VERSION whenever a
   new extractor should sweep existing recipes. */

import { getAllRecipes, getAllSources, putRecipes, getSetting, setSetting } from './db.js'
import { extractTimes, extractTemperature } from './parse.js'
import { normalizeTemperatures } from './normalize.js'

const BACKFILL_VERSION = 1

/** Everything we can legitimately read a time/temperature out of for one recipe:
    its captured caption/transcript, the oEmbed title, the raw instructions, and
    the cleaned description + steps. */
function sourceText(recipe, source) {
  const parts = []
  if (source) {
    if (source.text) parts.push(source.text)
    if (source.oembed && source.oembed.title) parts.push(source.oembed.title)
    if (Array.isArray(source.rawInstructions)) parts.push(source.rawInstructions.join('\n'))
  }
  if (recipe.description) parts.push(recipe.description)
  for (const step of recipe.steps || []) if (step && step.text) parts.push(step.text)
  return parts.join('\n')
}

function isUserOwned(recipe) {
  if (recipe.userEdited) return true
  const method = (recipe.source && recipe.source.method) || ''
  return /written by hand|manual/i.test(method)
}

export async function backfillMetadata() {
  try {
    const done = await getSetting('metaBackfillVersion', 0)
    if (done >= BACKFILL_VERSION) return { changed: 0, skipped: true }

    const [recipes, sources] = await Promise.all([getAllRecipes(), getAllSources()])
    const sourceById = new Map(sources.map((s) => [s.recipeId, s]))
    const updated = []

    for (const recipe of recipes) {
      if (isUserOwned(recipe)) continue

      const needTime = !recipe.prepMinutes && !recipe.cookMinutes && !recipe.totalMinutes
      const needTemp = !recipe.temperature
      if (!needTime && !needTemp) continue

      const blob = sourceText(recipe, sourceById.get(recipe.id))
      if (!blob.trim()) continue

      let changed = false
      const next = { ...recipe }

      if (needTime) {
        const t = extractTimes(blob)
        const prep = t.prepTime || null
        const cook = t.cookTime || null
        const total = t.totalTime || ((prep || cook) ? (prep || 0) + (cook || 0) : null)
        if (prep || cook || total) {
          if (prep) next.prepMinutes = prep
          if (cook) next.cookMinutes = cook
          if (total) next.totalMinutes = total
          changed = true
        }
      }

      if (needTemp) {
        const canonical = extractTemperature(blob)
        if (canonical) {
          next.temperature = normalizeTemperatures(canonical)
          changed = true
        }
      }

      if (changed) updated.push(next)
    }

    if (updated.length) await putRecipes(updated)
    await setSetting('metaBackfillVersion', BACKFILL_VERSION)
    return { changed: updated.length, skipped: false }
  } catch (err) {
    // A backfill must never block the app; leave the flag unset so it retries.
    console.warn('metadata backfill failed', err)
    return { changed: 0, error: String(err) }
  }
}
