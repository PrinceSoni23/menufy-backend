import { Request, Response } from "express";
import { remoteCache } from "../utils/remoteCache";
import logger from "../utils/logger";

export async function proxyMedia(req: Request, res: Response) {
  try {
    const src = req.query.url as string;
    if (!src) return res.status(400).json({ message: "Missing url parameter" });

    // Only allow http/https
    if (!/^https?:\/\//i.test(src)) {
      return res.status(400).json({ message: "Invalid url" });
    }

    // For security, restrict to Cloudinary or known hosts if configured
    const parsed = new URL(src);
    const host = parsed.host;
    const envAllowed = (process.env.ALLOWED_MEDIA_HOSTS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const allowedHosts = [
      "res.cloudinary.com",
      "api.cloudinary.com",
      ...envAllowed,
    ];
    if (!allowedHosts.includes(host)) {
      return res.status(403).json({ message: "Host not allowed" });
    }

    const remoteResult = await remoteCache.get(src);
    if (remoteResult.entry) {
      const { entry, cacheHit } = remoteResult;
      res.setHeader("Content-Type", entry.contentType);
      res.setHeader("Content-Length", String(entry.size));
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.setHeader("ETag", `"${entry.timestamp}-${entry.size}"`);
      res.setHeader(
        "X-Media-Source",
        cacheHit ? "backend-cache" : "cloudinary",
      );
      logger.info(
        `[MediaProxy] ${cacheHit ? "CACHE HIT" : "CLOUDINARY FETCH"} ${src}`,
      );
      return res.status(200).end(entry.data);
    }

    logger.warn(`[MediaProxy] Failed to retrieve remote ${src}`);
    return res.status(502).json({ message: "Failed to proxy media" });
  } catch (err) {
    logger.error(`[MediaProxy] Error: ${err}`);
    return res.status(500).json({ message: "Server error" });
  }
}
