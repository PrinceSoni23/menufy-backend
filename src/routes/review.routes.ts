import { Router } from "express";
import { ReviewController } from "../controllers/review.controller";
import {
  verifyToken,
  optionalVerifyToken,
} from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/reviews/menu/:menuItemId
 * Get reviews for a menu item
 */
router.get("/menu/:menuItemId", ReviewController.getMenuItemReviews);

/**
 * GET /api/reviews/restaurant/:restaurantId
 * Get all reviews for a restaurant
 */
router.get("/restaurant/:restaurantId", ReviewController.getRestaurantReviews);

/**
 * GET /api/reviews/:id
 * Get review by ID
 */
router.get("/:id", ReviewController.getReview);

/**
 * POST /api/reviews/:id/helpful
 * Mark review as helpful
 */
router.post("/:id/helpful", ReviewController.markHelpful);

/**
 * POST /api/reviews/:id/unhelpful
 * Mark review as unhelpful
 */
router.post("/:id/unhelpful", ReviewController.markUnhelpful);

// ==================== PROTECTED ROUTES ====================

/**
 * POST /api/reviews
 * Create a review
 */
router.post("/", verifyToken, ReviewController.createReview);

/**
 * PUT /api/reviews/:id
 * Update a review
 */
router.put("/:id", verifyToken, ReviewController.updateReview);

/**
 * DELETE /api/reviews/:id
 * Delete a review
 */
router.delete("/:id", verifyToken, ReviewController.deleteReview);

/**
 * GET /api/reviews/user/my-reviews
 * Get current user's reviews
 */
router.get("/user/my-reviews", verifyToken, ReviewController.getUserReviews);

export default router;
