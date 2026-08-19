import multer from "multer"
import sharp from "sharp"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { randomBytes } from "crypto"
import r2, { isR2Configured } from "../config/r2.js"

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]

const BUCKET = process.env.R2_BUCKET_NAME
const PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, "")
const R2_PREFIX = (process.env.R2_PREFIX || "rubysushi")
  .replace(/^\/+|\/+$/g, "")
  .replace(/\/+/g, "/")

class R2Storage {
  async _handleFile(req, file, cb) {
    try {
      if (!isR2Configured || !r2 || !BUCKET || !PUBLIC_URL) {
        return cb(
          new Error(
            "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL."
          )
        )
      }

      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new Error(
            `Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, and SVG images are allowed.`
          )
        )
      }

      const isSvg = file.mimetype === "image/svg+xml"
      const ext = isSvg ? "svg" : "webp"
      const key = `${R2_PREFIX}/image-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`

      const chunks = []
      for await (const chunk of file.stream) {
        chunks.push(chunk)
      }
      const rawBuffer = Buffer.concat(chunks)

      let uploadBuffer
      let contentType

      if (isSvg) {
        uploadBuffer = rawBuffer
        contentType = "image/svg+xml"
      } else {
        uploadBuffer = await sharp(rawBuffer)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer()
        contentType = "image/webp"
      }

      await r2.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: uploadBuffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        })
      )

      const publicUrl = `${PUBLIC_URL}/${key}`

      cb(null, {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: contentType,
        size: uploadBuffer.length,
        key,
        path: publicUrl,
        filename: key,
      })
    } catch (err) {
      cb(err)
    }
  }

  _removeFile(req, file, cb) {
    cb(null)
  }
}

export const upload = multer({
  storage: new R2Storage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})
