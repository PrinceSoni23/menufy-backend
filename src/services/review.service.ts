import { Review, MenuItem } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";

export class ReviewService {
  /**
   * Create a review for menu item
   */
  static async createReview(
    menuItemId: string,
    restaurantId: string,
    userId: string,
    data: {
      rating: number;
      title: string;
      comment: string;
      images?: string[];
    },
  ): Promise<any> {
    // Validate rating
    if (data.rating < 1 || data.rating > 5) {
      throw new AppError(400, "Rating must be between 1 and 5");
    }

    // Check if user already reviewed this item
    const existingReview = await Review.findOne({
      menuItemId,
      userId,
    });

    if (existingReview) {
      throw new AppError(409, "You have already reviewed this item");
    }

    const review = new Review({
      menuItemId,
      restaurantId,
      userId,
      rating: data.rating,
      title: data.title,
      comment: data.comment,
      images: data.images || [],
      verified: false,
    });

    await review.save();

    logger.info(`Review created: ${review._id} for menu item: ${menuItemId}`);

    return review.toObject();
  }

  /**
   * Get reviews for menu item
   */
  static async getMenuItemReviews(
    menuItemId: string,
    limit: number = 10,
    skip: number = 0,
  ): Promise<any> {
    const reviews = await Review.find({ menuItemId })
      .sort({ helpful: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("userId", "firstName lastName avatar");

    const total = await Review.countDocuments({ menuItemId });

    // Calculate rating stats
    const allReviews = await Review.find({ menuItemId });
    const ratingStats = {
      average:
        allReviews.length > 0
          ? (
              allReviews.reduce((sum, r) => sum + r.rating, 0) /
              allReviews.length
            ).toFixed(1)
          : 0,
      total: allReviews.length,
      distribution: {
        5: allReviews.filter(r => r.rating === 5).length,
        4: allReviews.filter(r => r.rating === 4).length,
        3: allReviews.filter(r => r.rating === 3).length,
        2: allReviews.filter(r => r.rating === 2).length,
        1: allReviews.filter(r => r.rating === 1).length,
      },
    };

    return {
      reviews: reviews.map(r => r.toObject()),
      pagination: { total, limit, skip },
      ratingStats,
    };
  }

  /**
   * Get review by ID
   */
  static async getReviewById(reviewId: string): Promise<any> {
    const review = await Review.findById(reviewId).populate(
      "userId",
      "firstName lastName avatar",
    );

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    return review.toObject();
  }

  /**
   * Update review (user only)
   */
  static async updateReview(
    reviewId: string,
    userId: string,
    data: {
      rating?: number;
      title?: string;
      comment?: string;
      images?: string[];
    },
  ): Promise<any> {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    // Verify ownership
    if (review.userId.toString() !== userId) {
      throw new AppError(403, "You can only edit your own reviews");
    }

    if (data.rating && (data.rating < 1 || data.rating > 5)) {
      throw new AppError(400, "Rating must be between 1 and 5");
    }

    Object.assign(review, data);
    await review.save();

    logger.info(`Review updated: ${reviewId}`);

    return review.toObject();
  }

  /**
   * Delete review (user or admin only)
   */
  static async deleteReview(reviewId: string, userId: string): Promise<any> {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    // Verify ownership
    if (review.userId.toString() !== userId) {
      throw new AppError(403, "You can only delete your own reviews");
    }

    await Review.findByIdAndDelete(reviewId);

    logger.info(`Review deleted: ${reviewId}`);

    return { message: "Review deleted successfully" };
  }

  /**
   * Mark review as helpful
   */
  static async markHelpful(reviewId: string): Promise<any> {
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { helpful: 1 } },
      { new: true },
    );

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    return review.toObject();
  }

  /**
   * Mark review as unhelpful
   */
  static async markUnhelpful(reviewId: string): Promise<any> {
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { unhelpful: 1 } },
      { new: true },
    );

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    return review.toObject();
  }

  /**
   * Get restaurant reviews
   */
  static async getRestaurantReviews(
    restaurantId: string,
    limit: number = 20,
    skip: number = 0,
  ): Promise<any> {
    const reviews = await Review.find({ restaurantId })
      .sort({ helpful: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("userId", "firstName lastName avatar")
      .populate("menuItemId", "name");

    const total = await Review.countDocuments({ restaurantId });

    return {
      reviews: reviews.map(r => r.toObject()),
      pagination: { total, limit, skip },
    };
  }

  /**
   * Get user reviews
   */
  static async getUserReviews(userId: string): Promise<any> {
    const reviews = await Review.find({ userId })
      .sort({ createdAt: -1 })
      .populate("menuItemId", "name")
      .populate("restaurantId", "name");

    return reviews.map(r => r.toObject());
  }

  /**
   * Verify review (admin only)
   */
  static async verifyReview(reviewId: string): Promise<any> {
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { verified: true },
      { new: true },
    );

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    logger.info(`Review verified: ${reviewId}`);

    return review.toObject();
  }
}
