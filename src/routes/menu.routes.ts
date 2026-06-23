import { Router } from "express";
import { MenuController } from "../controllers/menu.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/menu/public/:restaurantId
 * Get all PUBLIC menu items for a restaurant (only active items)
 */
router.get(
  "/public/:restaurantId",
  (req, res, next) =>
    void MenuController.getPublicRestaurantMenu(req, res, next),
);

/**
 * GET /api/menu/restaurant/:restaurantId
 * Get all menu items for a restaurant (for owner management)
 */
router.get(
  "/restaurant/:restaurantId",
  (req, res, next) => void MenuController.getRestaurantMenu(req, res, next),
);

/**
 * GET /api/menu/categories/:restaurantId
 * Get menu categories
 */
router.get(
  "/categories/:restaurantId",
  (req, res, next) => void MenuController.getMenuCategories(req, res, next),
);

/**
 * GET /api/menu/:id
 * Get menu item by ID
 */
router.get(
  "/:id",
  (req, res, next) => void MenuController.getMenuItem(req, res, next),
);

/**
 * GET /api/menu/:id/with-reviews
 * Get menu item with reviews
 */
router.get(
  "/:id/with-reviews",
  (req, res, next) =>
    void MenuController.getMenuItemWithReviews(req, res, next),
);

/**
 * POST /api/menu/:id/view
 * Track menu item view
 */
router.post(
  "/:id/view",
  (req, res, next) => void MenuController.trackMenuItemView(req, res, next),
);

/**
 * POST /api/menu/:id/ar-view
 * Track AR view
 */
router.post(
  "/:id/ar-view",
  (req, res, next) => void MenuController.trackARView(req, res, next),
);

/**
 * GET /api/menu/search/:restaurantId
 * Search menu items
 */
router.get(
  "/search/:restaurantId",
  (req, res, next) => void MenuController.searchMenuItems(req, res, next),
);

// ==================== PROTECTED ROUTES ====================

/**
 * POST /api/menu
 * Create a new menu item
 */
router.post(
  "/",
  verifyToken,
  (req, res, next) => void MenuController.createMenuItem(req, res, next),
);

/**
 * PUT /api/menu/:id
 * Update menu item
 */
router.put(
  "/:id",
  verifyToken,
  (req, res, next) => void MenuController.updateMenuItem(req, res, next),
);

/**
 * DELETE /api/menu/:id
 * Delete menu item
 */
router.delete(
  "/:id",
  verifyToken,
  (req, res, next) => void MenuController.deleteMenuItem(req, res, next),
);

export default router;
