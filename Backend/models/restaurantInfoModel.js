import mongoose from "mongoose"

const restaurantInfoSchema = new mongoose.Schema(
  {
    // Basic Information
    restaurantName: {
      type: String,
      default: ""
    },

    // Branding
    logoUrl: {
      type: String,
      default: ""
    },
    faviconUrl: {
      type: String,
      default: ""
    },
    tagline: {
      type: String,
      default: ""
    },
    foundingYear: {
      type: String,
      default: ""
    },

    // Hero Section
    heroHeadline: {
      type: String,
      default: ""
    },
    heroSubtext: {
      type: String,
      default: ""
    },

    // Contact Information
    phone: {
      type: String,
      default: ""
    },
    email: {
      type: String,
      default: ""
    },

    // Admin emails that receive new-order / contact / reservation alerts
    notificationEmails: {
      type: [String],
      default: []
    },

    // Address
    address: {
      type: String,
      default: ""
    },

    // Opening Hours (legacy display text, auto-generated from weeklyHours)
    openingHours: {
      weekdays: {
        type: String,
        default: ""
      },
      sunday: {
        type: String,
        default: ""
      }
    },

    // Per-day schedule: index 0=Sunday … 6=Saturday
    weeklyHours: [{
      isClosed: { type: Boolean, default: false },
      openTime: { type: String, default: "11:00" },
      closeTime: { type: String, default: "20:00" }
    }],

    // Social Media Links
    socialMedia: {
      facebook: {
        type: String,
        default: ""
      },
      twitter: {
        type: String,
        default: ""
      },
      linkedin: {
        type: String,
        default: ""
      },
      instagram: {
        type: String,
        default: ""
      }
    },

    // Google Maps
    googleMapsUrl: {
      type: String,
      default: ""
    },

    // Multilingual support
    translations: {
      vi: {
        restaurantName: { type: String, default: "" },
        address: { type: String, default: "" },
        tagline: { type: String, default: "" },
        heroHeadline: { type: String, default: "" },
        heroSubtext: { type: String, default: "" },
        openingHours: {
          weekdays: { type: String, default: "" },
          sunday: { type: String, default: "" }
        }
      },
      en: {
        restaurantName: { type: String, default: "" },
        address: { type: String, default: "" },
        tagline: { type: String, default: "" },
        heroHeadline: { type: String, default: "" },
        heroSubtext: { type: String, default: "" },
        openingHours: {
          weekdays: { type: String, default: "" },
          sunday: { type: String, default: "" }
        }
      },
      hu: {
        restaurantName: { type: String, default: "" },
        address: { type: String, default: "" },
        tagline: { type: String, default: "" },
        heroHeadline: { type: String, default: "" },
        heroSubtext: { type: String, default: "" },
        openingHours: {
          weekdays: { type: String, default: "" },
          sunday: { type: String, default: "" }
        }
      }
    },

    // Copyright text
    copyrightText: {
      type: String,
      default: ""
    },

    // Status
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
)

// Ensure we always have at least one document; treat first as singleton.
restaurantInfoSchema.statics.getSingleton = async function getSingleton() {
  let info = await this.findOne()
  if (!info) info = await this.create({})
  return info
}

const RestaurantInfo = mongoose.model("RestaurantInfo", restaurantInfoSchema)
export default RestaurantInfo

