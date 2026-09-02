import PageContent from "../models/pageContentModel.js"
import {
  DELIVERY_INFO_SLUG,
  getDefaultDeliveryInfoTranslations
} from "../utils/deliveryInfoDefault.js"

const ALLOWED_LANGS = ["vi", "en", "hu"]

const emptyTranslation = () => ({ title: "", content: "" })

const normalizeTranslations = (translations = {}) => {
  const next = {}
  for (const lang of ALLOWED_LANGS) {
    const src = translations?.[lang] || {}
    next[lang] = {
      title: typeof src.title === "string" ? src.title : "",
      content: typeof src.content === "string" ? src.content : ""
    }
  }
  return next
}

const seedDefaults = async (slug) => {
  const defaults = slug === DELIVERY_INFO_SLUG
    ? getDefaultDeliveryInfoTranslations()
    : { vi: emptyTranslation(), en: emptyTranslation(), hu: emptyTranslation() }

  return PageContent.create({
    slug,
    isPublished: true,
    translations: defaults
  })
}

const getOrCreateBySlug = async (slug) => {
  let page = await PageContent.findOne({ slug })
  if (!page) {
    page = await seedDefaults(slug)
  }
  return page
}

export const getPageContent = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase()
    if (!slug) {
      return res.status(400).json({ success: false, message: "Missing page slug" })
    }

    const page = await getOrCreateBySlug(slug)
    return res.json({ success: true, data: page })
  } catch (error) {
    console.error("Error fetching page content:", error)
    return res.status(500).json({
      success: false,
      message: "Không thể lấy nội dung trang"
    })
  }
}

export const updatePageContent = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase()
    if (!slug) {
      return res.status(400).json({ success: false, message: "Missing page slug" })
    }

    const { translations, isPublished } = req.body || {}
    const page = await getOrCreateBySlug(slug)

    if (translations !== undefined) {
      page.translations = normalizeTranslations(translations)
    }
    if (isPublished !== undefined) {
      page.isPublished = Boolean(isPublished)
    }

    await page.save()
    return res.json({
      success: true,
      message: "Cập nhật nội dung thành công",
      data: page
    })
  } catch (error) {
    console.error("Error updating page content:", error)
    return res.status(500).json({
      success: false,
      message: error?.message || "Không thể cập nhật nội dung trang"
    })
  }
}

export const resetPageContent = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase()
    if (!slug) {
      return res.status(400).json({ success: false, message: "Missing page slug" })
    }

    const page = await getOrCreateBySlug(slug)
    page.translations = slug === DELIVERY_INFO_SLUG
      ? getDefaultDeliveryInfoTranslations()
      : { vi: emptyTranslation(), en: emptyTranslation(), hu: emptyTranslation() }
    page.isPublished = true
    await page.save()

    return res.json({
      success: true,
      message: "Đã khôi phục nội dung mặc định",
      data: page
    })
  } catch (error) {
    console.error("Error resetting page content:", error)
    return res.status(500).json({
      success: false,
      message: "Không thể khôi phục nội dung mặc định"
    })
  }
}
