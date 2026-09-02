const DAY_LABELS = {
  vi: ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hu: ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat']
}

const MESSAGES = {
  vi: {
    closedToday: 'Hôm nay đóng cửa',
    closedNow: 'Nhà hàng đóng cửa',
    opensAt: 'Mở cửa lúc {time}',
    closedAfterHours: 'Đã hết giờ phục vụ hôm nay',
    closed: 'Đóng cửa'
  },
  en: {
    closedToday: 'Closed today',
    closedNow: 'Restaurant is closed',
    opensAt: 'Opens at {time}',
    closedAfterHours: 'We are closed for today',
    closed: 'Closed'
  },
  hu: {
    closedToday: 'Ma zárva',
    closedNow: 'Az étterem zárva',
    opensAt: 'Nyitás: {time}',
    closedAfterHours: 'Ma már nem fogadunk rendelést',
    closed: 'Zárva'
  }
}

const RESTAURANT_TIME_ZONE = 'Europe/Budapest'
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}

const getRestaurantDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const hour = Number(values.hour) === 24 ? 0 : Number(values.hour)

  return {
    dayIndex: WEEKDAY_INDEX[values.weekday] ?? date.getDay(),
    hour,
    minute: Number(values.minute) || 0
  }
}

export const getDefaultWeeklyHours = () => {
  return Array.from({ length: 7 }, (_, day) => ({
    isClosed: false,
    openTime: '11:00',
    closeTime: day === 0 ? '17:00' : '20:00'
  }))
}

export const normalizeWeeklyHours = (weeklyHours) => {
  const defaults = getDefaultWeeklyHours()
  if (!Array.isArray(weeklyHours) || weeklyHours.length !== 7) {
    return defaults
  }
  return weeklyHours.map((day, index) => ({
    isClosed: Boolean(day?.isClosed),
    openTime: day?.openTime || defaults[index].openTime,
    closeTime: day?.closeTime || defaults[index].closeTime
  }))
}

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

const formatMinutes = (totalMinutes) => {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// Inclusive :00 / :30 slots from open through close (close 21:00 → last slot 21:00).
const buildHalfHourSlots = (openTime, closeTime) => {
  if (!openTime || !closeTime) return []
  let slotMinutes = Math.ceil(timeToMinutes(openTime) / 30) * 30
  const closeMinutes = timeToMinutes(closeTime)
  const slots = []
  while (slotMinutes <= closeMinutes) {
    slots.push(formatMinutes(slotMinutes))
    slotMinutes += 30
  }
  return slots
}

const getDaySchedule = (weeklyHours, date) => {
  const normalized = normalizeWeeklyHours(weeklyHours)
  const { dayIndex } = getRestaurantDateParts(date)
  return normalized[dayIndex]
}

export const isRestaurantOpen = (weeklyHours, date = new Date()) => {
  const schedule = getDaySchedule(weeklyHours, date)
  if (!schedule || schedule.isClosed) return false

  const { openTime, closeTime } = schedule
  if (!openTime || !closeTime) return false

  const restaurantNow = getRestaurantDateParts(date)
  const nowMinutes = restaurantNow.hour * 60 + restaurantNow.minute
  const openMinutes = timeToMinutes(openTime)
  const closeMinutes = timeToMinutes(closeTime)

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes
}

export const getRestaurantStatus = (weeklyHours, lang = 'vi', date = new Date()) => {
  const t = MESSAGES[lang] || MESSAGES.vi
  const dayLabels = DAY_LABELS[lang] || DAY_LABELS.vi
  const restaurantNow = getRestaurantDateParts(date)
  const schedule = getDaySchedule(weeklyHours, date)
  const dayName = dayLabels[restaurantNow.dayIndex]

  if (!schedule || schedule.isClosed) {
    return {
      isOpen: false,
      isClosedAllDay: true,
      message: t.closedToday,
      openTime: null,
      closeTime: null,
      dayName
    }
  }

  const { openTime, closeTime } = schedule
  const nowMinutes = restaurantNow.hour * 60 + restaurantNow.minute
  const openMinutes = timeToMinutes(openTime)
  const closeMinutes = timeToMinutes(closeTime)

  if (nowMinutes < openMinutes) {
    return {
      isOpen: false,
      isClosedAllDay: false,
      message: t.opensAt.replace('{time}', openTime),
      openTime,
      closeTime,
      dayName
    }
  }

  if (nowMinutes >= closeMinutes) {
    return {
      isOpen: false,
      isClosedAllDay: false,
      message: t.closedAfterHours,
      openTime,
      closeTime,
      dayName
    }
  }

  return {
    isOpen: true,
    isClosedAllDay: false,
    message: null,
    openTime,
    closeTime,
    dayName
  }
}

const formatDayRange = (days, lang) => {
  const labels = DAY_LABELS[lang] || DAY_LABELS.vi
  if (days.length === 1) return labels[days[0]]
  if (days.length === 7) return labels[days[0]] + ' – ' + labels[days[days.length - 1]]
  return labels[days[0]] + ' – ' + labels[days[days.length - 1]]
}

const scheduleKey = (day) => {
  if (day.isClosed) return 'closed'
  return `${day.openTime}-${day.closeTime}`
}

export const formatWeeklyHoursDisplay = (weeklyHours, lang = 'vi') => {
  const normalized = normalizeWeeklyHours(weeklyHours)
  const t = MESSAGES[lang] || MESSAGES.vi
  const groups = []
  let currentGroup = null

  for (let i = 0; i < 7; i++) {
    const key = scheduleKey(normalized[i])
    if (!currentGroup || currentGroup.key !== key) {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = { key, days: [i] }
    } else {
      currentGroup.days.push(i)
    }
  }
  if (currentGroup) groups.push(currentGroup)

  return groups.map((group) => {
    const dayRange = formatDayRange(group.days, lang)
    if (group.key === 'closed') {
      return `${dayRange}: ${t.closed}`
    }
    const [open, close] = group.key.split('-')
    return `${dayRange}: ${open} – ${close}`
  }).join(', ')
}

export const formatOpeningHoursLegacy = (weeklyHours, lang = 'vi') => {
  const normalized = normalizeWeeklyHours(weeklyHours)
  const t = MESSAGES[lang] || MESSAGES.vi

  const weekdayDays = [1, 2, 3, 4, 5, 6]
  const sunday = normalized[0]

  const weekdaySchedules = weekdayDays.map((d) => normalized[d])
  const allWeekdaysSame = weekdaySchedules.every(
    (s) => s.isClosed === weekdaySchedules[0].isClosed &&
      s.openTime === weekdaySchedules[0].openTime &&
      s.closeTime === weekdaySchedules[0].closeTime
  )

  let weekdaysStr = ''
  if (allWeekdaysSame) {
    const s = weekdaySchedules[0]
    const range = formatDayRange(weekdayDays, lang)
    weekdaysStr = s.isClosed
      ? `${range}: ${t.closed}`
      : `${range}: ${s.openTime} – ${s.closeTime}`
  } else {
    weekdaysStr = weekdayDays.map((d) => {
      const s = normalized[d]
      const label = (DAY_LABELS[lang] || DAY_LABELS.vi)[d]
      return s.isClosed
        ? `${label}: ${t.closed}`
        : `${label}: ${s.openTime} – ${s.closeTime}`
    }).join(', ')
  }

  const sundayLabel = (DAY_LABELS[lang] || DAY_LABELS.vi)[0]
  const sundayStr = sunday.isClosed
    ? `${sundayLabel}: ${t.closed}`
    : `${sundayLabel}: ${sunday.openTime} – ${sunday.closeTime}`

  return { weekdays: weekdaysStr, sunday: sundayStr }
}

export const getHoursForDate = (weeklyHours, date) => {
  const schedule = getDaySchedule(weeklyHours, date)
  if (!schedule || schedule.isClosed) {
    return { isClosed: true, start: null, end: null }
  }
  const [startH] = schedule.openTime.split(':').map(Number)
  const [endH, endM] = schedule.closeTime.split(':').map(Number)
  const endHour = endM > 0 ? endH + 1 : endH
  return { isClosed: false, start: startH, end: endHour, openTime: schedule.openTime, closeTime: schedule.closeTime }
}

export const generateTimeSlotsForDate = (weeklyHours, date) => {
  const hours = getHoursForDate(weeklyHours, new Date(date))
  if (hours.isClosed || !hours.openTime || !hours.closeTime) return []
  return buildHalfHourSlots(hours.openTime, hours.closeTime)
}

export const generateOrderTimeSlots = (weeklyHours, now = new Date()) => {
  const normalized = normalizeWeeklyHours(weeklyHours)
  const hours = getHoursForDate(normalized, now)
  if (hours.isClosed || !hours.openTime || !hours.closeTime) return []

  const restaurantNow = getRestaurantDateParts(now)
  const openMinutes = timeToMinutes(hours.openTime)
  const currentMinutes = restaurantNow.hour * 60 + restaurantNow.minute
  // Earliest slot is 30 minutes from now (or opening time), rounded up to :00 / :30.
  const earliestMinutes = Math.ceil(Math.max(currentMinutes + 30, openMinutes) / 30) * 30

  return buildHalfHourSlots(hours.openTime, hours.closeTime)
    .filter((slot) => timeToMinutes(slot) >= earliestMinutes)
}

export const getDayLabels = (lang = 'vi') => DAY_LABELS[lang] || DAY_LABELS.vi
