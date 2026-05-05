import { Router } from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * POST /api/analytics/track
 * Track an analytics event
 */
router.post("/track", AnalyticsController.trackEvent);

// ==================== PROTECTED ROUTES ====================

/**
 * GET /api/analytics/restaurant/:restaurantId
 * Get restaurant analytics dashboard
 */
router.get(
  "/restaurant/:restaurantId",
  verifyToken,
  AnalyticsController.getRestaurantAnalytics,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/top-items
 * Get top performing menu items
 */
router.get(
  "/restaurant/:restaurantId/top-items",
  verifyToken,
  AnalyticsController.getTopMenuItems,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/devices
 * Get device breakdown
 */
router.get(
  "/restaurant/:restaurantId/devices",
  verifyToken,
  AnalyticsController.getDeviceBreakdown,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/trends
 * Get event trends
 */
router.get(
  "/restaurant/:restaurantId/trends",
  verifyToken,
  AnalyticsController.getEventTrends,
);

export default router;
