// server.js
import express from "express"
import cors from "cors"
import mongoose from "mongoose"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import mongoSanitize from "express-mongo-sanitize"
import hpp from "hpp"
import "dotenv/config"
import { connectDB } from "./config/db.js"
import foodRouter from "./routes/foodRoute.js"
import userRouter from "./routes/userRoute.js"
import cartRouter from "./routes/cartRoute.js"
import orderRouter from "./routes/orderRoute.js"
import adminRouter from "./routes/adminRoute.js"
import categoryRouter from "./routes/categoryRoute.js"
import blogRouter from "./routes/blogRoute.js"
import reservationRouter from "./routes/reservationRoute.js"
import contactMessageRouter from "./routes/contactMessageRoute.js"
import uploadRouter from "./routes/uploadRoute.js"
import localUploadRouter from "./routes/localUploadRoute.js"
import cloudinarySignRouter from "./routes/cloudinarySignRoute.js"
import emailTestRouter from "./routes/emailTestRoute.js"
import deliveryRouter from "./routes/deliveryRoute.js"
import restaurantInfoRouter from "./routes/restaurantInfoRoutes.js"
import errorLogRouter from "./routes/errorLogRoute.js"
import allergenRouter from "./routes/allergenRoute.js"
import eventBus from "./services/eventBus.js"
import authMiddleware, { verifyAdmin } from "./middleware/auth.js"
import { sanitizeRequest, errorHandler } from "./middleware/security.js"
import { errorHandlerWithLogging } from "./middleware/errorLogging.js"

const app = express()

// Render (and other reverse proxies) set X-Forwarded-For.
// Required so express-rate-limit can identify clients correctly.
app.set("trust proxy", 1)

// --- HTTP security headers ---
app.use(helmet())

// --- CORS: FE chính + FE phụ + Admin đều gọi được 1 BE ---
// origin: true = echo Origin của request, không 500, không khóa FE khi thêm env.
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
)

// --- Body parsing with size limits ---
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// --- Security Middleware ---
// Prevent NoSQL injection by sanitizing user input
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️ Potential NoSQL injection attempt detected in ${key}`);
  }
}))

// Prevent HTTP Parameter Pollution
app.use(hpp())

// Sanitize all user inputs for XSS protection
app.use(sanitizeRequest)

// --- Rate limiting cho các route nhạy cảm ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // tối đa 100 request / 15 phút / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many login attempts, please try again later." }
})

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 60, // tối đa 60 request write / phút / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please slow down." }
})

// Áp dụng rate limit cho login & các hành động ghi dữ liệu
app.use("/api/user/login", authLimiter)
app.use("/api/admin/login", authLimiter)
app.use("/api/order", writeLimiter)
app.use("/api/contact", writeLimiter)

const ensureDbConnection = async () => {
  if (mongoose.connection.readyState === 1) {
    return
  }
  const ok = await connectDB()
  if (!ok) {
    throw new Error("Database connection failed")
  }
}

const skipDbRetryPaths = new Set(["/", "/health"])

app.use(async (req, res, next) => {
  if (skipDbRetryPaths.has(req.path)) {
    return next()
  }
  try {
    await ensureDbConnection()
    next()
  } catch (error) {
    console.error("Database middleware error:", error.message)
    return res.status(503).json({
      success: false,
      error: "Database unavailable",
      message: error.message
    })
  }
})

// Debug middleware to track all requests - chỉ bật khi không phải production
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`=== REQUEST DEBUG ===`)
    console.log(`${req.method} ${req.path}`)
    console.log(`Original URL: ${req.originalUrl}`)
    next()
  })
}

// API Routes
app.use("/api/food", foodRouter)
app.use("/api/user", userRouter)
app.use("/api/cart", cartRouter)
app.use("/api/order", orderRouter)
app.use("/api/admin", adminRouter)
app.use("/api/category", categoryRouter)
app.use("/api/blog", blogRouter)
app.use("/api/reservation", reservationRouter)
app.use("/api/contact", contactMessageRouter)
app.use("/api/email", emailTestRouter)
app.use("/api/upload", localUploadRouter)
app.use("/api/upload-cloud", uploadRouter)  // Keep Cloudinary as backup
app.use("/api/cloudinary", cloudinarySignRouter)
app.use("/api/delivery", deliveryRouter)
app.use("/api/restaurant-info", restaurantInfoRouter)
app.use("/api/error-logs", errorLogRouter)
app.use("/api/allergen", allergenRouter)

// --- Server-Sent Events (SSE) for realtime notifications ---
const sseClients = []

// Bảo vệ SSE: chỉ cho phép admin authenticated
app.get('/api/events', authMiddleware, verifyAdmin, (req, res) => {
  // Optional channel filter
  const channel = req.query.channel || 'all'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const client = { res, channel }
  sseClients.push(client)

  // Initial hello
  res.write(`event: connected\n`)
  res.write(`data: ${JSON.stringify({ success: true, channel })}\n\n`)

  // Heartbeat to keep connection alive (Render/Proxies can drop idle)
  const heartbeat = setInterval(() => {
    try { res.write(`event: ping\n` + `data: ${Date.now()}\n\n`) } catch { }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    const idx = sseClients.indexOf(client)
    if (idx !== -1) sseClients.splice(idx, 1)
  })
})

// Broadcast helper
const broadcastEvent = (type, payload, channel = 'orders') => {
  const data = `event: message\n` + `data: ${JSON.stringify({ type, payload })}\n\n`
  sseClients.forEach(c => {
    if (c.channel === 'all' || c.channel === channel) {
      try { c.res.write(data) } catch { }
    }
  })
}

// Listen to internal app events
eventBus.on('order:created', (order) => {
  // Include items and address so admin can render without needing a refresh
  broadcastEvent('order_created', {
    _id: order._id,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt,
    trackingCode: order.trackingCode,
    customerInfo: order.customerInfo,
    orderType: order.orderType,
    fulfillmentType: order.fulfillmentType,
    items: order.items || [],
    address: order.address || null,
    userId: order.userId || null
  }, 'orders')
})

eventBus.on('contact:created', (contactMessage) => {
  // Broadcast to admin panel for realtime notification
  broadcastEvent('contact_created', {
    _id: contactMessage._id,
    messageNumber: contactMessage.messageNumber,
    name: contactMessage.name,
    email: contactMessage.email,
    subject: contactMessage.subject,
    message: contactMessage.message,
    priority: contactMessage.priority,
    status: contactMessage.status,
    createdAt: contactMessage.createdAt
  }, 'messages')

  console.log(`🔔 Realtime notification broadcasted for contact message #${contactMessage.messageNumber} from ${contactMessage.name}`)
})

// Serve local uploads (Render has persistent filesystem, unlike Vercel)
app.use("/uploads", express.static("uploads"))
app.use("/images", express.static("uploads"))
// Serve notification sounds
app.use("/sound", express.static("sound"))

// Health check endpoints
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Food Delivery API is Working!",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development"
  })
})

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "🍕 Food Delivery API v1.0",
    endpoints: [
      "/api/food",
      "/api/user",
      "/api/cart",
      "/api/order",
      "/api/admin",
      "/api/category",
      "/api/blog",
      "/api/reservation",
      "/api/contact",
      "/api/delivery",
      "/api/restaurant-info"
    ]
  })
})

app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    res.json({
      success: true,
      status: "healthy",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message
    })
  }
})

app.get("/test-food", async (req, res) => {
  try {
    const foodModel = (await import("./models/foodModel.js")).default
    const foods = await foodModel.find().limit(5)
    res.json({
      success: true,
      message: "Direct DB query test",
      count: foods.length,
      data: foods
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "DB query failed",
      message: error.message
    })
  }
})

// Các route debug chỉ bật khi không phải production
if (process.env.NODE_ENV !== "production") {
  app.get("/debug", async (req, res) => {
    try {
      // Test actual database connectivity instead of connection state
      let dbStatus = "disconnected"
      let foodCount = 0
      let testQuery = "failed"

      try {
        const foodModel = (await import("./models/foodModel.js")).default
        foodCount = await foodModel.countDocuments()
        testQuery = "success"
        dbStatus = "connected" // If query works, DB is connected
      } catch (dbError) {
        testQuery = dbError.message
        dbStatus = "error"
      }

      res.json({
        success: true,
        database: dbStatus,
        foodCount: foodCount,
        testQuery: testQuery,
        environment: process.env.NODE_ENV,
        mongoUrl: process.env.MONGODB_URL ? "configured" : "missing",
        nodeVersion: process.version,
        platform: process.platform,
        mongooseState: mongoose.connection.readyState
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })

  app.get("/debug-cloudinary", async (req, res) => {
    try {
      const cloudinary = (await import("./config/cloudinary.js")).default

      // Test cloudinary config
      const config = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET ? "***configured***" : "missing"
      }

      // Test API call
      const result = await cloudinary.api.ping()

      res.json({
        success: true,
        message: "Cloudinary connection working",
        config: config,
        ping: result
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        config: {
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "missing",
          api_key: process.env.CLOUDINARY_API_KEY ? "***configured***" : "missing",
          api_secret: process.env.CLOUDINARY_API_SECRET ? "***configured***" : "missing"
        }
      })
    }
  })

  app.get("/debug-email", async (req, res) => {
    try {
      const { createTransporter } = await import("./services/emailService.js")
      const transporter = createTransporter()
      const config = {
        hasUser: !!process.env.EMAIL_USER,
        hasPass: !!(process.env.EMAIL_PASSWORD || process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS),
        service: process.env.EMAIL_SERVICE || null,
        host: process.env.EMAIL_HOST || null,
        port: process.env.EMAIL_PORT || null,
        secure: process.env.EMAIL_SECURE || null
      }
      if (!transporter) {
        return res.status(200).json({ success: false, configured: false, config })
      }
      try {
        const verified = await transporter.verify()
        res.json({ success: true, configured: true, verified, config })
      } catch (verifyErr) {
        res.json({ success: false, configured: true, verified: false, error: verifyErr.message, config })
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  app.post("/test-upload", async (req, res) => {
    try {
      const { upload } = await import("./middleware/upload.js")
      const uploadSingle = upload.single("image")

      uploadSingle(req, res, (err) => {
        if (err) {
          console.error("=== UPLOAD ERROR ===", err)
          return res.status(500).json({
            success: false,
            error: "Upload failed: " + err.message,
            details: err
          })
        }

        console.log("=== UPLOAD TEST DEBUG ===")
        console.log("File received:", req.file ? "YES" : "NO")
        console.log("File details:", req.file)

        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: "No file uploaded"
          })
        }

        res.json({
          success: true,
          message: "Upload successful",
          file: {
            url: req.file.path,
            public_id: req.file.filename,
            size: req.file.size,
            originalname: req.file.originalname
          }
        })
      })
    } catch (error) {
      console.error("Test upload error:", error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
}

// 404 handler - phải để cuối cùng
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
    message: "Endpoint không tồn tại",
    availableRoutes: [
      "/api/food",
      "/api/user",
      "/api/cart",
      "/api/order",
      "/api/admin",
      "/api/category",
      "/api/restaurant-info"
    ]
  })
})

// Error handling middleware - Must be after all routes (automatically logs to database)
app.use(errorHandlerWithLogging)

// Server startup
const port = process.env.PORT || 4000

// Start server for both development and production (Render needs this)
if (process.env.VERCEL !== "1") {
  const startServer = async () => {
    try {
      await ensureDbConnection()
    } catch (error) {
      console.error("Initial database connection failed:", error.message)
      if (process.env.NODE_ENV !== "production") {
        process.exit(1)
      }
    }

    app.listen(port, async () => {
    console.log(`🚀 Server running on port ${port}`)
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`)

    // Email service health check on startup (non-blocking)
    console.log('\n📧 Checking email service configuration...')
    try {
      const { testEmailService } = await import("./services/emailService.js")
      const emailStatus = await testEmailService()

      if (emailStatus.success) {
        console.log('✅ Email service is configured and working!')
        console.log(`   From: ${emailStatus.from}`)
        console.log(`   Admin: ${emailStatus.adminEmail}`)
        console.log('   Orders and notifications will be sent via email.')
      } else if (!emailStatus.configured) {
        console.warn('⚠️ Email service NOT configured!')
        console.warn('   Order/reservation/contact emails will NOT be sent.')
        console.warn('   To fix:')
        console.warn('   1. Set EMAIL_USER in environment variables')
        console.warn('   2. Set EMAIL_PASSWORD (or EMAIL_APP_PASSWORD) in environment variables')
        console.warn('   3. Set ADMIN_EMAIL to receive admin notifications')
        console.warn('   4. Restart server')
        console.warn('   Visit /api/email/status for detailed configuration status.')
      } else {
        console.error('❌ Email service configured but verification FAILED!')
        console.error(`   Error: ${emailStatus.message}`)
        console.error('   Please check your email credentials.')
        console.error('   Visit /api/email/status for detailed configuration status.')
      }
    } catch (error) {
      console.error('❌ Error checking email service:', error.message)
    }
    console.log('') // Empty line for readability
  })
  }
  startServer()
}

// Export for Vercel serverless function
export default app