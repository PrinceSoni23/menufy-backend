import { Router } from "express";
import { ReviewController } from "../controllers/review.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/reviews/menu/:menuItemId
 * Get reviews for a menu item
 */
router.get(
  "/menu/:menuItemId",
  (req, res, next) => void ReviewController.getMenuItemReviews(req, res, next),
);

/**
 * GET /api/reviews/restaurant/:restaurantId
 * Get all reviews for a restaurant
 */
router.get(
  "/restaurant/:restaurantId",
  (req, res, next) =>
    void ReviewController.getRestaurantReviews(req, res, next),
);

/**
 * GET /api/reviews/:id
 * Get review by ID
 */
router.get(
  "/:id",
  (req, res, next) => void ReviewController.getReview(req, res, next),
);

/**
 * POST /api/reviews/:id/helpful
 * Mark review as helpful
 */
router.post(
  "/:id/helpful",
  (req, res, next) => void ReviewController.markHelpful(req, res, next),
);

/**
 * POST /api/reviews/:id/unhelpful
 * Mark review as unhelpful
 */
router.post(
  "/:id/unhelpful",
  (req, res, next) => void ReviewController.markUnhelpful(req, res, next),
);

// ==================== PROTECTED ROUTES ====================

/**
 * POST /api/reviews
 * Create a review
 */
router.post(
  "/",
  verifyToken,
  (req, res, next) => void ReviewController.createReview(req, res, next),
);

/**
 * PUT /api/reviews/:id
 * Update a review
 */
router.put(
  "/:id",
  verifyToken,
  (req, res, next) => void ReviewController.updateReview(req, res, next),
);

/**
 * DELETE /api/reviews/:id
 * Delete a review
 */
router.delete(
  "/:id",
  verifyToken,
  (req, res, next) => void ReviewController.deleteReview(req, res, next),
);

/**
 * GET /api/reviews/user/my-reviews
 * Get current user's reviews
 */
router.get(
  "/user/my-reviews",
  verifyToken,
  (req, res, next) => void ReviewController.getUserReviews(req, res, next),
);

export default router;
