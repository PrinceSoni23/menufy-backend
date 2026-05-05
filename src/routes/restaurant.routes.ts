import { Router } from "express";
import { RestaurantController } from "../controllers/restaurant.controller";
import { verifyToken, verifyOwner } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================
/**
 * GET /api/restaurants/public/:publicUrl
 * Get restaurant by public URL (no auth required)
 */
router.get("/public/:publicUrl", RestaurantController.getPublicRestaurant);

/**
 * GET /api/restaurants/qr/:qrcode
 * Get restaurant by QR code (no auth required)
 */
router.get("/qr/:qrcode", RestaurantController.getRestaurantByQRCode);

/**
 * GET /api/restaurants/search
 * Search restaurants (no auth required)
 */
router.get("/search", RestaurantController.searchRestaurants);

/**
 * GET /api/restaurants/city/:city
 * Get restaurants by city (no auth required)
 */
router.get("/city/:city", RestaurantController.getRestaurantsByCity);

/**
 * POST /api/restaurants/:id/scan
 * Increment scan count (no auth required)
 */
router.post("/:id/scan", RestaurantController.incrementScanCount);

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
  RestaurantController.createRestaurant,
);

/**
 * GET /api/restaurants
 * Get all restaurants for authenticated owner
 */
router.get("/", verifyToken, RestaurantController.getOwnerRestaurants);

/**
 * GET /api/restaurants/:id
 * Get restaurant by ID
 */
router.get("/:id", verifyToken, RestaurantController.getRestaurant);

/**
 * PUT /api/restaurants/:id
 * Update restaurant (owner only)
 * CRITICAL FIX: Added verifyOwner middleware
 */
router.put(
  "/:id",
  verifyToken,
  verifyOwner,
  RestaurantController.updateRestaurant,
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
  RestaurantController.deleteRestaurant,
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
  RestaurantController.getRestaurantStats,
);

export default router;
