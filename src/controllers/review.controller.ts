import { Request, Response, NextFunction } from "express";
import { ReviewService } from "../services/review.service";
import { AppError } from "../middleware/errorHandler";
import { validateObjectId, validateObjectIds } from "../utils/validation";
import Joi from "joi";

const createReviewSchema = Joi.object({
  rating: Joi.number().min(1).max(5).required(),
  title: Joi.string().max(100).required(),
  comment: Joi.string().max(1000).required(),
  images: Joi.array().items(Joi.string()).optional(),
});

const updateReviewSchema = Joi.object({
  rating: Joi.number().min(1).max(5).optional(),
  title: Joi.string().max(100).optional(),
  comment: Joi.string().max(1000).optional(),
  images: Joi.array().items(Joi.string()).optional(),
});

export class ReviewController {
  /**
   * POST /api/reviews
   * Create a review for a menu item
   */
  static async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { menuItemId, restaurantId } = req.body;

      // CRITICAL FIX: Validate ObjectIDs
      validateObjectIds({ menuItemId, restaurantId });

      if (!menuItemId || !restaurantId) {
        throw new AppError(400, "menuItemId and restaurantId are required");
      }

      const { error, value } = createReviewSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      const review = await ReviewService.createReview(
        menuItemId,
        restaurantId,
        req.user.userId,
        value,
      );

      res.status(201).json({
        success: true,
        message: "Review created successfully",
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reviews/menu/:menuItemId
   * Get reviews for a menu item
   */
  static async getMenuItemReviews(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { menuItemId } = req.params;
      const { limit = 10, skip = 0 } = req.query;

      // CRITICAL FIX: Validate ObjectID
      validateObjectId(menuItemId);

      const data = await ReviewService.getMenuItemReviews(
        menuItemId,
        parseInt(limit as string) || 10,
        parseInt(skip as string) || 0,
      );

      res.status(200).json({
        success: true,
        message: "Reviews retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reviews/:id
   * Get review by ID
   */
  static async getReview(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID
      validateObjectId(id);

      const review = await ReviewService.getReviewById(id);

      res.status(200).json({
        success: true,
        message: "Review retrieved successfully",
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/reviews/:id
   * Update a review
   */
  static async updateReview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID
      validateObjectId(id);

      const { error, value } = updateReviewSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      const review = await ReviewService.updateReview(
        id,
        req.user.userId,
        value,
      );

      res.status(200).json({
        success: true,
        message: "Review updated successfully",
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/reviews/:id
   * Delete a review
   */
  static async deleteReview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID
      validateObjectId(id);

      await ReviewService.deleteReview(id, req.user.userId);

      res.status(200).json({
        success: true,
        message: "Review deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/reviews/:id/helpful
   * Mark review as helpful
   */
  static async markHelpful(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const review = await ReviewService.markHelpful(id);

      res.status(200).json({
        success: true,
        message: "Marked as helpful",
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/reviews/:id/unhelpful
   * Mark review as unhelpful
   */
  static async markUnhelpful(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const review = await ReviewService.markUnhelpful(id);

      res.status(200).json({
        success: true,
        message: "Marked as unhelpful",
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reviews/restaurant/:restaurantId
   * Get all reviews for a restaurant
   */
  static async getRestaurantReviews(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId } = req.params;
      const { limit = 20, skip = 0 } = req.query;

      const data = await ReviewService.getRestaurantReviews(
        restaurantId,
        parseInt(limit as string) || 20,
        parseInt(skip as string) || 0,
      );

      res.status(200).json({
        success: true,
        message: "Reviews retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/reviews/user/my-reviews
   * Get current user's reviews
   */
  static async getUserReviews(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const reviews = await ReviewService.getUserReviews(req.user.userId);

      res.status(200).json({
        success: true,
        message: "Your reviews retrieved successfully",
        data: { reviews },
      });
    } catch (error) {
      next(error);
    }
  }
}
