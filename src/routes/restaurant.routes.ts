import { Router } from "express";
import { RestaurantController } from "../controllers/restaurant.controller";
import { verifyToken, verifyOwner } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================
/**
 * GET /api/restaurants/public/:publicUrl
 * Get restaurant by public URL (no auth required)
 */
router.get(
  "/public/:publicUrl",
  (req, res, next) =>
    void RestaurantController.getPublicRestaurant(req, res, next),
);

/**
 * GET /api/restaurants/qr/:qrcode
 * Get restaurant by QR code (no auth required)
 */
router.get(
  "/qr/:qrcode",
  (req, res, next) =>
    void RestaurantController.getRestaurantByQRCode(req, res, next),
);

/**
 * GET /api/restaurants/search
 * Search restaurants (no auth required)
 */
router.get(
  "/search",
  (req, res, next) =>
    void RestaurantController.searchRestaurants(req, res, next),
);

/**
 * GET /api/restaurants/city/:city
 * Get restaurants by city (no auth required)
 */
router.get(
  "/city/:city",
  (req, res, next) =>
    void RestaurantController.getRestaurantsByCity(req, res, next),
);

/**
 * POST /api/restaurants/:id/scan
 * Increment scan count (no auth required)
 */
router.post(
  "/:id/scan",
  (req, res, next) =>
    void RestaurantController.incrementScanCount(req, res, next),
);

// ==================== PROTECTED ROUTES ====================

/**
 * POST /api/restaurants
 * Create a new restaurant (owner only)
 * CRITICAL FIX: Added verifyOwner middleware
 */
router.post(
  "/",
  verifyToken,
  verifyOwner,
  (req, res, next) =>
    void RestaurantController.createRestaurant(req, res, next),
);

/**
 * GET /api/restaurants
 * Get all restaurants for authenticated owner
 */
router.get(
  "/",
  verifyToken,
  (req, res, next) =>
    void RestaurantController.getOwnerRestaurants(req, res, next),
);

/**
 * GET /api/restaurants/summary
 * Get live dashboard summary for authenticated owner
 */
router.get(
  "/summary",
  verifyToken,
  (req, res, next) =>
    void RestaurantController.getDashboardSummary(req, res, next),
);

/**
 * GET /api/restaurants/:id
 * Get restaurant by ID
 */
router.get(
  "/:id",
  verifyToken,
  (req, res, next) => void RestaurantController.getRestaurant(req, res, next),
);

/**
 * PUT /api/restaurants/:id
 * Update restaurant (owner only)
 * CRITICAL FIX: Added verifyOwner middleware
 */
router.put(
  "/:id",
  verifyToken,
  verifyOwner,
  (req, res, next) =>
    void RestaurantController.updateRestaurant(req, res, next),
);

/**
 * DELETE /api/restaurants/:id
 * Delete restaurant (owner only)
 * CRITICAL FIX: Added verifyOwner middleware
 */
router.delete(
  "/:id",
  verifyToken,
  verifyOwner,
  (req, res, next) =>
    void RestaurantController.deleteRestaurant(req, res, next),
);

/**
 * GET /api/restaurants/:id/stats
 * Get restaurant statistics (owner only)
 * CRITICAL FIX: Added verifyOwner middleware
 */
router.get(
  "/:id/stats",
  verifyToken,
  verifyOwner,
  (req, res, next) =>
    void RestaurantController.getRestaurantStats(req, res, next),
);

export default router;
