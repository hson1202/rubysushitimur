import express from "express"
import authMiddleware, { verifyAdmin } from "../middleware/auth.js"
import {
  getRestaurantInfo,
  updateRestaurantInfo,
  resetToDefaults,
  uploadLogo
} from "../controllers/restaurantInfoController.js"
import { upload } from "../middleware/r2Upload.js"

const router = express.Router()

const handleMulterError = (error, req, res, next) => {
  if (!error) return next()

  if (error.name === "MulterError") {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB."
      })
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    })
  }

  return res.status(400).json({
    success: false,
    message: error.message || "Upload failed"
  })
}

// Public: Get restaurant information
router.get("/", getRestaurantInfo)

// Admin: Upload logo image → returns URL
router.post(
  "/upload-logo",
  authMiddleware,
  verifyAdmin,
  (req, res, next) => {
    upload.single("logo")(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next)
      next()
    })
  },
  uploadLogo
)

// Admin: Update + reset
router.put("/", authMiddleware, verifyAdmin, updateRestaurantInfo)
router.post("/reset", authMiddleware, verifyAdmin, resetToDefaults)

export default router

