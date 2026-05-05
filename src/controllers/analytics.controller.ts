import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { AppError } from "../middleware/errorHandler";
import { validateObjectId } from "../utils/validation";

export class AnalyticsController {
  /**
   * POST /api/analytics/track
   * Track an analytics event
   */
  static async trackEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { restaurantId, eventType, deviceType, sessionId, menuItemId } =
        req.body;

      if (!restaurantId || !eventType || !sessionId) {
        throw new AppError(
          400,
          "restaurantId, eventType, and sessionId are required",
        );
      }

      // Validate ObjectId format for restaurantId and menuItemId
      validateObjectId(restaurantId);

      if (menuItemId) {
        validateObjectId(menuItemId);
      }

      // Validate eventType
      const validEventTypes = [
        "view",
        "click",
        "purchase",
        "share",
        "like",
        "review",
      ];
      if (!validEventTypes.includes(eventType)) {
        throw new AppError(
          400,
          `eventType must be one of: ${validEventTypes.join(", ")}`,
        );
      }

      const userAgent = req.get("user-agent");
      const ipAddress = req.ip;

      const event = await AnalyticsService.trackEvent(
        restaurantId,
        eventType,
        deviceType || "Web",
        sessionId,
        menuItemId,
        userAgent,
        ipAddress,
      );

      res.status(201).json({
        success: true,
        message: "Event tracked",
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId
   * Get restaurant analytics dashboard
   */
  static async getRestaurantAnalytics(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { days = 7 } = req.query;

      // Validate ObjectId format
      validateObjectId(restaurantId);

      // Validate days parameter
      const daysNum = parseInt(days as string) || 7;
      if (daysNum <= 0 || daysNum > 365) {
        throw new AppError(400, "Days must be between 1 and 365");
      }

      const analytics = await AnalyticsService.getRestaurantAnalytics(
        restaurantId,
        req.user.userId,
        daysNum,
      );

      res.status(200).json({
        success: true,
        message: "Analytics retrieved successfully",
        data: { analytics },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/top-items
   * Get top performing menu items
   */
  static async getTopMenuItems(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { limit = 10 } = req.query;

      // Validate ObjectId format
      validateObjectId(restaurantId);

      // Validate limit parameter
      const limitNum = parseInt(limit as string) || 10;
      if (limitNum <= 0 || limitNum > 100) {
        throw new AppError(400, "Limit must be between 1 and 100");
      }

      // Verify ownership
      const { Restaurant } = await import("../models/index.js");
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to view these analytics",
        );
      }

      const topItems = await AnalyticsService.getTopMenuItems(
        restaurantId,
        limitNum,
      );

      res.status(200).json({
        success: true,
        message: "Top items retrieved",
        data: { topItems },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/devices
   * Get device breakdown
   */
  static async getDeviceBreakdown(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { days = 7 } = req.query;

      // Validate ObjectId format
      validateObjectId(restaurantId);

      // Validate days parameter
      const daysNum = parseInt(days as string) || 7;
      if (daysNum <= 0 || daysNum > 365) {
        throw new AppError(400, "Days must be between 1 and 365");
      }

      // Verify ownership
      const { Restaurant } = await import("../models/index.js");
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to view these analytics",
        );
      }

      const deviceStats = await AnalyticsService.getDeviceBreakdown(
        restaurantId,
        daysNum,
      );

      res.status(200).json({
        success: true,
        message: "Device breakdown retrieved",
        data: deviceStats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/trends
   * Get event trends
   */
  static async getEventTrends(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { days = 30 } = req.query;

      // Validate ObjectId format
      validateObjectId(restaurantId);

      // Validate days parameter
      const daysNum = parseInt(days as string) || 30;
      if (daysNum <= 0 || daysNum > 365) {
        throw new AppError(400, "Days must be between 1 and 365");
      }

      // Verify ownership
      const { Restaurant } = await import("../models/index.js");
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to view these analytics",
        );
      }

      const trends = await AnalyticsService.getEventTrends(
        restaurantId,
        daysNum,
      );

      res.status(200).json({
        success: true,
        message: "Trends retrieved",
        data: { trends },
      });
    } catch (error) {
      next(error);
    }
  }
}
