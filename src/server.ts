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
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api/", limiter);

// ==================== COMPRESSION ====================
// Enable GZIP compression for faster file transfer (60-70% size reduction)
import compression from "compression";
app.use(compression({
  level: 6, // Balance between CPU and compression (1-9, default 6)
  threshold: 1024, // Only compress files > 1KB
  filter: (req: Request, res: Response) => {
    // Compress 3D models and images in transit
    // Browser automatically decompresses
    const contentType = res.get('content-type') || '';
    if (/(glb|gltf|json|javascript|text)/.test(contentType)) {
      return true;
    }
    return compression.filter(req, res);
  }
}));

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

// Caching and compression middleware for uploads
app.use("/uploads", (req: Request, res: Response, next) => {
  // Set HTTP caching headers to improve repeat load performance
  const filePath = req.path.toLowerCase();
  
  if (filePath.endsWith('.glb') || filePath.endsWith('.gltf')) {
    // 3D models: cache for 30 days (immutable - they don't change)
    // First load: ~500ms-3s, Repeat load: <50ms (browser cache)
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.set('ETag', Buffer.from(filePath).toString('base64').substring(0, 27)); // 27 char ETags
  } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(filePath)) {
    // Images: cache for 7 days
    res.set('Cache-Control', 'public, max-age=604800');
  }
  
  // CORS preflight
  const origin = (req.get("origin") as string) || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.status(200).end();
  } else {
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

    await connectDB();

    // Start background jobs
    // DISABLED: 3D conversion feature removed - owners now upload 3D models directly
    // startConversionScheduler();

    const server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`✓ Server running on port ${PORT}`);
      logger.info(`✓ Environment: ${process.env.NODE_ENV}`);
      logger.info(`✓ API URL: ${process.env.API_URL}`);
      logger.info("═══════════════════════════════════════════════════");
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
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

startServer();

export default app;
