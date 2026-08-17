/* Human-readable release notes shown in the "What's new" popup after an update,
   and from the version stamp in Settings. Newest first. Keep versions in sync
   with package.json (major.minor is what users see). */

export const CHANGELOG = [
  {
    version: '1.7',
    date: '2026-08-17',
    notes: [
      "Meal plan: if you delete a recipe that was on your plan, the entry now stays put and turns red so you can see what's missing - instead of quietly breaking. Tap the X to clear it whenever you like."
    ]
  },
  {
    version: '1.6',
    date: '2026-08-17',
    notes: [
      "New Food log tab: track what you actually eat. Log servings from any recipe into breakfast, lunch, dinner or a snack and watch your daily calories and protein / carbs / fat add up.",
      "Recipes can now hold calories and macros per serving - shown on the recipe and scaled to your serving size. Add them in the editor, or they're pulled in automatically when a TikTok caption lists them.",
      "Set a daily calorie goal and see how much you have left for the day.",
      "Quick-add any food by name + calories without a recipe, and swipe away anything you logged by mistake."
    ]
  },
  {
    version: '1.5',
    date: '2026-08-17',
    notes: [
      "Recipes now capture the oven temperature when the video or steps mention one - shown on the card and the recipe page in both \u00b0F and \u00b0C.",
      "Older imported recipes get their cook time and temperature filled in automatically once detected. Recipes you added or edited by hand are never touched.",
      "Adding a recipe to your grocery list now skips any ingredient you've already checked off - checked means you have it, so it won't be re-added.",
      "Meal plan: write in your own entry for a day (like 'Leftovers' or 'Dinner out') without needing a saved recipe."
    ]
  },
  {
    version: '1.4',
    date: '2026-08-17',
    notes: [
      "New Grocery tab: a shopping list auto-sorted by store section (Produce, Meat, Dairy, Frozen...) - the way the Safeway app groups aisles. Add items by hand or pull them from any recipe, then check them off as you shop.",
      "New Meal plan tab: a weekly calendar with breakfast / lunch / dinner slots. Plan your week, then tap one button to send every ingredient to your grocery list.",
      "From any recipe: 'Add to list' drops its ingredients into the grocery list, and 'Plan' puts it on a day.",
      "Tap a grocery item to search for it on Safeway (via Instacart) or move it to a different aisle."
    ]
  },
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

