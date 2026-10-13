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

export const getActiveRestaurantTimeZone = () => activeTimeZone

export const setActiveRestaurantTimeZone = (timeZone) => {
  activeTimeZone = normalizeTimeZone(timeZone)
  return activeTimeZone
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

const zonedWallTimeToUtc = (year, month, day, hour, minute, second, timeZone) => {
  const zone = normalizeTimeZone(timeZone)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const shown = getZonedParts(new Date(utcGuess), zone)
  const shownAsUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    shown.second
  )
  return new Date(utcGuess - (shownAsUtc - utcGuess))
}

export const startOfZonedDay = (date = new Date(), timeZone) => {
  const parts = getZonedParts(date, timeZone)
  return zonedWallTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, parts.timeZone)
}

export const startOfZonedMonth = (date = new Date(), timeZone) => {
  const parts = getZonedParts(date, timeZone)
  return zonedWallTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, parts.timeZone)
}

export const shiftZonedDays = (date = new Date(), dayDelta = 0, timeZone) => {
  const parts = getZonedParts(date, timeZone)
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayDelta))
  return zonedWallTimeToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    0,
    0,
    parts.timeZone
  )
}
