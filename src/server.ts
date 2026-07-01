// Load environment variables
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
}

import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// Database
import connectDB from "./config/database";

// Utils
import logger from "./utils/logger";
import { fileCache } from "./utils/fileCache";

// Middleware
import errorHandler from "./middleware/errorHandler";
import requestLogger from "./middleware/requestLogger";
import { cachedStaticMiddleware } from "./middleware/cachedStatic";

// Routes
import authRoutes from "./routes/auth.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import menuRoutes from "./routes/menu.routes";
import reviewRoutes from "./routes/review.routes";
import analyticsRoutes from "./routes/analytics.routes";
import orderRoutes from "./routes/order.routes";
import qrcodeRoutes from "./routes/qrcode.routes";
import uploadRoutes from "./routes/upload.routes";
import mediaRoutes from "./routes/media.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import webhookRoutes from "./routes/webhook.routes";
import { MenuController } from "./controllers/menu.controller";
import { QRCodeService } from "./services/qrcode.service";
import { RestaurantController } from "./controllers/restaurant.controller";
import { AnalyticsController } from "./controllers/analytics.controller";
import { verifyToken } from "./middleware/auth.middleware";
import { requireActiveSubscription } from "./middleware/subscription.middleware";
import { startBillingRepairJob } from "./jobs/billingRepairJob";

const app: Express = express();

app.set("trust proxy", 1);

// ==================== SECURITY MIDDLEWARE ====================
// Helmet should not apply to static file serving
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
  }),
);
app.use(cookieParser());

// ==================== RATE LIMITING ====================
// Strict limiter for login/register attempts (prevents brute force)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "50"), // Increased from 20
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again later.",
  skip: (req: Request) => {
    // Skip rate limiting for safe GET requests (csrf, me endpoint)
    return req.method === "GET";
  },
});

// Lenient limiter for GET auth endpoints (csrf bootstrap, profile fetch)
const authGetLimiter = rateLimit({
  windowMs: 60000, // 1 minute window
  max: 100, // Allow 100 GET requests per minute (prevents abuse but allows retries)
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please wait a moment and try again.",
  skip: (req: Request) => {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  },
});

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "3000"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
  // In development or when requests originate from localhost, skip rate limiting
  skip: (req: Request) => {
    try {
      if (process.env.NODE_ENV !== "production") return true;
      const host = (req.get("host") || "").toLowerCase();
      if (host.includes("localhost")) return true;
      const ip = req.ip || "";
      if (ip === "::1" || ip === "127.0.0.1") return true;
      // Always skip auth routes handling separately via authLimiter
      if (req.path.startsWith("/auth/")) return true;
      return false;
    } catch (e) {
      return false;
    }
  },
});

app.use("/api/", limiter);
app.use("/api/auth", authLimiter);
app.use("/api/auth", authGetLimiter); // Lenient limiter for GET requests

// ==================== WEBHOOK ROUTES ====================
// Register BEFORE JSON/urlencoded body parsers so signature verification receives raw payloads.
app.use("/api/webhooks", webhookRoutes);

// ==================== BODY PARSING ====================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ==================== REQUEST LOGGING ====================
app.use(requestLogger);

// ==================== STATIC FILES ====================
// Serve uploaded files with caching for 3D models
const uploadsDir = path.join(__dirname, "../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info(`Created uploads directory: ${uploadsDir}`);
}

// CORS preflight
app.use("/uploads", (req, res, next) => {
  // Echo the incoming origin when present; avoid wildcard with credentials mismatch
  const origin = req.get("origin") || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.status(200).end();
  } else {
    // Remove credential header to prevent invalid wildcard + credentials combo
    try {
      res.removeHeader("Access-Control-Allow-Credentials");
    } catch {
      // ignore
    }
    next();
  }
});

// Cached middleware for 3D models (.glb files)
app.use("/uploads", cachedStaticMiddleware(uploadsDir, [".glb", ".gltf"]));

// Fallback to express.static for non-cached files
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res, path) => {
      // For static file responses, echo origin and avoid sending credentials header
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.set("Access-Control-Allow-Headers", "*");
      try {
        res.removeHeader("Access-Control-Allow-Credentials");
      } catch {
        // ignore
      }

      // Add cache headers based on file type
      if (path.endsWith(".glb")) {
        res.set("Cache-Control", "public, max-age=2592000, immutable");
      } else if (
        path.endsWith(".jpg") ||
        path.endsWith(".jpeg") ||
        path.endsWith(".png") ||
        path.endsWith(".webp")
      ) {
        res.set("Cache-Control", "public, max-age=604800");
      } else {
        res.set("Cache-Control", "public, max-age=86400");
      }
    },
  }),
);

// ==================== HEALTH CHECK ====================
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ==================== CACHE STATS ====================
app.get("/cache/stats", (req: Request, res: Response) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  const stats = fileCache.getStats();
  res.json({
    status: "OK",
    cache: stats,
    timestamp: new Date().toISOString(),
  });
});

// ==================== UPLOADS DIAGNOSTIC ====================
app.get("/debug/uploads-check", (req: Request, res: Response) => {
  try {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    const imagesDir = path.join(__dirname, "../uploads/images");
    const modelsDir = path.join(__dirname, "../uploads/3d-models");

    const images = fs.existsSync(imagesDir)
      ? fs.readdirSync(imagesDir).slice(0, 50)
      : [];
    const models = fs.existsSync(modelsDir)
      ? fs.readdirSync(modelsDir).slice(0, 50)
      : [];

    const imagesCount = images.length;
    const modelsCount = models.length;

    res.json({
      status: "OK",
      uploadsPath: path.join(__dirname, "../uploads"),
      imagesCount,
      modelsCount,
      sampleImages: images,
      sampleModels: models,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: "ERROR", error: String(err) });
  }
});

// ==================== API ROUTES ====================
// Auth routes
app.use("/api/auth", authRoutes);

// Subscription routes (plans are public; order/verify are protected internally)
app.use("/api/subscriptions", subscriptionRoutes);

// PUBLIC menu routes (no auth required)
app.get(
  "/api/menu/public/:restaurantId",
  (req, res, next) =>
    void MenuController.getPublicRestaurantMenu(req, res, next),
);
app.get(
  "/api/menu/search/:restaurantId",
  (req, res, next) => void MenuController.searchMenuItems(req, res, next),
);
app.get(
  "/api/menu/:id",
  (req, res, next) => void MenuController.getMenuItem(req, res, next),
);
app.get(
  "/api/menu/:id/with-reviews",
  (req, res, next) =>
    void MenuController.getMenuItemWithReviews(req, res, next),
);
app.post(
  "/api/menu/:id/view",
  (req, res, next) => void MenuController.trackMenuItemView(req, res, next),
);
app.post(
  "/api/menu/:id/ar-view",
  (req, res, next) => void MenuController.trackARView(req, res, next),
);
app.get(
  "/api/menu/categories/:restaurantId",
  (req, res, next) => void MenuController.getMenuCategories(req, res, next),
);
app.get(
  "/api/menu/restaurant/:restaurantId",
  (req, res, next) => void MenuController.getRestaurantMenu(req, res, next),
);

// PUBLIC QR code routes (no auth required)
const publicQrLimiter = rateLimit({
  windowMs: parseInt(process.env.PUBLIC_QR_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.PUBLIC_QR_RATE_LIMIT_MAX_REQUESTS || "1200"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many QR requests from this IP, please try again later.",
});

const publicScanLimiter = rateLimit({
  windowMs: parseInt(process.env.PUBLIC_SCAN_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.PUBLIC_SCAN_RATE_LIMIT_MAX_REQUESTS || "2000"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many scan events from this IP, please try again later.",
});

app.get(
  "/api/qrcode/public/:publicUrl",
  publicQrLimiter,
  async (req, res, next) => {
    try {
      const { publicUrl } = req.params;
      const qrCode = await QRCodeService.getRestaurantByPublicUrl(publicUrl);
      res.status(200).json({
        success: true,
        message: "Restaurant found",
        data: { restaurantId: qrCode.restaurantId, qrCode },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/qrcode/scan/:code",
  publicScanLimiter,
  async (req, res, next) => {
    try {
      const { code } = req.params;
      const { deviceId, sessionId } = req.body;
      const qrCode = await QRCodeService.trackQRCodeScan(
        code,
        deviceId,
        sessionId,
      );
      res.status(200).json({
        success: true,
        message: "Scan tracked",
        data: { qrCode },
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUBLIC restaurant routes (no auth required)
const publicRestaurantLimiter = rateLimit({
  windowMs: parseInt(
    process.env.PUBLIC_RESTAURANT_RATE_LIMIT_WINDOW_MS || "900000",
  ),
  max: parseInt(
    process.env.PUBLIC_RESTAURANT_RATE_LIMIT_MAX_REQUESTS || "1200",
  ),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});

app.get(
  "/api/restaurants/public/:publicUrl",
  publicRestaurantLimiter,
  (req, res, next) =>
    void RestaurantController.getPublicRestaurant(req, res, next),
);

// PUBLIC analytics route (no auth required)
const publicEventLimiter = rateLimit({
  windowMs: parseInt(process.env.PUBLIC_EVENT_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.PUBLIC_EVENT_RATE_LIMIT_MAX_REQUESTS || "5000"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many analytics events from this IP, please try again later.",
});

app.post(
  "/api/analytics/track",
  publicEventLimiter,
  (req, res, next) => void AnalyticsController.trackEvent(req, res, next),
);

// Protected premium routes — require active subscription
app.use(
  "/api/restaurants",
  verifyToken,
  requireActiveSubscription,
  restaurantRoutes,
);
// PROTECTED menu routes only (create, update, delete)
app.post(
  "/api/menu",
  verifyToken,
  requireActiveSubscription,
  (req, res, next) => void MenuController.createMenuItem(req, res, next),
);
app.put(
  "/api/menu/:id",
  verifyToken,
  requireActiveSubscription,
  (req, res, next) => void MenuController.updateMenuItem(req, res, next),
);
app.delete(
  "/api/menu/:id",
  verifyToken,
  requireActiveSubscription,
  (req, res, next) => void MenuController.deleteMenuItem(req, res, next),
);
app.use(
  "/api/analytics",
  verifyToken,
  requireActiveSubscription,
  analyticsRoutes,
);
app.use("/api/qrcode", verifyToken, requireActiveSubscription, qrcodeRoutes);
app.use("/api/upload", verifyToken, requireActiveSubscription, uploadRoutes);

// Semi-public routes (auth optional or different access)
app.use("/api/reviews", reviewRoutes);
app.use("/api/orders", orderRoutes);
// Media proxy/cache routes
app.use("/api/media", mediaRoutes);

app.get("/api", (req: Request, res: Response) => {
  res.json({
    message: "AR Menu Platform API",
    version: "1.0.0",
    status: "running",
  });
});

// ==================== 404 HANDLER ====================
app.use("*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

// ==================== SERVER START ====================
const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    // Connect to MongoDB
    logger.info("═══════════════════════════════════════════════════");
    logger.info("  Initializing AR Menu Platform API Server");
    logger.info("═══════════════════════════════════════════════════");

    logger.info("Connecting to MongoDB...");
    await connectDB();
    logger.info("MongoDB connection successful");

    // Start background jobs
    // DISABLED: 3D conversion feature removed - owners now upload 3D models directly
    // startConversionScheduler();
    startBillingRepairJob();

    logger.info("Starting server on port " + PORT);
    const server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`✓ Server running on port ${PORT}`);
      logger.info(`✓ Environment: ${process.env.NODE_ENV}`);
      logger.info(`✓ API URL: ${process.env.API_URL}`);
      logger.info("═══════════════════════════════════════════════════");
      logger.info("Server is now accepting requests");
    });

    // Handle server errors
    server.on("error", err => {
      logger.error("Server error:", err);
      process.exit(1);
    });

    // Keep the process alive
    server.on("listening", () => {
      logger.info("Server event: listening confirmed");
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM signal received: closing HTTP server");
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      logger.info("SIGINT signal received: closing HTTP server");
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error("Failed to start server", { error: String(error) });
    process.exit(1);
  }
}

// Global error handlers to catch unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at promise", { reason: String(reason) });
});

process.on("uncaughtException", error => {
  logger.error("Uncaught Exception", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
void startServer();

export default app;
