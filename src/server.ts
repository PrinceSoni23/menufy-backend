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

// Database
import connectDB from "./config/database";

// Utils
import logger from "./utils/logger";
import { fileCache } from "./utils/fileCache";

// Jobs
import { startConversionScheduler } from "./jobs/conversionScheduler";

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
import qrcodeRoutes from "./routes/qrcode.routes";
import uploadRoutes from "./routes/upload.routes";
import mediaRoutes from "./routes/media.routes";

const app: Express = express();

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

// ==================== RATE LIMITING ====================
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "20"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again later.",
});

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
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
  const origin = (req.get("origin") as string) || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.status(200).end();
  } else {
    // Remove credential header to prevent invalid wildcard + credentials combo
    try {
      res.removeHeader("Access-Control-Allow-Credentials");
    } catch (e) {
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
      } catch (e) {}

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
// Restaurant routes
app.use("/api/restaurants", restaurantRoutes);
// Menu routes
app.use("/api/menu", menuRoutes);
// Reviews routes
app.use("/api/reviews", reviewRoutes);
// Analytics routes
app.use("/api/analytics", analyticsRoutes);
// QR Code routes
app.use("/api/qrcode", qrcodeRoutes);
// Upload & Conversion routes
app.use("/api/upload", uploadRoutes);
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
