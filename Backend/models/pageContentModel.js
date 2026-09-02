import mongoose from "mongoose"

const localizedPageSchema = {
  title: { type: String, default: "" },
  content: { type: String, default: "" }
}

const pageContentSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    isPublished: {
      type: Boolean,
      default: true
    },
    translations: {
      vi: localizedPageSchema,
      en: localizedPageSchema,
      hu: localizedPageSchema
    }
  },
  { timestamps: true }
)

const PageContent = mongoose.model("PageContent", pageContentSchema)
export default PageContent
