/* Getting a recipe out of the app: the phone share sheet, a file, or plain text. */

import { formatIngredient } from './normalize.js'
import { formatMinutes, formatNumber } from './format.js'

export function toPlainText(recipe, { scale = 1 } = {}) {
  const lines = []
  lines.push(recipe.title || 'Untitled recipe')
  if (recipe.description) lines.push('', recipe.description)

  const meta = []
  if (recipe.servings) meta.push(`Serves ${formatNumber(recipe.servings * scale)}`)
  if (recipe.prepMinutes) meta.push(`Prep ${formatMinutes(recipe.prepMinutes)}`)
  if (recipe.cookMinutes) meta.push(`Cook ${formatMinutes(recipe.cookMinutes)}`)
  if (!recipe.prepMinutes && !recipe.cookMinutes && recipe.totalMinutes) meta.push(`Total ${formatMinutes(recipe.totalMinutes)}`)
  if (meta.length) lines.push('', meta.join('  ·  '))

  if (recipe.ingredients?.length) {
    lines.push('', 'INGREDIENTS')
    for (const ing of recipe.ingredients) {
      lines.push(ing.section ? `\n${ing.section}` : `- ${formatIngredient(ing, scale)}`)
    }
  }

  if (recipe.steps?.length) {
    lines.push('', 'METHOD')
    let n = 0
    for (const step of recipe.steps) {
      if (step.section) { lines.push(`\n${step.section}`); continue }
      n += 1
      lines.push(`${n}. ${step.text}`)
    }
  }

  if (recipe.notes) lines.push('', 'NOTES', recipe.notes)
  if (recipe.source?.url) lines.push('', `Source: ${recipe.source.url}`)

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function toMarkdown(recipe, { scale = 1 } = {}) {
  const lines = [`# ${recipe.title || 'Untitled recipe'}`]
  if (recipe.description) lines.push('', recipe.description)

  const meta = []
  if (recipe.servings) meta.push(`**Serves** ${formatNumber(recipe.servings * scale)}`)
  if (recipe.prepMinutes) meta.push(`**Prep** ${formatMinutes(recipe.prepMinutes)}`)
  if (recipe.cookMinutes) meta.push(`**Cook** ${formatMinutes(recipe.cookMinutes)}`)
  if (meta.length) lines.push('', meta.join(' · '))

  if (recipe.ingredients?.length) {
    lines.push('', '## Ingredients')
    for (const ing of recipe.ingredients) {
      lines.push(ing.section ? `\n**${ing.section}**` : `- ${formatIngredient(ing, scale)}`)
    }
  }

  if (recipe.steps?.length) {
    lines.push('', '## Method')
    let n = 0
    for (const step of recipe.steps) {
      if (step.section) { lines.push(`\n**${step.section}**`); continue }
      n += 1
      lines.push(`${n}. ${step.text}`)
    }
  }

  if (recipe.notes) lines.push('', '## Notes', recipe.notes)
  if (recipe.source?.url) lines.push('', `[Original source](${recipe.source.url})`)
  return lines.join('\n')
}

/** A single-recipe file another copy of the app can import exactly. */
export function toRecipeFile(recipe, original = null) {
  return JSON.stringify(
    {
      format: 'recipe-keeper',
      version: 1,
      kind: 'recipe',
      exportedAt: Date.now(),
      recipes: [recipe],
      sources: original ? [original] : []
    },
    null,
    2
  )
}

export function slugify(text) {
  return String(text || 'recipe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'recipe'
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }))
  } catch {
    return false
  }
}

/**
 * Shares a recipe. `as` picks what actually gets sent:
 *   'text'  – readable recipe, works in any app
 *   'file'  – .recipe.json another Recipe Keeper can import losslessly
 *   'link'  – just the original source URL
 * Falls back to the clipboard, then to a download.
 * @returns {'shared'|'copied'|'downloaded'|'cancelled'}
 */
export async function shareRecipe(recipe, { as = 'text', scale = 1, original = null } = {}) {
  const title = recipe.title || 'Recipe'

  if (as === 'file') {
    const json = toRecipeFile(recipe, original)
    const filename = `${slugify(title)}.recipe.json`
    const file = new File([json], filename, { type: 'application/json' })
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file], title })
        return 'shared'
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled'
      }
    }
    downloadBlob(new Blob([json], { type: 'application/json' }), filename)
    return 'downloaded'
  }

  const text = as === 'link' ? recipe.source?.url || toPlainText(recipe, { scale }) : toPlainText(recipe, { scale })

  if (navigator.share) {
    try {
      const payload = { title, text }
      if (recipe.source?.url && as === 'link') { payload.url = recipe.source.url; delete payload.text }
      await navigator.share(payload)
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }

  if (await copyText(text)) return 'copied'
  downloadBlob(new Blob([text], { type: 'text/plain' }), `${slugify(title)}.txt`)
  return 'downloaded'
}
