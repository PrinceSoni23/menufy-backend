import { Router } from "express";
import { MenuController } from "../controllers/menu.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/menu/public/:restaurantId
 * Get all PUBLIC menu items for a restaurant (only active items)
 */
router.get("/public/:restaurantId", MenuController.getPublicRestaurantMenu);

/**
 * GET /api/menu/restaurant/:restaurantId
 * Get all menu items for a restaurant (for owner management)
 */
router.get("/restaurant/:restaurantId", MenuController.getRestaurantMenu);

/**
 * GET /api/menu/categories/:restaurantId
 * Get menu categories
 */
router.get("/categories/:restaurantId", MenuController.getMenuCategories);

/**
 * GET /api/menu/:id
 * Get menu item by ID
 */
router.get("/:id", MenuController.getMenuItem);

/**
 * GET /api/menu/:id/with-reviews
 * Get menu item with reviews
 */
router.get("/:id/with-reviews", MenuController.getMenuItemWithReviews);

/**
 * POST /api/menu/:id/view
 * Track menu item view
 */
router.post("/:id/view", MenuController.trackMenuItemView);

/**
 * POST /api/menu/:id/ar-view
 * Track AR view
 */
router.post("/:id/ar-view", MenuController.trackARView);

/**
 * GET /api/menu/search/:restaurantId
 * Search menu items
 */
router.get("/search/:restaurantId", MenuController.searchMenuItems);

// ==================== PROTECTED ROUTES ====================

/**
 * POST /api/menu
 * Create a new menu item
 */
router.post("/", verifyToken, MenuController.createMenuItem);

/**
 * PUT /api/menu/:id
 * Update menu item
 */
router.put("/:id", verifyToken, MenuController.updateMenuItem);

/**
 * DELETE /api/menu/:id
 * Delete menu item
 */
router.delete("/:id", verifyToken, MenuController.deleteMenuItem);

export default router;
