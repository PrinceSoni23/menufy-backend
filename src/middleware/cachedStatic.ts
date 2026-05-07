import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { fileCache } from "../utils/fileCache";

/**
 * Middleware to serve files from cache when possible
 * Falls back to express.static if caching disabled or file is too large
 */
export const cachedStaticMiddleware = (
  uploadsDir: string,
  cacheableExtensions = [".glb", ".gltf"],
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get the requested file path
    const requestedPath = req.path.replace(/^\//, "");
    const filePath = path.join(uploadsDir, requestedPath);

    // Security: prevent path traversal
    if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir))) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if file extension is cacheable
    const ext = path.extname(filePath).toLowerCase();
    const shouldCache = cacheableExtensions.includes(ext);

    if (!shouldCache) {
      // Let express.static handle non-cacheable files
      return next();
    }

    // Try to get from cache or disk
    const fileData = fileCache.getFile(filePath);

    if (!fileData) {
      // File not found
      return res.status(404).json({ message: "File not found" });
    }

    // Get file stats for headers
    try {
      const stats = fs.statSync(filePath);

      // Set response headers
      res.set("Content-Type", getMimeType(ext));
      res.set("Content-Length", fileData.length.toString());
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

      // Cache headers (same as express.static)
      if (ext === ".glb") {
        res.set("Cache-Control", "public, max-age=2592000, immutable");
      } else {
        res.set("Cache-Control", "public, max-age=604800");
      }

      // ETag for cache validation
      const etag = `"${stats.ino}-${stats.mtime.getTime()}"`;
      res.set("ETag", etag);

      // Handle If-None-Match (304 Not Modified)
      if (req.get("If-None-Match") === etag) {
        return res.status(304).end();
      }

      // Send file
      res.send(fileData);
    } catch (error) {
      console.error(`[CachedStatic] Error serving ${filePath}:`, error);
      res.status(500).json({ message: "Error reading file" });
    }
  };
};

/**
 * Get MIME type for file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
