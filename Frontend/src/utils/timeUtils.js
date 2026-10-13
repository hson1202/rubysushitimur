/**
 * Utility functions for time-based food availability
 */
import { formatRestaurantDateTime, getZonedParts } from './timeZone'

const getRestaurantNow = (date = new Date()) => {
  const parts = getZonedParts(date)
  return {
    date: parts,
    day: parts.dayIndex,
    minutes: parts.hour * 60 + parts.minute,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  }
}

/**
 * Check if a food item is currently available based on time settings
 * @param {Object} food - Food item object
 * @returns {Boolean} - True if available, false otherwise
 */
export const isFoodAvailable = (food) => {
  if (!food) return false;

  const nowClock = getRestaurantNow();
  const now = new Date();

  // Check date-based availability (availableFrom & availableTo)
  if (food.availableFrom || food.availableTo) {
    const availableFrom = food.availableFrom ? new Date(food.availableFrom) : null;
    const availableTo = food.availableTo ? new Date(food.availableTo) : null;

    if (availableFrom && now < availableFrom) {
      return false; // Not yet available
    }

    if (availableTo && now > availableTo) {
      return false; // No longer available
    }
  }

  // Check weekly schedule (day of week availability)
  if (food.weeklySchedule?.enabled) {
    const { days } = food.weeklySchedule;
    
    // If weekly schedule is enabled, days array MUST have at least one day
    if (!days || !Array.isArray(days) || days.length === 0) {
      return false; // Not available - no days configured
    }
    
    if (!days.includes(nowClock.day)) {
      return false; // Not available on this day of week
    }
  }

  // Check daily time-based availability (dailyAvailability)
  if (food.dailyAvailability?.enabled) {
    const { timeFrom, timeTo } = food.dailyAvailability;
    
    if (timeFrom && timeTo) {
      const currentTime = nowClock.time;
      
      if (currentTime < timeFrom || currentTime > timeTo) {
        return false; // Outside daily time window
      }
    }
  }

  return true; // Available
};

/**
 * Get availability status message
 * @param {Object} food - Food item object
 * @param {String} language - Current language (vi, en, hu)
 * @returns {Object} - {available: Boolean, message: String, timeInfo: String}
 */
export const getAvailabilityStatus = (food, language = 'vi') => {
  const messages = {
    vi: {
      available: 'Có sẵn',
      notYetAvailable: 'Chưa có',
      noLongerAvailable: 'Hết giờ',
      notAvailableToday: 'Không phục vụ hôm nay',
      availableTime: 'Phục vụ',
      from: 'từ',
      to: 'đến',
      days: {
        0: 'Chủ Nhật',
        1: 'Thứ 2',
        2: 'Thứ 3',
        3: 'Thứ 4',
        4: 'Thứ 5',
        5: 'Thứ 6',
        6: 'Thứ 7'
      }
    },
    en: {
      available: 'Available',
      notYetAvailable: 'Not yet available',
      noLongerAvailable: 'No longer available',
      notAvailableToday: 'Not available today',
      availableTime: 'Available',
      from: 'from',
      to: 'to',
      days: {
        0: 'Sunday',
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday'
      }
    },
    sk: {
      available: 'Dostupné',
      notYetAvailable: 'Ešte nie je k dispozícii',
      noLongerAvailable: 'Už nie je k dispozícii',
      notAvailableToday: 'Dnes nie je k dispozícii',
      availableTime: 'Dostupné',
      from: 'od',
      to: 'do',
      days: {
        0: 'Nedeľa',
        1: 'Pondelok',
        2: 'Utorok',
        3: 'Streda',
        4: 'Štvrtok',
        5: 'Piatok',
        6: 'Sobota'
      }
    }
  };

  const t = messages[language] || messages.vi;
  const nowClock = getRestaurantNow();
  const now = new Date();

  // Check date-based availability
  if (food.availableFrom || food.availableTo) {
    const availableFrom = food.availableFrom ? new Date(food.availableFrom) : null;
    const availableTo = food.availableTo ? new Date(food.availableTo) : null;

    if (availableFrom && now < availableFrom) {
      return {
        available: false,
        message: t.notYetAvailable,
        timeInfo: `${t.from} ${formatDateTime(availableFrom, language)}`
      };
    }

    if (availableTo && now > availableTo) {
      return {
        available: false,
        message: t.noLongerAvailable,
        timeInfo: `${t.to} ${formatDateTime(availableTo, language)}`
      };
    }
  }

  // Check weekly schedule (day of week availability)
  if (food.weeklySchedule?.enabled) {
    const { days } = food.weeklySchedule;
    
    // If weekly schedule is enabled, days array MUST have at least one day
    if (!days || !Array.isArray(days) || days.length === 0) {
      return {
        available: false,
        message: t.notAvailableToday,
        timeInfo: t.noDaysConfigured || 'No days configured'
      };
    }
    
    if (!days.includes(nowClock.day)) {
      // Not available today - show which days it's available
      const dayNames = days.map(d => t.days[d]).join(', ');
      return {
        available: false,
        message: t.notAvailableToday,
        timeInfo: dayNames
      };
    }
  }

  // Check daily time availability
  if (food.dailyAvailability?.enabled) {
    const { timeFrom, timeTo } = food.dailyAvailability;
    
    if (timeFrom && timeTo) {
      const currentTime = nowClock.time;
      
      const isAvailableNow = currentTime >= timeFrom && currentTime <= timeTo;
      
      // Always show the time range so customers know when to order
      return {
        available: isAvailableNow,
        message: isAvailableNow ? t.available : t.noLongerAvailable,
        timeInfo: `${timeFrom} – ${timeTo}`,
        showAlways: true // always display even if available
      };
    }
  }

  return {
    available: true,
    message: t.available,
    timeInfo: null
  };
};

/**
 * Format date time for display
 * @param {Date} date
 * @param {String} language
 * @returns {String}
 */
const formatDateTime = (date, language = 'vi') => {
  const options = { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  const locale = language === 'vi' ? 'vi-VN' : language === 'hu' ? 'hu-HU' : 'en-US';
  return formatRestaurantDateTime(date, locale, options);
};

/**
 * Format time string (HH:MM)
 * @param {String} timeString - "HH:MM" format
 * @returns {String} - Formatted time
 */
export const formatTime = (timeString) => {
  if (!timeString) return '';
  return timeString;
};

/**
 * Calculate time remaining until available or until no longer available
 * @param {Object} food
 * @returns {Object} - {minutes: Number, isStarting: Boolean}
 */
export const getTimeRemaining = (food) => {
  const nowClock = getRestaurantNow();

  // Check daily availability
  if (food.dailyAvailability?.enabled) {
    const { timeFrom, timeTo } = food.dailyAvailability;
    
    if (timeFrom) {
      const [hours, minutes] = timeFrom.split(':').map(Number);
      const targetMinutes = hours * 60 + minutes;

      if (nowClock.minutes < targetMinutes) {
        return { minutes: targetMinutes - nowClock.minutes, isStarting: true };
      }
    }

    if (timeTo) {
      const [hours, minutes] = timeTo.split(':').map(Number);
      const targetMinutes = hours * 60 + minutes;

      if (nowClock.minutes < targetMinutes) {
        return { minutes: targetMinutes - nowClock.minutes, isStarting: false };
      }
    }
  }

  return null;
};

