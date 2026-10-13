import jwt from "jsonwebtoken"
import RestaurantInfo from "../models/restaurantInfoModel.js"
import {
  normalizeWeeklyHours,
  getDefaultWeeklyHours,
  validateWeeklyHours,
  formatOpeningHoursLegacy
} from "../utils/restaurantHours.js"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

const normalizeNotificationEmails = (emails) => {
  if (emails === undefined) return null
  const list = Array.isArray(emails)
    ? emails
    : String(emails ?? "").split(/[,;\s]+/)
  const cleaned = [...new Set(
    list
      .map((e) => String(e).trim().toLowerCase())
      .filter(Boolean)
  )]
  const invalid = cleaned.filter((e) => !EMAIL_RE.test(e))
  if (invalid.length) {
    return { error: `Email không hợp lệ: ${invalid.join(", ")}` }
  }
  return { emails: cleaned }
}

const ensureWeeklyHours = async (info) => {
  const normalized = normalizeWeeklyHours(info.weeklyHours)
  const needsWeeklySave = !Array.isArray(info.weeklyHours) || info.weeklyHours.length !== 7
  info.weeklyHours = normalized
  const legacy = formatOpeningHoursLegacy(normalized, 'vi')
  const hoursOutOfDate = info.openingHours?.weekdays !== legacy.weekdays
    || info.openingHours?.sunday !== legacy.sunday
  if (hoursOutOfDate) {
    info.openingHours = { weekdays: legacy.weekdays, sunday: legacy.sunday }
  }
  if (needsWeeklySave || hoursOutOfDate) {
    await info.save()
  }
  return info
}

// Get restaurant information (public; notificationEmails only for admin)
const getRestaurantInfo = async (req, res) => {
  try {
    const info = await RestaurantInfo.getSingleton()
    await ensureWeeklyHours(info)
    const data = info.toObject()

    // Hide staff notification list from public website consumers
    const token = req.headers.token
    let isAdmin = false
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        isAdmin = decoded?.role === "admin"
      } catch {
        isAdmin = false
      }
    }
    if (!isAdmin) {
      delete data.notificationEmails
    }

    return res.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching restaurant info:", error)
    return res.status(500).json({
      success: false,
      message: "Không thể lấy thông tin nhà hàng"
    })
  }
}

// Update restaurant information (admin only)
const updateRestaurantInfo = async (req, res) => {
  try {
    const {
      restaurantName,
      logoUrl,
      faviconUrl,
      tagline,
      heroHeadline,
      heroSubtext,
      foundingYear,
      phone,
      email,
      notificationEmails,
      address,
      openingHours,
      weeklyHours,
      socialMedia,
      googleMapsUrl,
      copyrightText,
      translations,
      isActive,
      deliveryEnabled
    } = req.body || {}

    const updates = {}
    if (restaurantName !== undefined) updates.restaurantName = restaurantName
    if (logoUrl !== undefined) updates.logoUrl = logoUrl
    if (faviconUrl !== undefined) updates.faviconUrl = faviconUrl
    if (tagline !== undefined) updates.tagline = tagline
    if (heroHeadline !== undefined) updates.heroHeadline = heroHeadline
    if (heroSubtext !== undefined) updates.heroSubtext = heroSubtext
    if (foundingYear !== undefined) updates.foundingYear = foundingYear
    if (phone !== undefined) updates.phone = phone
    if (email !== undefined) updates.email = email
    if (notificationEmails !== undefined) {
      const normalized = normalizeNotificationEmails(notificationEmails)
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error })
      }
      updates.notificationEmails = normalized.emails
    }
    if (address !== undefined) updates.address = address
    if (socialMedia !== undefined) updates.socialMedia = socialMedia
    if (googleMapsUrl !== undefined) updates.googleMapsUrl = googleMapsUrl
    if (copyrightText !== undefined) updates.copyrightText = copyrightText
    if (translations !== undefined) updates.translations = translations
    if (isActive !== undefined) updates.isActive = isActive
    if (deliveryEnabled !== undefined) updates.deliveryEnabled = Boolean(deliveryEnabled)

    if (weeklyHours !== undefined) {
      const validation = validateWeeklyHours(weeklyHours)
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message })
      }
      const normalized = normalizeWeeklyHours(weeklyHours)
      updates.weeklyHours = normalized
      const legacy = formatOpeningHoursLegacy(normalized, 'vi')
      updates.openingHours = { weekdays: legacy.weekdays, sunday: legacy.sunday }
    } else if (openingHours !== undefined) {
      updates.openingHours = openingHours
    }

    const info = await RestaurantInfo.getSingleton()
    Object.assign(info, updates)
    await info.save()

    return res.json({
      success: true,
      message: "Cập nhật thông tin nhà hàng thành công",
      data: info
    })
  } catch (error) {
    console.error("Error updating restaurant info:", error)
    return res.status(500).json({
      success: false,
      message: error?.message || "Không thể cập nhật thông tin nhà hàng"
    })
  }
}

// Reset to defaults (admin only)
const resetToDefaults = async (req, res) => {
  try {
    const info = await RestaurantInfo.getSingleton()
    const defaultHours = getDefaultWeeklyHours()
    const legacy = formatOpeningHoursLegacy(defaultHours, 'vi')

    info.restaurantName = ""
    info.logoUrl = ""
    info.faviconUrl = ""
    info.tagline = ""
    info.heroHeadline = ""
    info.heroSubtext = ""
    info.foundingYear = ""
    info.phone = ""
    info.email = ""
    info.notificationEmails = []
    info.address = ""
    info.openingHours = { weekdays: legacy.weekdays, sunday: legacy.sunday }
    info.weeklyHours = defaultHours
    info.socialMedia = { facebook: "", twitter: "", linkedin: "", instagram: "" }
    info.googleMapsUrl = ""
    info.translations = {
      vi: {
        restaurantName: "", address: "", tagline: "", heroHeadline: "", heroSubtext: "",
        openingHours: { weekdays: "", sunday: "" }
      },
      en: {
        restaurantName: "", address: "", tagline: "", heroHeadline: "", heroSubtext: "",
        openingHours: { weekdays: "", sunday: "" }
      },
      hu: {
        restaurantName: "", address: "", tagline: "", heroHeadline: "", heroSubtext: "",
        openingHours: { weekdays: "", sunday: "" }
      }
    }
    info.copyrightText = ""
    info.isActive = true
    info.deliveryEnabled = true

    await info.save()

    return res.json({
      success: true,
      message: "Đã reset về giá trị mặc định",
      data: info
    })
  } catch (error) {
    console.error("Error resetting restaurant info:", error)
    return res.status(500).json({
      success: false,
      message: "Không thể reset thông tin nhà hàng"
    })
  }
}

// Upload logo image (admin only) — saves URL to DB and returns it
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" })
    }
    const url = req.file.path || req.file.secure_url || req.file.url
    if (!url) {
      return res.status(500).json({ success: false, message: "Upload succeeded but no file URL was returned" })
    }
    const info = await RestaurantInfo.getSingleton()
    info.logoUrl = url
    await info.save()
    return res.json({ success: true, url, data: info })
  } catch (error) {
    console.error("Error uploading logo:", error)
    return res.status(500).json({
      success: false,
      message: error?.message || "Upload failed"
    })
  }
}

export { getRestaurantInfo, updateRestaurantInfo, resetToDefaults, uploadLogo }
