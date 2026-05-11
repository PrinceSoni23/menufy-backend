import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import logger from "./logger";
import { fileCache } from "./fileCache";

// Create uploads directories if they don't exist
const imagesDir = path.join(__dirname, "../../uploads/images");
const modelsDir = path.join(__dirname, "../../uploads/3d-models");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Configure multer storage for images and 3D models
const storageImage = multer.diskStorage({
  destination: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => {
    cb(null, imagesDir);
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const storageModel = multer.diskStorage({
  destination: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => {
    cb(null, modelsDir);
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter - only allow images
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, png, webp, gif)"));
  }
};

// File filter for 3D models
const fileFilter3D = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowedMimes = [
    "model/gltf-binary",
    "model/gltf+json",
    "model/obj",
    "application/octet-stream", // Sometimes .glb comes as this
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only 3D model files are allowed (.glb, .gltf, .obj)"));
  }
};

// Create multer instance
export const upload = multer({
  storage: storageImage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Create multer instance for 3D models
export const upload3D = multer({
  storage: storageModel,
  fileFilter: fileFilter3D,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for 3D models
  },
});

const isLocalhostBaseUrl = (baseUrl: string): boolean =>
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|::1)(:\d+)?(\/|$)/i.test(baseUrl);

/**
 * Resolve the public base URL for uploaded files
 * Ensures images/3D models are accessible from ANY device/browser/location
 *
 * Priority:
 * 1. PUBLIC_API_URL env var (explicit override - set this to fix)
 * 2. API_URL env var (if not localhost)
 * 3. RENDER_EXTERNAL_URL (Render.com)
 * 4. X-Forwarded-* headers (proxies, load balancers)
 * 5. Request origin (current hostname)
 * 6. Fallback http://localhost:5000
 *
 * Set in .env:
 *   # Production domain
 *   PUBLIC_API_URL=https://yourdomain.com
 *
 *   # Local network access
 *   PUBLIC_API_URL=http://192.168.1.100:5000
 */
export function resolvePublicBaseUrl(req?: Request): string {
  // 1. Explicit PUBLIC_API_URL override (highest priority)
  const publicOverride = (process.env.PUBLIC_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (publicOverride) {
    logger.debug(`[URL Resolution] Using PUBLIC_API_URL: ${publicOverride}`);
    return publicOverride;
  }

  // 2. Check API_URL (if not localhost)
  const configuredBaseUrl = (
    process.env.API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (configuredBaseUrl && !isLocalhostBaseUrl(configuredBaseUrl)) {
    logger.debug(`[URL Resolution] Using API_URL: ${configuredBaseUrl}`);
    return configuredBaseUrl;
  }

  // 3. Use request headers (proxies, load balancers)
  if (req) {
    const forwardedProto = (
      req.headers["x-forwarded-proto"] as string | undefined
    )
      ?.split(",")[0]
      ?.trim();
    const forwardedHost = (
      req.headers["x-forwarded-host"] as string | undefined
    )
      ?.split(",")[0]
      ?.trim();

    if (forwardedHost) {
      const protocol = forwardedProto || "https";
      const url = `${protocol}://${forwardedHost}`.replace(/\/$/, "");
      logger.debug(`[URL Resolution] Using X-Forwarded: ${url}`);
      return url;
    }

    const protocol = req.protocol || "http";
    const host = req.get("host");

    if (host) {
      const url = `${protocol}://${host}`.replace(/\/$/, "");
      logger.debug(`[URL Resolution] Using request origin: ${url}`);
      return url;
    }
  }

  // 4. Fallback
  const fallback = configuredBaseUrl || "http://localhost:5000";
  logger.debug(`[URL Resolution] Using fallback: ${fallback}`);
  return fallback;
}

/**
 * Upload image file
 */
export function uploadImage(file: Express.Multer.File): {
  filename: string;
  path: string;
  size: number;
} {
  if (!file) {
    throw new Error("No file uploaded");
  }

  logger.info(`Image uploaded: ${file.filename} (${file.size} bytes)`);

  return {
    filename: file.filename,
    path: file.path,
    size: file.size,
  };
}

/**
 * Delete uploaded image
 */
export function deleteImage(filename: string): boolean {
  try {
    const filePath = path.join(imagesDir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      // Invalidate cache for this file
      fileCache.invalidate(filePath);
      logger.info(`Image deleted: ${filename}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Failed to delete image: ${filename} - ${error}`);
    return false;
  }
}

export function deleteModel(filename: string): boolean {
  try {
    const filePath = path.join(modelsDir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      fileCache.invalidate(filePath);
      logger.info(`Model deleted: ${filename}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Failed to delete model: ${filename} - ${error}`);
    return false;
  }
}

/**
 * Get image URL
 */
export function getImageUrl(filename: string): string {
  const baseUrl = resolvePublicBaseUrl();
  return `${baseUrl}/uploads/images/${filename}`;
}

export function getModelUrl(filename: string): string {
  const baseUrl = resolvePublicBaseUrl();
  return `${baseUrl}/uploads/3d-models/${filename}`;
}

/**
 * Check if image exists
 */
export function imageExists(filename: string): boolean {
  const filePath = path.join(imagesDir, filename);
  return fs.existsSync(filePath);
}
