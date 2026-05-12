import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import logger from "./logger";
import { fileCache } from "./fileCache";
import { v2 as cloudinary } from "cloudinary";

// Local uploads dirs are still created for backwards-compatibility (tests, optional local storage)
const imagesDir = path.join(__dirname, "../../uploads/images");
const modelsDir = path.join(__dirname, "../../uploads/3d-models");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Configure Cloudinary if credentials provided
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  try {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
    logger.info("Cloudinary configured for uploads");
  } catch (err) {
    logger.warn("Failed to configure Cloudinary:", err);
  }
}

// Use memoryStorage so files can be streamed to Cloudinary directly
const memoryStorage = multer.memoryStorage();

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
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Create multer instance for 3D models
export const upload3D = multer({
  storage: memoryStorage,
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

  //second check

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
export async function uploadImage(file: Express.Multer.File): Promise<{
  filename: string;
  path: string;
  size: number;
}> {
  if (!file) {
    throw new Error("No file uploaded");
  }

  // If Cloudinary configured, upload buffer as data URI
  if (cloudinary.config().cloud_name) {
    const folder = process.env.CLOUDINARY_FOLDER_IMAGES || "menufy/images";
    const publicId = `${folder}/${uuidv4()}`;
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
      folder,
    });

    logger.info(`Cloudinary image uploaded: ${result.public_id}`);
    return {
      filename: result.public_id,
      path: result.secure_url,
      size: file.size,
    };
  }

  // Fallback: write to disk (backwards compatibility)
  const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
  const dest = path.join(imagesDir, uniqueName);
  fs.writeFileSync(dest, file.buffer);
  logger.info(`Image written to disk fallback: ${dest}`);
  return {
    filename: uniqueName,
    path: dest,
    size: file.size,
  };
}

export async function uploadModel(file: Express.Multer.File): Promise<{
  filename: string;
  path: string;
  size: number;
}> {
  if (!file) throw new Error("No file uploaded");

  if (cloudinary.config().cloud_name) {
    const folder = process.env.CLOUDINARY_FOLDER_MODELS || "menufy/3d-models";
    const publicId = `${folder}/${uuidv4()}`;
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: "raw",
      overwrite: false,
      folder,
    });

    logger.info(`Cloudinary model uploaded: ${result.public_id}`);
    return {
      filename: result.public_id,
      path: result.secure_url,
      size: file.size,
    };
  }

  // Fallback: write to disk
  const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
  const dest = path.join(modelsDir, uniqueName);
  fs.writeFileSync(dest, file.buffer);
  logger.info(`Model written to disk fallback: ${dest}`);
  return {
    filename: uniqueName,
    path: dest,
    size: file.size,
  };
}

/**
 * Delete uploaded image
 */
export async function deleteImage(filename?: string): Promise<boolean> {
  if (!filename) return false;

  try {
    // If filename looks like a Cloudinary public_id (contains '/'), attempt to delete
    if (cloudinary.config().cloud_name && filename.includes("/")) {
      try {
        await cloudinary.uploader.destroy(filename, { resource_type: "image" });
        logger.info(`Cloudinary image deleted: ${filename}`);
        return true;
      } catch (err) {
        logger.warn(`Cloudinary delete failed for ${filename}: ${err}`);
      }
    }

    // Fallback: delete local file
    const filePath = path.join(imagesDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      fileCache.invalidate(filePath);
      logger.info(`Image deleted from disk: ${filename}`);
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

export async function deleteModelCloud(filename?: string): Promise<boolean> {
  if (!filename) return false;
  try {
    if (cloudinary.config().cloud_name && filename.includes("/")) {
      await cloudinary.uploader.destroy(filename, { resource_type: "raw" });
      logger.info(`Cloudinary model deleted: ${filename}`);
      return true;
    }

    return deleteModel(filename);
  } catch (err) {
    logger.error(`Failed to delete model: ${filename} - ${err}`);
    return false;
  }
}

/**
 * Get image URL
 */
export function getImageUrl(filename: string): string {
  // If Cloudinary configured and filename is a Cloudinary public id, build CDN url
  if (cloudinary.config().cloud_name && filename.includes("/")) {
    return cloudinary.url(filename, { secure: true });
  }
  const baseUrl = resolvePublicBaseUrl();
  return `${baseUrl}/uploads/images/${filename}`;
}

export function getModelUrl(filename: string): string {
  if (cloudinary.config().cloud_name && filename.includes("/")) {
    return cloudinary.url(filename, { secure: true, resource_type: "raw" });
  }
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
