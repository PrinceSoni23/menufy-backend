/**
 * Public URL Verification Endpoint
 * Add to backend routes to test if uploads are publicly accessible
 *
 * Usage: GET /api/uploads/verify
 * Returns the public URL being used and tests file accessibility
 */

import { Request, Response, NextFunction } from "express";
import { resolvePublicBaseUrl } from "../utils/uploadHandler";
import logger from "../utils/logger";

export class UploadVerifyController {
  /**
   * GET /api/uploads/verify
   * Returns current public URL configuration and accessibility test
   */
  static async verifyPublicUrl(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const publicBaseUrl = resolvePublicBaseUrl(req);
      const testImageUrl = `${publicBaseUrl}/uploads/images`;
      const test3dUrl = `${publicBaseUrl}/uploads/3d-models`;

      logger.info(`[Verify] Public Base URL: ${publicBaseUrl}`);
      logger.info(`[Verify] Test Image Path: ${testImageUrl}`);
      logger.info(`[Verify] Test 3D Path: ${test3dUrl}`);

      // Get all environment values (for debugging)
      const envConfig = {
        PUBLIC_API_URL: process.env.PUBLIC_API_URL || "not set",
        API_URL: process.env.API_URL || "not set",
        RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || "not set",
        NODE_ENV: process.env.NODE_ENV || "development",
      };

      // Get request headers
      const requestHeaders = {
        host: req.get("host"),
        protocol: req.protocol,
        "x-forwarded-proto": req.get("x-forwarded-proto") || "not set",
        "x-forwarded-host": req.get("x-forwarded-host") || "not set",
        origin: req.get("origin") || "not set",
      };

      res.status(200).json({
        success: true,
        message: "Public URL verification",
        data: {
          publicBaseUrl,
          testUrls: {
            imageExample: `${publicBaseUrl}/uploads/images/test-image.jpg`,
            modelExample: `${publicBaseUrl}/uploads/3d-models/test-model.glb`,
            imagesPath: testImageUrl,
            modelsPath: test3dUrl,
          },
          environment: envConfig,
          requestHeaders,
          instructions: {
            localhost:
              "Set PUBLIC_API_URL=http://192.168.1.X:5000 in .env for network access",
            production: "Set PUBLIC_API_URL=https://yourdomain.com in .env",
            docker: "Ensure uploads volume is mounted at backend/uploads",
          },
          tips: [
            "✅ Images/models are saved with this public URL in the database",
            "✅ All uploads should be accessible from any device using these URLs",
            "✅ If not working, check PUBLIC_API_URL environment variable",
            "✅ Test by uploading an image and checking the URL in the response",
          ],
        },
      });
    } catch (error) {
      logger.error(`[Verify] Error: ${error}`);
      res.status(500).json({
        success: false,
        message: "Failed to verify public URL",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /api/uploads/test/:filename
   * Test if a specific file is accessible
   */
  static async testFileAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { filename } = req.params;
      const publicBaseUrl = resolvePublicBaseUrl(req);
      const fileUrl = `${publicBaseUrl}/uploads/images/${filename}`;

      logger.info(`[Test] Checking file: ${fileUrl}`);

      // Try to fetch the file to verify accessibility
      const fetch = require("node-fetch");
      const response = await fetch(fileUrl, { method: "HEAD" });

      res.status(200).json({
        success: true,
        data: {
          filename,
          url: fileUrl,
          accessible: response.ok,
          statusCode: response.status,
          headers: {
            contentType: response.headers.get("content-type"),
            contentLength: response.headers.get("content-length"),
            cacheControl: response.headers.get("cache-control"),
            cors: response.headers.get("access-control-allow-origin"),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error testing file access",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
