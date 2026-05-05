import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import logger from "./logger";

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
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Create multer instance for 3D models
export const upload3D = multer({
  storage,
  fileFilter: fileFilter3D,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for 3D models
  },
});

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
  const baseUrl = process.env.API_URL || "http://localhost:5000";
  return `${baseUrl}/uploads/images/${filename}`;
}

/**
 * Check if image exists
 */
export function imageExists(filename: string): boolean {
  const filePath = path.join(uploadDir, filename);
  return fs.existsSync(filePath);
}
