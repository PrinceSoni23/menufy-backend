import { Router, Request, Response, NextFunction } from "express";
import { UploadController } from "../controllers/upload.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { upload, upload3D } from "../utils/uploadHandler";
import { validateObjectId } from "../utils/validation";
import { AppError } from "../middleware/errorHandler";

const router = Router();

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
  UploadController.uploadMenuItemImage,
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
  UploadController.upload3DModel,
);

/**
 * GET /api/upload/conversion-status/:jobId
 * Get 3D conversion status
 */
router.get(
  "/conversion-status/:jobId",
  verifyToken,
  UploadController.getConversionStatus,
);

/**
 * POST /api/upload/cancel-conversion/:jobId
 * Cancel 3D conversion
 */
router.post(
  "/cancel-conversion/:jobId",
  verifyToken,
  UploadController.cancelConversion,
);

/**
 * POST /api/upload/retry-conversion/:menuItemId
 * Retry 3D conversion for a menu item
 */
router.post(
  "/retry-conversion/:menuItemId",
  validateObjectIdParams(["menuItemId"]),
  verifyToken,
  UploadController.retryConversion,
);

/**
 * POST /api/webhooks/conversion-complete
 * Webhook endpoint for conversion completion (called by Tripo AI)
 * No authentication required - Tripo AI sends webhook
 */
router.post("/conversion-complete", UploadController.conversionWebhook);

export default router;
