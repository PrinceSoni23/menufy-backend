import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { UploadController } from "../controllers/upload.controller";
import { UploadVerifyController } from "../controllers/upload-verify.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { upload, upload3D } from "../utils/uploadHandler";
import { validateObjectId } from "../utils/validation";

const router = Router();

const diagnosticLimiter = rateLimit({
  windowMs: parseInt(
    process.env.UPLOAD_DIAGNOSTIC_RATE_LIMIT_WINDOW_MS || "900000",
  ),
  max: parseInt(process.env.UPLOAD_DIAGNOSTIC_RATE_LIMIT_MAX_REQUESTS || "120"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many diagnostic requests from this IP, please try again later.",
});

/**
 * Middleware to validate ObjectId in params
 */
const validateObjectIdParams = (paramNames: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const paramName of paramNames) {
        const value = req.params[paramName];
        if (value) {
          validateObjectId(value);
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * POST /api/upload/menu-item/:restaurantId/:menuItemId
 * Upload 2D image and start 3D conversion
 * Body: FormData with 'image' field
 */
router.post(
  "/menu-item/:restaurantId/:menuItemId",
  validateObjectIdParams(["restaurantId", "menuItemId"]),
  verifyToken,
  upload.single("image"),
  (req, res, next) => void UploadController.uploadMenuItemImage(req, res, next),
);

/**
 * POST /api/upload/3d-model/:restaurantId/:menuItemId
 * Upload 3D model for a menu item
 * Body: FormData with 'file' field containing .glb, .gltf, or .obj file
 */
router.post(
  "/3d-model/:restaurantId/:menuItemId",
  validateObjectIdParams(["restaurantId", "menuItemId"]),
  verifyToken,
  upload3D.single("file"),
  (req, res, next) => void UploadController.upload3DModel(req, res, next),
);

/**
 * GET /api/upload/conversion-status/:jobId
 * Get 3D conversion status
 */
router.get(
  "/conversion-status/:jobId",
  verifyToken,
  (req, res, next) => void UploadController.getConversionStatus(req, res, next),
);

/**
 * POST /api/upload/cancel-conversion/:jobId
 * Cancel 3D conversion
 */
router.post(
  "/cancel-conversion/:jobId",
  verifyToken,
  (req, res, next) => void UploadController.cancelConversion(req, res, next),
);

/**
 * POST /api/upload/retry-conversion/:menuItemId
 * Retry 3D conversion for a menu item
 */
router.post(
  "/retry-conversion/:menuItemId",
  validateObjectIdParams(["menuItemId"]),
  verifyToken,
  (req, res, next) => void UploadController.retryConversion(req, res, next),
);

/**
 * POST /api/webhooks/conversion-complete
 * Webhook endpoint for conversion completion (called by Tripo AI)
 * No authentication required - Tripo AI sends webhook
 */
router.post(
  "/conversion-complete",
  (req, res, next) => void UploadController.conversionWebhook(req, res, next),
);

/**
 * GET /api/upload/verify
 * Check current public URL configuration and accessibility
 * No auth required - used for debugging
 */
router.get(
  "/verify",
  diagnosticLimiter,
  (req, res, next) =>
    void UploadVerifyController.verifyPublicUrl(req, res, next),
);

/**
 * GET /api/upload/test/:filename
 * Test if a specific file is accessible via public URL
 */
router.get(
  "/test/:filename",
  diagnosticLimiter,
  (req, res, next) =>
    void UploadVerifyController.testFileAccess(req, res, next),
);

export default router;
