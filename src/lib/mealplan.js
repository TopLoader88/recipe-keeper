/* Small local-date helpers for the weekly meal plan. Everything is computed in
   local time (not UTC) so a plan never lands on the wrong day across midnight. */

export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { key: 'lunch', label: 'Lunch', emoji: '🥪' },
  { key: 'dinner', label: 'Dinner', emoji: '🍽️' }
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** yyyy-mm-dd in local time. */
export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/** Midnight on the Sunday that starts this date's week. */
export function startOfWeek(date, weekStartsOn = 0) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export function weekDays(startDate) {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isToday(date) {
  return isSameDay(new Date(date), new Date())
}

export function weekdayShort(date) { return WEEKDAYS[new Date(date).getDay()] }
export function dayOfMonth(date) { return new Date(date).getDate() }

/** e.g. "Aug 17 – 23". */
export function weekRangeLabel(startDate) {
  const end = addDays(startDate, 6)
  const s = new Date(startDate)
  const startPart = `${MONTHS[s.getMonth()]} ${s.getDate()}`
  const endPart = s.getMonth() === end.getMonth() ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`
  return `${startPart} – ${endPart}`
}

/** "Today", "Tomorrow", or "Mon, Aug 18". */
export function dayHeading(date) {
  const d = new Date(date)
  const today = new Date()
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, addDays(today, 1))) return 'Tomorrow'
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function slotLabel(key) {
  const s = SLOTS.find((x) => x.key === key)
  return s ? s.label : key
}
