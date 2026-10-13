export const DEFAULT_RESTAURANT_TIME_ZONE = 'Europe/Budapest'

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}

export const isValidTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export const normalizeTimeZone = (timeZone) => (
  isValidTimeZone(timeZone) ? timeZone : DEFAULT_RESTAURANT_TIME_ZONE
)

let activeTimeZone = DEFAULT_RESTAURANT_TIME_ZONE
const listeners = new Set()

export const getActiveRestaurantTimeZone = () => activeTimeZone

export const setActiveRestaurantTimeZone = (timeZone) => {
  const next = normalizeTimeZone(timeZone)
  if (next === activeTimeZone) return activeTimeZone
  activeTimeZone = next
  listeners.forEach((listener) => listener(next))
  return activeTimeZone
}

export const subscribeRestaurantTimeZone = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getZonedParts = (date = new Date(), timeZone) => {
  const zone = normalizeTimeZone(timeZone || activeTimeZone)
  const value = date instanceof Date ? date : new Date(date)
  const safeDate = Number.isNaN(value.getTime()) ? new Date() : value
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(safeDate)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const hour = Number(values.hour) === 24 ? 0 : Number(values.hour)

  return {
    timeZone: zone,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour,
    minute: Number(values.minute) || 0,
    second: Number(values.second) || 0,
    weekday: values.weekday,
    dayIndex: WEEKDAY_INDEX[values.weekday] ?? safeDate.getDay()
  }
}

export const calendarDateKey = (date = new Date(), timeZone) => {
  const parts = getZonedParts(date, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export const zonedCalendarDayIndex = (date = new Date(), timeZone) => {
  const parts = getZonedParts(date, timeZone)
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000)
}

export const formatRestaurantDateTime = (date, locale, options = {}) => {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    timeZone: getActiveRestaurantTimeZone(),
    ...options
  }).format(value)
}
