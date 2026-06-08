import { Request, Response, NextFunction } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { AppError } from "../middleware/errorHandler";
import { validateObjectId } from "../utils/validation";
import { Restaurant } from "../models";
import logger from "../utils/logger";

/**
 * ENGAGEMENT-ONLY ANALYTICS CONTROLLER
 * All endpoints track menu engagement, NOT orders or revenue
 */
export class AnalyticsController {
  private static dashboardRequestCount = 0;

  private static getDateRange(rangeValue: unknown): {
    startDate: Date;
    endDate: Date;
    range: "24h" | "7d" | "30d" | "all";
  } {
    const range = typeof rangeValue === "string" ? rangeValue : "30d";
    const endDate = new Date();

    switch (range) {
      case "24h": {
        return {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endDate,
          range,
        };
      }
      case "7d": {
        return {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate,
          range,
        };
      }
      case "30d": {
        return {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate,
          range,
        };
      }
      case "all": {
        return {
          startDate: new Date(0),
          endDate,
          range,
        };
      }
      default:
        throw new AppError(400, "range must be one of 24h, 7d, 30d, or all");
    }
  }

  /**
   * POST /api/analytics/track
   * Track an analytics event (scan, view, ar_view, add_to_cart, etc)
   */
  static async trackEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { restaurantId, eventType, deviceType, sessionId, menuItemId } =
        req.body;
      const { deviceId } = req.body;

      if (!restaurantId || !eventType || !sessionId) {
        throw new AppError(
          400,
          "restaurantId, eventType, and sessionId are required",
        );
      }

      validateObjectId(restaurantId);
      if (menuItemId) validateObjectId(menuItemId);

      const userAgent = req.get("user-agent");
      const ipAddress = req.ip;

      const event = await AnalyticsService.trackEvent(
        restaurantId,
        eventType,
        deviceType || "Web",
        sessionId,
        deviceId,
        menuItemId,
        userAgent,
        ipAddress,
      );

      res.status(201).json({
        success: true,
        message: "Event tracked",
        data: event,
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

      validateObjectId(restaurantId);

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

      validateObjectId(restaurantId);

      const limitNum = parseInt(limit as string) || 10;
      if (limitNum <= 0 || limitNum > 100) {
        throw new AppError(400, "Limit must be between 1 and 100");
      }

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

      validateObjectId(restaurantId);

      const daysNum = parseInt(days as string) || 7;
      if (daysNum <= 0 || daysNum > 365) {
        throw new AppError(400, "Days must be between 1 and 365");
      }

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
   */
  static async getEventTrends(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { days = 30 } = req.query;

      validateObjectId(restaurantId);

      const daysNum = parseInt(days as string) || 30;
      if (daysNum <= 0 || daysNum > 365) {
        throw new AppError(400, "Days must be between 1 and 365");
      }

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

  /**
   * GET /api/analytics/restaurant/:restaurantId/comprehensive
   */
  static async getComprehensiveAnalytics(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;

      validateObjectId(restaurantId);

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to view these analytics",
        );
      }

      const { range = "30d" } = req.query;
      const analyticsRange = typeof range === "string" ? range : "30d";
      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const analytics = await AnalyticsService.getComprehensiveAnalytics(
        restaurantId,
        req.user.userId,
        analyticsRange as "24h" | "7d" | "30d" | "all",
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Comprehensive analytics retrieved",
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/sales-heatmap
   */
  static async getSalesHeatmap(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d", timezone = "UTC" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const heatmap = await AnalyticsService.getSalesHeatmap(
        restaurantId,
        req.user.userId,
        startDate,
        endDate,
        String(timezone || "UTC"),
      );

      res.status(200).json({
        success: true,
        message: "Sales heatmap retrieved",
        data: heatmap,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/category-performance
   */
  static async getCategoryPerformance(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const categoryPerformance = await AnalyticsService.getCategoryPerformance(
        restaurantId,
        req.user.userId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Category performance retrieved",
        data: categoryPerformance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/dashboard
   * Get the full analytics dashboard in a single request
   */
  static async getDashboardAnalytics(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d", timezone = "UTC" } = req.query;

      validateObjectId(restaurantId);

      AnalyticsController.dashboardRequestCount += 1;
      logger.info(
        `Analytics dashboard load request #${AnalyticsController.dashboardRequestCount} for restaurant ${restaurantId} (range=${String(range || "30d")}, timezone=${String(timezone || "UTC")})`,
      );

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const dashboard = await AnalyticsService.getDashboardAnalytics(
        restaurantId,
        req.user.userId,
        typeof range === "string"
          ? (range as "24h" | "7d" | "30d" | "all")
          : "30d",
        startDate,
        endDate,
        String(timezone || "UTC"),
      );

      res.status(200).json({
        success: true,
        message: "Dashboard analytics retrieved",
        data: dashboard,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/item-popularity
   * Get item popularity by cart additions
   */
  static async getItemPopularity(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const popularity = await AnalyticsService.getItemPopularity(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Item popularity retrieved",
        data: popularity,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/engagement-funnel
   * Get engagement funnel: QR scans → Menu opens → Item views → Cart adds
   */
  static async getEngagementFunnel(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const funnel = await AnalyticsService.getEngagementFunnel(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Engagement funnel retrieved",
        data: funnel,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/ar-usage
   * Get AR feature adoption rate
   */
  static async getARUsage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const arUsage = await AnalyticsService.getARUsage(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "AR usage stats retrieved",
        data: arUsage,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/cart-abandonment
   * Get cart abandonment metrics
   */
  static async getCartAbandonment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const abandonment = await AnalyticsService.getCartAbandonment(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Cart abandonment metrics retrieved",
        data: abandonment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/session-duration
   * Get session duration and engagement patterns
   */
  static async getSessionDuration(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const duration = await AnalyticsService.getSessionDuration(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Session duration metrics retrieved",
        data: duration,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/analytics/restaurant/:restaurantId/selection-patterns
   * Get popular item combinations
   */
  static async getSelectionPatterns(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { restaurantId } = req.params;
      const { range = "30d" } = req.query;

      validateObjectId(restaurantId);

      const { startDate, endDate } = AnalyticsController.getDateRange(range);

      const patterns = await AnalyticsService.getSelectionPatterns(
        restaurantId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        message: "Selection patterns retrieved",
        data: patterns,
      });
    } catch (error) {
      next(error);
    }
  }
}
