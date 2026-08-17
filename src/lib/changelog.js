/* Human-readable release notes shown in the "What's new" popup after an update,
   and from the version stamp in Settings. Newest first. Keep versions in sync
   with package.json (major.minor is what users see). */

export const CHANGELOG = [
  {
    version: '1.3',
    date: '2026-08-17',
    notes: [
      'Recipe cards now show a cook time when the video mentions one (e.g. "ready in 30 minutes").',
      "No time detected? Open the recipe and tap 'Add cook time' to set it yourself."
    ]
  },
  {
    version: '1.2',
    date: '2026-08-17',
    notes: [
      "TikTok videos now play right inside the recipe - switched to TikTok's native player.",
      "New: after each update you'll see a short \"What's new\" note. Tap the version in Settings to read past notes anytime."
    ]
  },
  {
    version: '1.1',
    date: '2026-08-17',
    notes: [
      'Serving scaler on every recipe: tap to set servings and scale ingredient amounts up or down - even on TikTok imports that had no serving count.'
    ]
  },
  {
    version: '1.0',
    date: '2026-08-16',
    notes: [
      'Import recipes straight from a TikTok link - the caption is turned into a recipe card automatically.',
      'Fixed shared links opening the paste box instead of importing the URL.',
      "Added a version number in Settings so you can confirm you're on the latest."
    ]
  }
]

/** Compares dotted numeric versions. Missing parts count as 0, so 1.2 === 1.2.0. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** Entries newer than the last version the user acknowledged. On a first run
    (no record yet) we show only the latest note rather than the whole history. */
export function entriesSince(lastSeen) {
  if (!lastSeen) return CHANGELOG.slice(0, 1)
  return CHANGELOG.filter((e) => compareVersions(e.version, lastSeen) > 0)
}
