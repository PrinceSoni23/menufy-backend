import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import logger from "./logger";
import { fileCache } from "./fileCache";

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "../../uploads/images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => {
    cb(null, uploadDir);
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

// File filter for 3D models - GLB ONLY (30-50% smaller than GLTF)
const fileFilter3D = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  // Only allow .glb (binary format) for optimal performance
  // GLB is 30-50% smaller than GLTF and will be loaded faster
  const allowedMimes = [
    "model/gltf-binary",
    "application/octet-stream", // .glb fallback mime type
  ];

  const isGLB = file.originalname.toLowerCase().endsWith('.glb');
  
  if (isGLB && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(
      "Only .GLB (binary 3D model files) are allowed. " +
      "Please convert your GLTF/OBJ models to GLB format using: " +
      "• Blender (File > Export as glTF Binary) " +
      "• Online tools (gltf.report, cesium.com/blog/3d-model-conversion/)"
    ));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Create multer instance for 3D models
// Reduced from 200MB to 50MB with GLB-only requirement
// This encourages optimization: 500MB GLTF → 50MB GLB (with Draco: 10-20MB)
export const upload3D = multer({
  storage,
  fileFilter: fileFilter3D,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for 3D models (GLB only)
  },
});

const isLocalhostBaseUrl = (baseUrl: string): boolean =>
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|::1)(:\d+)?(\/|$)/i.test(baseUrl);

export function resolvePublicBaseUrl(req?: Request): string {
  const configuredBaseUrl = (
    process.env.API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (configuredBaseUrl && !isLocalhostBaseUrl(configuredBaseUrl)) {
    return configuredBaseUrl;
  }

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

    const protocol = forwardedProto || req.protocol || "http";
    const host = forwardedHost || req.get("host");

    if (host) {
      return `${protocol}://${host}`.replace(/\/$/, "");
    }
  }

  return configuredBaseUrl || "http://localhost:5000";
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
    const filePath = path.join(uploadDir, filename);

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

/**
 * Get image URL
 */
export function getImageUrl(filename: string): string {
  const baseUrl = resolvePublicBaseUrl();
  return `${baseUrl}/uploads/images/${filename}`;
}

/**
 * Check if image exists
 */
export function imageExists(filename: string): boolean {
  const filePath = path.join(uploadDir, filename);
  return fs.existsSync(filePath);
}
