import { Router } from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * POST /api/analytics/track
 * Track an analytics event (menu view, AR usage, cart interactions, etc.)
 */
router.post("/track", AnalyticsController.trackEvent);

// ==================== PROTECTED ROUTES (ORIGINAL DASHBOARD) ====================

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
 */
router.get(
  "/restaurant/:restaurantId/top-items",
  verifyToken,
  AnalyticsController.getTopMenuItems,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/devices
 */
router.get(
  "/restaurant/:restaurantId/devices",
  verifyToken,
  AnalyticsController.getDeviceBreakdown,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/trends
 */
router.get(
  "/restaurant/:restaurantId/trends",
  verifyToken,
  AnalyticsController.getEventTrends,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/comprehensive
 */
router.get(
  "/restaurant/:restaurantId/comprehensive",
  verifyToken,
  AnalyticsController.getComprehensiveAnalytics,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/sales-heatmap
 */
router.get(
  "/restaurant/:restaurantId/sales-heatmap",
  verifyToken,
  AnalyticsController.getSalesHeatmap,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/category-performance
 */
router.get(
  "/restaurant/:restaurantId/category-performance",
  verifyToken,
  AnalyticsController.getCategoryPerformance,
);

// ==================== PROTECTED ROUTES (ENGAGEMENT METRICS) ====================

/**
 * GET /api/analytics/restaurant/:restaurantId/engagement-funnel
 * Get engagement funnel: scans → menu opens → item views → cart adds
 */
router.get(
  "/restaurant/:restaurantId/engagement-funnel",
  verifyToken,
  AnalyticsController.getEngagementFunnel,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/item-popularity
 * Get top items by add-to-cart count
 */
router.get(
  "/restaurant/:restaurantId/item-popularity",
  verifyToken,
  AnalyticsController.getItemPopularity,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/ar-usage
 * Get percentage of users utilizing AR/3D features
 */
router.get(
  "/restaurant/:restaurantId/ar-usage",
  verifyToken,
  AnalyticsController.getARUsage,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/cart-abandonment
 * Get percentage of sessions with carts created but no order
 */
router.get(
  "/restaurant/:restaurantId/cart-abandonment",
  verifyToken,
  AnalyticsController.getCartAbandonment,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/session-duration
 * Get average time spent in menu per session, trended over time
 */
router.get(
  "/restaurant/:restaurantId/session-duration",
  verifyToken,
  AnalyticsController.getSessionDuration,
);

/**
 * GET /api/analytics/restaurant/:restaurantId/selection-patterns
 * Get frequently co-selected item combinations
 */
router.get(
  "/restaurant/:restaurantId/selection-patterns",
  verifyToken,
  AnalyticsController.getSelectionPatterns,
);

export default router;
