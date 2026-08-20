/* Human-readable release notes shown in the "What's new" popup after an update,
   and from the version stamp in Settings. Newest first. Keep versions in sync
   with package.json (major.minor is what users see). */

export const CHANGELOG = [
  {
    version: '1.16',
    date: '2026-08-19',
    notes: [
      "Importing a recipe from a TikTok, Reels or Facebook caption is more accurate when the caption crams the whole ingredient list onto one line with dashes - like \u201c-1 can SPAM -2 eggs -\u00bc cup flour.\u201d The app used to mash that into one or two giant run-on ingredients; now it splits them into a clean, separate line each, with the amounts read correctly.",
      "The splitting is careful: hyphenated names like \u201cgluten-free\u201d or \u201chalf-and-half\u201d and ranges like \u201c5-6 cloves\u201d are left intact, and comma-separated lists still work as before.",
      "Note: some videos put the recipe only in the clip itself (the caption is just hashtags). Those can't be read from the caption - open the video and paste the steps, or use \u201cScan a photo\u201d to capture the on-screen text."
    ]
  },
  {
    version: '1.15',
    date: '2026-08-19',
    notes: [
      "Reading a recipe off a Facebook video now fills in the cook time (and the oven temperature when the video shows one) far more reliably. Those details usually flash on screen for only a second on the intro card, so the app now takes several quick extra reads over the opening of the video to catch a badge like \u201c1 HR\u201d - and it trusts a single clear on-screen reading instead of needing to see it twice.",
      "Those extra intro reads are used only for the time and temperature, so they no longer slip stray words into your ingredient list. You still get the same clean list, now with the cook time filled in when it's on screen."
    ]
  },
  {
    version: '1.14',
    date: '2026-08-18',
    notes: [
      "Reading a recipe off a Facebook video is a lot more accurate. The app was quietly skipping most of a busy frame's on-screen text before - now it reads the whole frame and samples about three times as many frames, so it catches every ingredient caption and the intro details.",
      "The ingredient list is rebuilt only from words the app actually recognizes as ingredients: uncertain reads are snapped to the closest known ingredient (a misread \"stick of duck\" becomes \"butter\"), and leftover non-ingredients are dropped by cross-checking confidence and how steadily a word stays on screen. So you get a clean list instead of stray words.",
      "It now also captures an on-screen cook time when the video shows one (e.g. a \"1 HR\" badge). It's still a draft to review against the video - a scan takes up to a minute."
    ]
  },
  {
    version: '1.13',
    date: '2026-08-17',
    notes: [
      "Reading a recipe off a Facebook video is far more accurate. Every word is now checked against a cooking dictionary learned from 500,000 real recipes, so the app fixes garbled reads, splits mashed-together words (\"dicedonion\" \u2192 \"diced onion\"), and drops leftover noise instead of inventing words that were never in the video.",
      "It samples more frames and cross-checks them, so a caption that only flashes for a second is caught and one-off misreads are voted out. You still get a draft to review against the video.",
      "If a video's on-screen text is too stylized to read cleanly, the app now tells you and points you to \u201cFrom photo\u201d instead of saving a made-up recipe."
    ]
  },
  {
    version: '1.12',
    date: '2026-08-17',
    notes: [
      "Facebook reels can now read the recipe straight off the video. When a reel's caption has no recipe (most of them), the app pulls the actual video, scans its on-screen text frame by frame, and drops a rough draft into Import for you to tidy up - no screenshots needed.",
      "It's a best-effort read of stylized on-screen text, so treat it as a draft: play the video and fix anything that came out garbled before importing.",
      "You can still tap “Scan a photo instead” for the cleanest result on any platform."
    ]
  },
  {
    version: '1.11',
    date: '2026-08-17',
    notes: [
      "Facebook now works. Pasting or sharing a Facebook reel - including the short facebook.com/share/... links - now finds the video, its title and its cover photo, plays it in the app, and takes you straight to \u201cScan a photo\u201d so you can capture the recipe from the video's on-screen text.",
      "Fixed a bug where finishing a video import could drop the cover photo (and sometimes the title). They're kept now."
    ]
  },
  {
    version: '1.10',
    date: '2026-08-17',
    notes: [
      "New: capture a recipe straight from a photo or screenshot. Reels and TikToks that show the recipe as on-screen text (with no caption to grab) can now be read with the new \u201cFrom photo\u201d tab in Import - snap or pick one or more images (ingredients + steps) and the app reads the text for you to review.",
      "You can also share a screenshot straight into Recipe Keeper from another app and it will open ready to scan.",
      "The first scan downloads the text-recognition engine (a few MB); after that it works offline."
    ]
  },
  {
    version: '1.9',
    date: '2026-08-17',
    notes: [
      "Focused the app on what it does best - capturing and organizing your recipes. The Food log tab and per-recipe calorie tracking have been retired so the app stays simple and fast."
    ]
  },
  {
    version: '1.8',
    date: '2026-08-17',
    notes: [
      "Cook time now gets picked up from a lot more videos - captions like \u201cbake at 375 for 25 min\u201d or \u201cair fry for 12 minutes\u201d used to slip through because of the temperature sitting in the middle. Your existing recipes get re-scanned automatically (anything you edited by hand is left alone).",
      "Logging a meal now actually moves your calorie total: the log screen lets you set calories (and protein / carbs / fat) per serving right there, so a meal counts toward your day even when the recipe didn't come with nutrition. Tick \u201cSave nutrition to this recipe\u201d to remember it next time.",
      "Recipe imports from cooking blogs now read their calories and macros correctly instead of dropping them.",
      "Facebook and Instagram links now pull in the caption - title, photo and any time / temperature - instead of just saving a bare link."
    ]
  },
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

