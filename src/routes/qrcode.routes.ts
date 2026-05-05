import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { QRCodeService } from "../services/qrcode.service";
import { AppError } from "../middleware/errorHandler";

const router = Router();

/**
 * POST /api/qrcode/generate
 * Generate QR code for restaurant
 */
router.post("/generate", verifyToken, async (req, res, next) => {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");

    const { restaurantId, publicUrl } = req.body;
    if (!restaurantId || !publicUrl) {
      throw new AppError(400, "restaurantId and publicUrl are required");
    }

    const qrCode = await QRCodeService.generateQRCode(
      restaurantId,
      req.user.userId,
      publicUrl,
    );

    res.status(201).json({
      success: true,
      message: "QR code generated successfully",
      data: { qrCode },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/qrcode/:restaurantId
 * Get QR code for restaurant
 */
router.get("/:restaurantId", verifyToken, async (req, res, next) => {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");

    const { restaurantId } = req.params;

    const qrCode = await QRCodeService.getQRCode(restaurantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: "QR code retrieved successfully",
      data: { qrCode },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/qrcode/:restaurantId/analytics
 * Get QR code analytics
 */
router.get("/:restaurantId/analytics", verifyToken, async (req, res, next) => {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");

    const { restaurantId } = req.params;

    const analytics = await QRCodeService.getQRCodeAnalytics(
      restaurantId,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      message: "QR code analytics retrieved",
      data: { analytics },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/qrcode/public/:publicUrl
 * Get restaurant ID from public URL (PUBLIC - no auth required)
 */
router.get("/public/:publicUrl", async (req, res, next) => {
  try {
    const { publicUrl } = req.params;

    const qrCode = await QRCodeService.getRestaurantByPublicUrl(publicUrl);

    res.status(200).json({
      success: true,
      message: "Restaurant found",
      data: { restaurantId: qrCode.restaurantId, qrCode },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/qrcode/scan/:code
 * Track QR code scan
 */
router.post("/scan/:code", async (req, res, next) => {
  try {
    const { code } = req.params;
    const { deviceId } = req.body;

    const qrCode = await QRCodeService.trackQRCodeScan(code, deviceId);

    res.status(200).json({
      success: true,
      message: "Scan tracked",
      data: { qrCode },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/qrcode/:restaurantId/regenerate
 * Regenerate QR code
 */
router.post(
  "/:restaurantId/regenerate",
  verifyToken,
  async (req, res, next) => {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;

      const qrCode = await QRCodeService.regenerateQRCode(
        restaurantId,
        req.user.userId,
      );

      res.status(200).json({
        success: true,
        message: "QR code regenerated successfully",
        data: { qrCode },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
