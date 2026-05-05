import { Analytics, MenuItem, Restaurant } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";

export class AnalyticsService {
  /**
   * Track an event (view, click, AR view, share, scan)
   */
  static async trackEvent(
    restaurantId: string,
    eventType: "scan" | "view" | "ar_view" | "share",
    deviceType: "iOS" | "Android" | "Web" = "Web",
    sessionId: string,
    menuItemId?: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<any> {
    try {
      const analytics = new Analytics({
        restaurantId,
        menuItemId,
        eventType,
        deviceType,
        sessionId,
        userAgent: userAgent || "",
        ipAddress: ipAddress || "",
        timestamp: new Date(),
      });

      await analytics.save();

      logger.info(
        `Analytics event tracked: ${eventType} for restaurant: ${restaurantId}`,
      );

      return analytics.toObject();
    } catch (error) {
      logger.error(`Failed to track analytics: ${error}`);
      throw new AppError(500, "Failed to track event");
    }
  }

  /**
   * Get restaurant analytics dashboard
   */
  static async getRestaurantAnalytics(
    restaurantId: string,
    ownerId: string,
    days: number = 7,
  ): Promise<any> {
    // Verify ownership
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view these analytics",
      );
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await Analytics.find({
      restaurantId,
      timestamp: { $gte: startDate },
    });

    // Aggregate by event type
    const eventTypeStats = {
      scan: 0,
      view: 0,
      ar_view: 0,
      share: 0,
    };

    const deviceStats = {
      iOS: 0,
      Android: 0,
      Web: 0,
    };

    const dailyStats: { [key: string]: number } = {};

    events.forEach(event => {
      eventTypeStats[event.eventType as keyof typeof eventTypeStats]++;
      deviceStats[event.deviceType as keyof typeof deviceStats]++;

      const dateKey = event.timestamp.toISOString().split("T")[0];
      dailyStats[dateKey] = (dailyStats[dateKey] || 0) + 1;
    });

    return {
      restaurantId,
      period: `Last ${days} days`,
      totalEvents: events.length,
      eventTypeBreakdown: eventTypeStats,
      deviceBreakdown: deviceStats,
      dailyBreakdown: dailyStats,
      menuItemStats: await this.getMenuItemAnalytics(restaurantId, days),
    };
  }

  /**
   * Get individual menu item analytics
   */
  static async getMenuItemAnalytics(
    restaurantId: string,
    days: number = 7,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const menuItems = await MenuItem.find({ restaurantId });

    const itemAnalytics = await Promise.all(
      menuItems.map(async item => {
        const events = await Analytics.find({
          menuItemId: item._id,
          timestamp: { $gte: startDate },
        });

        return {
          menuItemId: item._id,
          name: item.name,
          views: events.filter(e => e.eventType === "view").length,
          arViews: events.filter(e => e.eventType === "ar_view").length,
          shares: events.filter(e => e.eventType === "share").length,
          clicks: item.clicks,
          totalEvents: events.length,
        };
      }),
    );

    return itemAnalytics.sort((a, b) => b.totalEvents - a.totalEvents);
  }

  /**
   * Get top performing menu items
   */
  static async getTopMenuItems(
    restaurantId: string,
    limit: number = 10,
  ): Promise<any> {
    const menuItems = await MenuItem.find({ restaurantId })
      .sort({ views: -1, arViews: -1, clicks: -1 })
      .limit(limit);

    return menuItems.map(item => ({
      menuItemId: item._id,
      name: item.name,
      views: item.views,
      arViews: item.arViews,
      clicks: item.clicks,
      avgTimeViewed: item.avgTimeViewed,
    }));
  }

  /**
   * Get device breakdown
   */
  static async getDeviceBreakdown(
    restaurantId: string,
    days: number = 7,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await Analytics.find({
      restaurantId,
      timestamp: { $gte: startDate },
    });

    const breakdown = {
      iOS: 0,
      Android: 0,
      Web: 0,
    };

    events.forEach(event => {
      breakdown[event.deviceType as keyof typeof breakdown]++;
    });

    const total = events.length;

    return {
      breakdown,
      percentages: {
        iOS: total > 0 ? ((breakdown.iOS / total) * 100).toFixed(2) : 0,
        Android: total > 0 ? ((breakdown.Android / total) * 100).toFixed(2) : 0,
        Web: total > 0 ? ((breakdown.Web / total) * 100).toFixed(2) : 0,
      },
    };
  }

  /**
   * Get event trends
   */
  static async getEventTrends(
    restaurantId: string,
    days: number = 30,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await Analytics.aggregate([
      {
        $match: {
          restaurantId: new (require("mongoose").Types.ObjectId)(restaurantId),
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            eventType: "$eventType",
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    return events;
  }

  /**
   * Clear analytics (for testing)
   */
  static async clearAnalytics(restaurantId: string): Promise<any> {
    const result = await Analytics.deleteMany({ restaurantId });

    logger.info(`Analytics cleared for restaurant: ${restaurantId}`);

    return result;
  }
}
