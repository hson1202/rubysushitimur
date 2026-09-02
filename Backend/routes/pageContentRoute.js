import express from "express"
import authMiddleware, { verifyAdmin } from "../middleware/auth.js"
import {
  getPageContent,
  updatePageContent,
  resetPageContent
} from "../controllers/pageContentController.js"

const router = express.Router()

router.get("/:slug", getPageContent)
router.put("/:slug", authMiddleware, verifyAdmin, updatePageContent)
router.post("/:slug/reset", authMiddleware, verifyAdmin, resetPageContent)

export default router
