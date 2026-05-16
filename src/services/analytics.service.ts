import {
  Analytics,
  MenuItem,
  Restaurant,
  Order,
  Review,
  QRCode,
  QRCodeDevice,
} from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import mongoose from "mongoose";

// Typed shapes for common aggregation results used in this service
type RepeatedDevicesAgg = { repeatedDevices: number };
type CartAdditionAgg = {
  _id: mongoose.Types.ObjectId;
  timesAdded: number;
  totalQty: number;
};
type CartRevenueAgg = {
  totalRevenue: number;
  avgSessionRevenue: number;
  sessionsWithCart: number;
};
type ARViewsAgg = { _id: mongoose.Types.ObjectId; arViews: number };
type ItemPopularityAgg = { name: string; orders: number };
type TrendAgg = { _id: { date: string }; total: number };
type DeviceEvent = { deviceType?: string };
type ReviewDoc = { rating?: number };
type MenuItemDoc = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  views?: number;
  arViews?: number;
  clicks?: number;
};

/**
 * ENGAGEMENT-ONLY ANALYTICS SERVICE
 * Tracks menu engagement metrics without revenue/order data
 * Focuses on: Item Popularity, Engagement, AR Usage, Cart Abandonment, Session Duration, Selection Patterns
 */
export class AnalyticsService {
  private static readonly HEATMAP_DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  private static validateTimezone(timezone: string): string {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
      return timezone;
    } catch {
      throw new AppError(400, "Invalid timezone provided");
    }
  }

  /**
   * Compute repeated customers = devices with more than 1 visit
   */
  static async getRepeatedDeviceCount(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      const visitEventTypes = ["view_menu", "view"];

      const analyticsResult = (await Analytics.aggregate([
        {
          $match: {
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            eventType: { $in: visitEventTypes },
            deviceId: { $type: "string", $ne: "" },
            timestamp: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$deviceId",
            visitSessions: { $addToSet: "$sessionId" },
          },
        },
        {
          $match: {
            $expr: { $gt: [{ $size: "$visitSessions" }, 1] },
          },
        },
        {
          $count: "repeatedDevices",
        },
      ])) as RepeatedDevicesAgg[];

      if (analyticsResult.length > 0) {
        return analyticsResult[0].repeatedDevices;
      }

      // Fallback for older sessions that only have QR-device records.
      const qrCodes = await QRCode.find({ restaurantId }).select("_id").lean();
      const qrCodeIds = qrCodes.map(qr => qr._id);

      if (qrCodeIds.length === 0) return 0;

      const result = (await QRCodeDevice.aggregate([
        {
          $match: {
            qrCodeId: { $in: qrCodeIds },
            deviceId: { $ne: null },
            lastSeen: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$deviceId",
            visitCount: { $sum: 1 },
          },
        },
        {
          $match: {
            visitCount: { $gt: 1 },
          },
        },
        {
          $count: "repeatedDevices",
        },
      ])) as RepeatedDevicesAgg[];

      return result.length > 0 ? result[0].repeatedDevices : 0;
    } catch (error) {
      logger.error(`Failed to compute repeated devices: ${error}`);
      return 0;
    }
  }

  /**
   * Track an event (scan, view, ar_view, add_to_cart, etc)
   */
  static async trackEvent(
    restaurantId: string,
    eventType: string,
    deviceType: "iOS" | "Android" | "Web" = "Web",
    sessionId: string,
    deviceId?: string,
    menuItemId?: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<any> {
    try {
      const analytics = new Analytics({
        restaurantId,
        menuItemId,
        deviceId,
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
   * 1. ITEM POPULARITY - Items added to cart count
   */
  static async getItemPopularity(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const cartAdditions = (await Analytics.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: "add_to_cart",
          timestamp: { $gte: startDate, $lte: endDate },
          menuItemId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$menuItemId",
          timesAdded: { $sum: 1 },
          totalQty: { $sum: { $cond: ["$quantity", "$quantity", 1] } },
        },
      },
      { $sort: { timesAdded: -1 } },
      { $limit: 20 },
    ])) as CartAdditionAgg[];

    // Get item names
    const itemIds = cartAdditions.map(c => c._id);
    const menuItems = await MenuItem.find({ _id: { $in: itemIds } })
      .select("_id name category views")
      .lean();
    const itemMap = new Map(menuItems.map(i => [i._id.toString(), i]));

    const popularity = cartAdditions
      .map(c => ({
        itemId: c._id,
        name: itemMap.get(c._id.toString())?.name || "Unknown",
        category: itemMap.get(c._id.toString())?.category || "Unknown",
        timesAddedToCart: c.timesAdded,
        totalQtyIntended: c.totalQty,
        rank: 0,
      }))
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    const items = popularity.map(item => {
      const menuItem = itemMap.get(item.itemId.toString());
      const viewCount = menuItem?.views || 0;
      return {
        menuItemId: item.itemId,
        menuItemName: item.name,
        addToCartCount: item.timesAddedToCart,
        viewCount,
        conversionRate:
          viewCount > 0 ? (item.timesAddedToCart / viewCount) * 100 : 0,
      };
    });

    return {
      items,
      topItems: popularity,
      summary: {
        totalAddToCart: popularity.reduce(
          (sum, i) => sum + i.timesAddedToCart,
          0,
        ),
        averageViewsPerItem:
          popularity.length > 0
            ? Number(
                (
                  popularity.reduce(
                    (sum, i) =>
                      sum + (itemMap.get(i.itemId.toString())?.views || 0),
                    0,
                  ) / popularity.length
                ).toFixed(1),
              )
            : 0,
      },
    };
  }

  /**
   * 2. ENGAGEMENT FUNNEL - QR scans → Menu opens → Item views → Cart adds
   */
  static async getEngagementFunnel(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // Use distinct session counts for each funnel stage to avoid double-counting
    // and inconsistent denominators that can produce >100% conversions.
    const [qrScanSessions, menuOpenSessions, viewSessions, cartSessions] =
      await Promise.all([
        Analytics.distinct("sessionId", {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: "scan",
          timestamp: { $gte: startDate, $lte: endDate },
        }),
        Analytics.distinct("sessionId", {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: { $in: ["view_menu", "view"] },
          timestamp: { $gte: startDate, $lte: endDate },
        }),
        Analytics.distinct("sessionId", {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: "view",
          timestamp: { $gte: startDate, $lte: endDate },
        }),
        Analytics.distinct("sessionId", {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: "add_to_cart",
          timestamp: { $gte: startDate, $lte: endDate },
        }),
      ]);

    const qrScans = qrScanSessions.length;
    const menuOpens = menuOpenSessions.length; // sessions that opened menu or viewed
    const itemViews = viewSessions.length; // sessions that viewed items
    const cartAdds = cartSessions.length; // sessions that added to cart

    // Compute intersections to get proper conversion denominators (sessions that had both events)
    const setScan = new Set(qrScanSessions);
    const setView = new Set(viewSessions);
    const setCart = new Set(cartSessions);

    const sessionsWithScanAndView = menuOpenSessions.filter(s =>
      setScan.has(s),
    ).length;
    const sessionsWithViewAndAdd = viewSessions.filter(s =>
      setCart.has(s),
    ).length;
    const sessionsWithScanAndAdd = qrScanSessions.filter(s =>
      setCart.has(s),
    ).length;

    const funnel = [
      { stage: "scan", count: qrScans, percentage: 100 },
      {
        stage: "view",
        count: menuOpens,
        percentage:
          qrScans > 0
            ? Number(((sessionsWithScanAndView / qrScans) * 100).toFixed(1))
            : 0,
      },
      {
        stage: "add_to_cart",
        count: cartAdds,
        percentage:
          menuOpens > 0
            ? Number(((sessionsWithViewAndAdd / menuOpens) * 100).toFixed(1))
            : 0,
      },
    ];

    return {
      funnel,
      summary: {
        totalScans: qrScans,
        // Use session-intersection denominators to avoid >100% artifacts
        scanToViewConversion:
          qrScans > 0
            ? Number(((sessionsWithScanAndView / qrScans) * 100).toFixed(1))
            : 0,
        viewToAddConversion:
          itemViews > 0
            ? Number(((sessionsWithViewAndAdd / itemViews) * 100).toFixed(1))
            : 0,
        endToEndConversion:
          qrScans > 0
            ? Number(((sessionsWithScanAndAdd / qrScans) * 100).toFixed(1))
            : 0,
      },
    };
  }

  /**
   * 3. AR USAGE - % of sessions that used 3D/AR view
   */
  static async getARUsage(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const [totalSessions, arSessions] = await Promise.all([
      Analytics.distinct("sessionId", {
        restaurantId,
        eventType: { $in: ["scan", "view", "view_menu"] },
        timestamp: { $gte: startDate, $lte: endDate },
      }),
      Analytics.distinct("sessionId", {
        restaurantId,
        eventType: "ar_view",
        timestamp: { $gte: startDate, $lte: endDate },
      }),
    ]);

    const arUsageRate =
      totalSessions.length > 0
        ? ((arSessions.length / totalSessions.length) * 100).toFixed(1)
        : 0;

    // AR views by item
    const arViewsByItem = (await Analytics.aggregate([
      {
        $match: {
          restaurantId,
          eventType: "ar_view",
          timestamp: { $gte: startDate, $lte: endDate },
          menuItemId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$menuItemId",
          arViews: { $sum: 1 },
        },
      },
      { $sort: { arViews: -1 } },
      { $limit: 10 },
    ])) as ARViewsAgg[];

    const itemIds = arViewsByItem.map(a => a._id);
    const items = await MenuItem.find({ _id: { $in: itemIds } })
      .select("_id name")
      .lean();
    const itemMap = new Map(items.map(i => [i._id.toString(), i]));

    const topARItems = arViewsByItem.map(a => ({
      itemId: a._id,
      name: itemMap.get(a._id.toString())?.name || "Unknown",
      arViews: a.arViews,
    }));

    const noARSessions = Math.max(totalSessions.length - arSessions.length, 0);

    return {
      usageStats: {
        totalSessions: totalSessions.length,
        sessionsUsingAR: arSessions.length,
        percentageUsingAR: Number(arUsageRate),
        avgARViewsPerSession:
          arSessions.length > 0
            ? Number(
                (
                  topARItems.reduce((sum, item) => sum + item.arViews, 0) /
                  arSessions.length
                ).toFixed(2),
              )
            : 0,
      },
      breakdown: [
        {
          label: "Using AR",
          value: arSessions.length,
          percentage:
            totalSessions.length > 0
              ? Number(
                  ((arSessions.length / totalSessions.length) * 100).toFixed(1),
                )
              : 0,
        },
        {
          label: "Not Using AR",
          value: noARSessions,
          percentage:
            totalSessions.length > 0
              ? Number(((noARSessions / totalSessions.length) * 100).toFixed(1))
              : 0,
        },
      ],
      topARItems,
    };
  }

  /**
   * 4. CART ABANDONMENT - Sessions with carts but no orders
   */
  static async getCartAbandonment(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // Get sessions with cart additions
    const cartSessions = await Analytics.distinct("sessionId", {
      restaurantId,
      eventType: "add_to_cart",
      timestamp: { $gte: startDate, $lte: endDate },
    });

    // Get sessions explicitly marked as abandoned in the engagement stream
    const abandonedSessions = await Analytics.distinct("sessionId", {
      restaurantId,
      eventType: "cart_abandoned",
      timestamp: { $gte: startDate, $lte: endDate },
    });

    const abandonedFromCart = cartSessions.filter(s =>
      abandonedSessions.includes(s),
    );
    const abandonedCount =
      abandonedSessions.length > 0
        ? abandonedSessions.length
        : abandonedFromCart.length;

    const cartAbandonmentRate =
      cartSessions.length > 0
        ? ((abandonedCount / cartSessions.length) * 100).toFixed(1)
        : 0;

    // Cart size analysis for abandoned carts
    const cartValues = await Analytics.aggregate([
      {
        $match: {
          restaurantId,
          eventType: "add_to_cart",
          timestamp: { $gte: startDate, $lte: endDate },
          sessionId: {
            $in:
              abandonedSessions.length > 0
                ? abandonedSessions
                : abandonedFromCart,
          },
        },
      },
      {
        $group: {
          _id: "$sessionId",
          cartValue: { $sum: 1 }, // Count of items
        },
      },
    ]);

    const avgAbandonedCartSize =
      cartValues.length > 0
        ? (
            cartValues.reduce((sum, c) => sum + c.cartValue, 0) /
            cartValues.length
          ).toFixed(2)
        : 0;

    return {
      abandonmentRate: Number(cartAbandonmentRate),
      sessionStats: {
        totalSessions: cartSessions.length,
        sessionsWithCarts: cartSessions.length,
        abandonedCarts: abandonedCount,
      },
      trendData: [],
      summary: {
        totalCartsCreated: cartSessions.length,
        abandonedCarts: abandonedCount,
        abandonmentRate: Number(cartAbandonmentRate),
        avgAbandonedCartSize: Number(avgAbandonedCartSize),
      },
    };
  }

  /**
   * 5. SESSION DURATION - Avg time spent on menu
   */
  static async getSessionDuration(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);

    const sessions = await Analytics.aggregate([
      {
        $match: {
          restaurantId: restaurantObjectId,
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$sessionId",
          firstEvent: { $min: "$timestamp" },
          lastEvent: { $max: "$timestamp" },
          eventCount: { $sum: 1 },
          hasAR: {
            $max: {
              $cond: [{ $eq: ["$eventType", "ar_view"] }, 1, 0],
            },
          },
          hasCart: {
            $max: {
              $cond: [{ $eq: ["$eventType", "add_to_cart"] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          durationMs: { $subtract: ["$lastEvent", "$firstEvent"] },
          durationSec: {
            $divide: [{ $subtract: ["$lastEvent", "$firstEvent"] }, 1000],
          },
          durationMin: {
            $divide: [{ $subtract: ["$lastEvent", "$firstEvent"] }, 60000],
          },
          eventCount: 1,
          hasAR: 1,
          hasCart: 1,
        },
      },
    ]);

    const totalDuration = sessions.reduce((sum, s) => sum + s.durationMin, 0);
    const avgDurationMin =
      sessions.length > 0
        ? Number((totalDuration / sessions.length).toFixed(2))
        : 0;

    const sessionsWithAR = sessions.filter(s => s.hasAR).length;
    const sessionsWithCart = sessions.filter(s => s.hasCart).length;

    // Duration segmentation
    const shortSessions = sessions.filter(s => s.durationMin < 1).length; // < 1 min
    const mediumSessions = sessions.filter(
      s => s.durationMin >= 1 && s.durationMin < 5,
    ).length; // 1-5 min
    const longSessions = sessions.filter(s => s.durationMin >= 5).length; // > 5 min

    return {
      summary: {
        totalSessions: sessions.length,
        avgDurationMin,
        avgEventsPerSession:
          sessions.length > 0
            ? Number(
                (
                  sessions.reduce((sum, s) => sum + s.eventCount, 0) /
                  sessions.length
                ).toFixed(1),
              )
            : 0,
      },
      segmentation: {
        shortSessions: {
          count: shortSessions,
          percentage:
            sessions.length > 0
              ? Number(((shortSessions / sessions.length) * 100).toFixed(1))
              : 0,
        },
        mediumSessions: {
          count: mediumSessions,
          percentage:
            sessions.length > 0
              ? Number(((mediumSessions / sessions.length) * 100).toFixed(1))
              : 0,
        },
        longSessions: {
          count: longSessions,
          percentage:
            sessions.length > 0
              ? Number(((longSessions / sessions.length) * 100).toFixed(1))
              : 0,
        },
      },
      engagement: {
        sessionsWithAR,
        sessionsAddingToCart: sessionsWithCart,
      },
    };
  }

  /**
   * 6. SELECTION PATTERNS - Popular item combinations
   */
  static async getSelectionPatterns(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // Get all cart sessions and their items
    const sessionCarts = await Analytics.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          eventType: "add_to_cart",
          timestamp: { $gte: startDate, $lte: endDate },
          menuItemId: { $ne: null },
        },
      },
      {
        $sort: { timestamp: 1 },
      },
      {
        $group: {
          _id: "$sessionId",
          items: { $push: "$menuItemId" },
        },
      },
    ]);

    // Count item pairs (combos)
    const comboPairs = new Map<string, number>();
    sessionCarts.forEach(session => {
      const items = session.items;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const pair = [items[i].toString(), items[j].toString()]
            .sort()
            .join("||");
          comboPairs.set(pair, (comboPairs.get(pair) || 0) + 1);
        }
      }
    });

    // Get top 10 combos
    const topCombos = Array.from(comboPairs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pair, count]) => {
        const [id1, id2] = pair.split("||");
        return { itemId1: id1, itemId2: id2, frequency: count };
      });

    // Get item names
    const allItemIds = topCombos.flatMap(c => [c.itemId1, c.itemId2]);
    const items = await MenuItem.find({
      _id: { $in: allItemIds },
    })
      .select("_id name")
      .lean();
    const itemMap = new Map(items.map(i => [i._id.toString(), i]));

    const combos = topCombos.map((combo, idx) => ({
      rank: idx + 1,
      item1: itemMap.get(combo.itemId1)?.name || "Unknown",
      item2: itemMap.get(combo.itemId2)?.name || "Unknown",
      frequency: combo.frequency,
      cartSessions: sessionCarts.length,
      percentage:
        sessionCarts.length > 0
          ? Number(((combo.frequency / sessionCarts.length) * 100).toFixed(1))
          : 0,
    }));

    const patterns = combos.map(combo => ({
      items: [combo.item1, combo.item2],
      frequency: combo.frequency,
      percentage: combo.percentage,
    }));

    return {
      patterns,
      topCombos: combos,
      summary: {
        totalCombinations: patterns.length,
        mostCommonCombo: patterns.length > 0 ? patterns[0].items : [],
        avgItemsPerCart:
          sessionCarts.length > 0
            ? Number(
                (
                  sessionCarts.reduce(
                    (sum, session) => sum + session.items.length,
                    0,
                  ) / sessionCarts.length
                ).toFixed(2),
              )
            : 0,
      },
    };
  }

  /**
   * Get original comprehensive dashboard analytics.
   */
  static async getComprehensiveAnalytics(
    restaurantId: string,
    ownerId: string,
  ): Promise<any> {
    try {
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
        throw new AppError(
          403,
          "You do not have permission to view these analytics",
        );
      }

      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const [
        qrScanEvents,
        arViewEvents,
        allSessionIds,
        cartSessionIds,
        addToCartEvents,
        cartRevenueSummary,
        deviceAnalytics,
        orders,
        reviews,
        qrCodeDocs,
        menuItems,
      ] = await Promise.all([
        Analytics.countDocuments({
          restaurantId,
          eventType: "scan",
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }),
        Analytics.countDocuments({
          restaurantId,
          eventType: "ar_view",
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }),
        Analytics.distinct("sessionId", {
          restaurantId,
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }),
        Analytics.distinct("sessionId", {
          restaurantId,
          eventType: "add_to_cart",
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }),
        Analytics.countDocuments({
          restaurantId,
          eventType: "add_to_cart",
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }),
        Analytics.aggregate([
          {
            $match: {
              restaurantId: new mongoose.Types.ObjectId(restaurantId),
              eventType: { $in: ["add_to_cart", "remove_from_cart"] },
              timestamp: { $gte: monthStart, $lte: monthEnd },
              menuItemId: { $ne: null },
            },
          },
          {
            $lookup: {
              from: "menuitems",
              localField: "menuItemId",
              foreignField: "_id",
              as: "item",
            },
          },
          {
            $unwind: {
              path: "$item",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $addFields: {
              quantityValue: { $ifNull: ["$quantity", 1] },
              itemPrice: { $ifNull: ["$item.price", 0] },
            },
          },
          {
            $project: {
              sessionId: 1,
              lineRevenue: {
                $multiply: [
                  "$quantityValue",
                  "$itemPrice",
                  {
                    $cond: [{ $eq: ["$eventType", "remove_from_cart"] }, -1, 1],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$sessionId",
              sessionRevenueRaw: { $sum: "$lineRevenue" },
            },
          },
          {
            $project: {
              sessionRevenue: {
                $cond: [
                  { $lt: ["$sessionRevenueRaw", 0] },
                  0,
                  "$sessionRevenueRaw",
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$sessionRevenue" },
              avgSessionRevenue: { $avg: "$sessionRevenue" },
              sessionsWithCart: { $sum: 1 },
            },
          },
        ]) as any,
        Analytics.find({
          restaurantId,
          timestamp: { $gte: monthStart, $lte: monthEnd },
        }).select("deviceType") as any,
        Order.find({
          restaurantId,
          createdAt: { $gte: monthStart, $lte: monthEnd },
          status: "completed",
        }) as any,
        Review.find({
          restaurantId,
          createdAt: { $gte: monthStart, $lte: monthEnd },
        }) as any,
        QRCode.find({ restaurantId }).select("totalScans").lean() as any,
        MenuItem.find({ restaurantId })
          .select("_id name views arViews clicks")
          .lean() as any,
      ] as const);

      // Typed aliases to avoid unsafe 'any' usage from mongoose
      const deviceAnalyticsTyped = deviceAnalytics as DeviceEvent[];
      const reviewsTyped = reviews as ReviewDoc[];
      const menuItemsTyped = menuItems as MenuItemDoc[];
      const cartRevenueSummaryTyped = cartRevenueSummary as CartRevenueAgg[];

      // Get distinct sessions that visited the page (used as denominator for Visits -> add_to_cart conversion)
      const visitingSessionIds = await Analytics.distinct("sessionId", {
        restaurantId,
        eventType: { $in: ["view_menu", "view"] },
        timestamp: { $gte: monthStart, $lte: monthEnd },
      });

      const qrCodeFallbackScans = qrCodeDocs.reduce(
        (sum, qr) => sum + (qr.totalScans || 0),
        0,
      );
      const menuTotalViews = menuItemsTyped.reduce(
        (sum, item) => sum + (item.views || 0),
        0,
      );
      const menuTotalArViews = menuItemsTyped.reduce(
        (sum, item) => sum + (item.arViews || 0),
        0,
      );
      const distinctVisitedFallback = menuItemsTyped.filter(
        item => (item.views || 0) > 0 || (item.arViews || 0) > 0,
      ).length;

      const qrScans =
        qrScanEvents > 0
          ? qrScanEvents
          : qrCodeFallbackScans || restaurant.totalScans || 0;
      const arViews = arViewEvents > 0 ? arViewEvents : menuTotalArViews;
      const uniqueDeviceCustomers =
        qrCodeDocs[0]?.uniqueDevices || allSessionIds.length || 0;

      // Get device breakdown
      const deviceStats = { iOS: 0, Android: 0, Web: 0 };
      deviceAnalyticsTyped.forEach(event => {
        if (event.deviceType && event.deviceType in deviceStats) {
          deviceStats[event.deviceType as keyof typeof deviceStats]++;
        }
      });

      // Calculate average rating
      const avgRating =
        reviewsTyped.length > 0
          ? (
              reviewsTyped.reduce((sum, r) => sum + (r.rating || 0), 0) /
              reviewsTyped.length
            ).toFixed(1)
          : "N/A";

      // Get top items by views
      const topItems = (await MenuItem.find({ restaurantId })
        .select("name views arViews clicks")
        .sort({ views: -1 })
        .limit(10)
        .lean()) as MenuItemDoc[];

      // Get dish visit count (distinct items viewed)
      const dishesViewed = await Analytics.distinct("menuItemId", {
        restaurantId,
        eventType: { $in: ["view", "ar_view"] },
        timestamp: { $gte: monthStart, $lte: monthEnd },
      });
      const totalDishesVisited = Math.max(
        dishesViewed.length,
        distinctVisitedFallback,
      );

      // Get popular/least popular items
      const itemPopularity = (await Analytics.aggregate([
        {
          $match: {
            restaurantId,
            eventType: "add_to_cart",
            timestamp: { $gte: monthStart, $lte: monthEnd },
          },
        },
        {
          $group: {
            _id: "$menuItemId",
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "menuitems",
            localField: "_id",
            foreignField: "_id",
            as: "item",
          },
        },
        {
          $unwind: "$item",
        },
        {
          $project: {
            name: "$item.name",
            orders: "$count",
          },
        },
      ])) as ItemPopularityAgg[];

      const sortedItems = (itemPopularity as ItemPopularityAgg[]).sort(
        (a, b) => b.orders - a.orders,
      );
      const mostPopularDish = sortedItems.length > 0 ? sortedItems[0] : null;
      const leastPopularDish =
        sortedItems.length > 0 ? sortedItems[sortedItems.length - 1] : null;
      const fallbackPopularity = menuItemsTyped
        .map(item => ({
          itemId: String(item._id),
          name: item.name,
          orders: (item.views || 0) + (item.arViews || 0) + (item.clicks || 0),
        }))
        .sort((a, b) => b.orders - a.orders);

      const popularitySource =
        sortedItems.length > 0 ? sortedItems : fallbackPopularity;
      const topDishes = popularitySource.slice(0, 5);
      const bottomDishes = popularitySource.slice(-5).reverse();

      // Get daily trends
      const trends = (await Analytics.aggregate([
        {
          $match: {
            restaurantId,
            timestamp: { $gte: monthStart, $lte: monthEnd },
          },
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$timestamp",
                },
              },
            },
            total: { $sum: 1 },
          },
        },
        {
          $sort: { "_id.date": 1 },
        },
      ])) as TrendAgg[];

      // Calculate customer metrics
      // Use distinct sessions that added to cart (cartSessionIds) over distinct scanning sessions
      // This counts "people who added items to cart" regardless of whether they completed an order.
      const totalOrders = orders.length; // keep orders separate
      const totalAddToCartEvents = addToCartEvents;
      const cartRevenue = cartRevenueSummaryTyped?.[0] || null;
      const estimatedSales = Number(
        (cartRevenue?.totalRevenue || 0).toFixed(2),
      );
      const avgOrderValue = Number(
        ((cartRevenue?.avgSessionRevenue || 0) as number).toFixed(2),
      );

      let conversionRate = "0";
      if (visitingSessionIds && visitingSessionIds.length > 0) {
        conversionRate = (
          (cartSessionIds.length / visitingSessionIds.length) *
          100
        ).toFixed(1);
      } else if (menuTotalViews > 0) {
        // Fallback: use aggregate menu counters if no session events are available
        conversionRate = (
          (cartSessionIds.length / menuTotalViews) *
          100
        ).toFixed(1);
      } else if (qrScans > 0) {
        // Final fallback: use qrScans
        conversionRate = ((cartSessionIds.length / qrScans) * 100).toFixed(1);
      }

      // Estimate customer metrics
      const newCustomers = uniqueDeviceCustomers;
      const repeatedCustomers = await this.getRepeatedDeviceCount(
        restaurantId,
        monthStart,
        monthEnd,
      );

      // Attach selection patterns (popular combos) to the comprehensive payload
      const selectionPatterns = await this.getSelectionPatterns(
        restaurantId,
        monthStart,
        monthEnd,
      );

      return {
        period: {
          month: monthStart.toLocaleString("default", { month: "long" }),
          year: monthStart.getFullYear(),
        },
        summary: {
          totalQRScans: qrScans,
          totalDishesVisited,
          total3DModelViews: arViews,
          totalOrders,
          totalAddToCartEvents,
          estimatedSales,
          avgOrderValue,
        },
        customers: {
          conversionRate: parseFloat(conversionRate as string),
          newCustomers,
          repeatedCustomers,
          totalUniqueCustomers: uniqueDeviceCustomers,
          uniqueSessionsThisMonth: uniqueDeviceCustomers,
        },
        popularity: {
          mostPopularDish,
          leastPopularDish,
          topDishes,
          bottomDishes,
        },
        devices: deviceStats,
        topItems: topItems.map(item => ({
          name: item.name,
          views: item.views || 0,
        })),
        trends,
        averageRating: avgRating,
        engagement: {
          cartSessions: cartSessionIds.length,
          visitingSessions: visitingSessionIds.length,
          engagementRate:
            visitingSessionIds && visitingSessionIds.length > 0
              ? Number(
                  (
                    (cartSessionIds.length / visitingSessionIds.length) *
                    100
                  ).toFixed(1),
                )
              : 0,
        },
        selectionPatterns,
      };
    } catch (error) {
      logger.error(`Analytics error: ${error}`);
      throw error;
    }
  }

  static async getRestaurantAnalytics(
    restaurantId: string,
    ownerId: string,
    days: number = 7,
  ): Promise<any> {
    return this.getComprehensiveAnalytics(restaurantId, ownerId);
  }

  static async getSalesHeatmap(
    restaurantId: string,
    ownerId: string,
    days: number = 30,
    timezone: string = "UTC",
  ): Promise<any> {
    const restaurant =
      await Restaurant.findById(restaurantId).select("ownerId");
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view these analytics",
      );
    }

    const safeTimezone = this.validateTimezone(timezone);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const rows = await Order.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          status: "completed",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            dayOfWeek: {
              $dayOfWeek: { date: "$createdAt", timezone: safeTimezone },
            },
            hourOfDay: {
              $hour: { date: "$createdAt", timezone: safeTimezone },
            },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
          quantity: { $sum: "$quantity" },
        },
      },
      { $sort: { "_id.dayOfWeek": 1, "_id.hourOfDay": 1 } },
    ]);

    const matrix = this.HEATMAP_DAYS.map(day => ({
      day,
      cells: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        hourLabel: `${String(hour).padStart(2, "0")}:00`,
        orders: 0,
        revenue: 0,
        quantity: 0,
      })),
      totalOrders: 0,
      totalRevenue: 0,
    }));

    const hourTotals = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, "0")}:00`,
      orders: 0,
      revenue: 0,
      quantity: 0,
    }));

    let totalOrders = 0;
    let totalRevenue = 0;
    let maxCellRevenue = 0;
    let maxCellOrders = 0;

    rows.forEach(row => {
      const dayIdx = Number(row._id.dayOfWeek) - 1;
      const hour = Number(row._id.hourOfDay);
      if (dayIdx < 0 || dayIdx > 6 || hour < 0 || hour > 23) return;

      const orders = Number(row.orders || 0);
      const revenue = Number(row.revenue || 0);
      const quantity = Number(row.quantity || 0);

      matrix[dayIdx].cells[hour] = {
        hour,
        hourLabel: `${String(hour).padStart(2, "0")}:00`,
        orders,
        revenue,
        quantity,
      };

      matrix[dayIdx].totalOrders += orders;
      matrix[dayIdx].totalRevenue += revenue;

      hourTotals[hour].orders += orders;
      hourTotals[hour].revenue += revenue;
      hourTotals[hour].quantity += quantity;

      totalOrders += orders;
      totalRevenue += revenue;

      if (revenue > maxCellRevenue) maxCellRevenue = revenue;
      if (orders > maxCellOrders) maxCellOrders = orders;
    });

    const peakHour = hourTotals.reduce(
      (best, curr) => (curr.revenue > best.revenue ? curr : best),
      hourTotals[0],
    );

    const peakDay = matrix.reduce(
      (best, curr) => (curr.totalRevenue > best.totalRevenue ? curr : best),
      matrix[0],
    );

    const populatedCells = matrix.reduce(
      (sum, row) => sum + row.cells.filter(c => c.orders > 0).length,
      0,
    );

    return {
      meta: {
        timezone: safeTimezone,
        rangeDays: days,
        startDate,
        endDate,
      },
      summary: {
        totalOrders,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        averageOrderValue:
          totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
        dataCoveragePct: Number(((populatedCells / (7 * 24)) * 100).toFixed(2)),
      },
      peaks: {
        hour: {
          ...peakHour,
        },
        day: {
          day: peakDay.day,
          totalOrders: peakDay.totalOrders,
          totalRevenue: Number(peakDay.totalRevenue.toFixed(2)),
        },
      },
      max: {
        cellRevenue: Number(maxCellRevenue.toFixed(2)),
        cellOrders: maxCellOrders,
      },
      dayOrder: this.HEATMAP_DAYS,
      hourOrder: hourTotals.map(h => ({
        hour: h.hour,
        hourLabel: h.hourLabel,
      })),
      heatmap: matrix,
      hourTotals: hourTotals.map(h => ({
        ...h,
        revenue: Number(h.revenue.toFixed(2)),
      })),
    };
  }

  static async getCategoryPerformance(
    restaurantId: string,
    ownerId: string,
    days: number = 30,
  ): Promise<any> {
    const restaurant =
      await Restaurant.findById(restaurantId).select("ownerId");
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view these analytics",
      );
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const menuItems = await MenuItem.find({ restaurantId })
      .select("_id name category views arViews")
      .lean();

    const itemMeta = new Map(menuItems.map(item => [String(item._id), item]));

    const [ordersByItem, viewsByItem] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$menuItemId",
            orders: { $sum: 1 },
            quantity: { $sum: "$quantity" },
            revenue: { $sum: "$totalPrice" },
          },
        },
      ]),
      Analytics.aggregate([
        {
          $match: {
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            eventType: { $in: ["view", "ar_view"] },
            timestamp: { $gte: startDate, $lte: endDate },
            menuItemId: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$menuItemId",
            views: { $sum: 1 },
          },
        },
      ]),
    ]);

    const categoryMap = new Map<
      string,
      {
        category: string;
        orders: number;
        quantity: number;
        revenue: number;
        views: number;
        menuItemCount: number;
      }
    >();

    const ensureCategory = (categoryRaw?: string) => {
      const category =
        (categoryRaw || "Uncategorized").trim() || "Uncategorized";
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          orders: 0,
          quantity: 0,
          revenue: 0,
          views: 0,
          menuItemCount: 0,
        });
      }
      return categoryMap.get(category)!;
    };

    menuItems.forEach(item => {
      const metric = ensureCategory(item.category);
      metric.menuItemCount += 1;
    });

    ordersByItem.forEach(row => {
      const itemId = String(row._id);
      const meta = itemMeta.get(itemId);
      const metric = ensureCategory(meta?.category);
      metric.orders += Number(row.orders || 0);
      metric.quantity += Number(row.quantity || 0);
      metric.revenue += Number(row.revenue || 0);
    });

    viewsByItem.forEach(row => {
      const itemId = String(row._id);
      const meta = itemMeta.get(itemId);
      const metric = ensureCategory(meta?.category);
      metric.views += Number(row.views || 0);
    });

    const totalTrackedViews = Array.from(categoryMap.values()).reduce(
      (sum, item) => sum + item.views,
      0,
    );

    let viewSource: "events" | "menu-item-counters" = "events";
    if (totalTrackedViews === 0) {
      viewSource = "menu-item-counters";
      menuItems.forEach(item => {
        const metric = ensureCategory(item.category);
        metric.views += Number(item.views || 0) + Number(item.arViews || 0);
      });
    }

    const categories = Array.from(categoryMap.values())
      .map(metric => {
        const aov = metric.orders > 0 ? metric.revenue / metric.orders : 0;
        const conversionRate =
          metric.views > 0 ? (metric.orders / metric.views) * 100 : 0;

        return {
          category: metric.category,
          menuItemCount: metric.menuItemCount,
          orders: metric.orders,
          quantity: metric.quantity,
          views: metric.views,
          revenue: Number(metric.revenue.toFixed(2)),
          averageOrderValue: Number(aov.toFixed(2)),
          conversionRate: Number(conversionRate.toFixed(2)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .map((entry, idx) => ({ rank: idx + 1, ...entry }));

    const totals = categories.reduce(
      (acc, item) => {
        acc.revenue += item.revenue;
        acc.orders += item.orders;
        acc.views += item.views;
        acc.quantity += item.quantity;
        acc.categories += 1;
        return acc;
      },
      { revenue: 0, orders: 0, views: 0, quantity: 0, categories: 0 },
    );

    const topRevenueCategory = categories[0] || null;
    const bestConversionCategory =
      categories
        .filter(c => c.views > 0)
        .sort((a, b) => b.conversionRate - a.conversionRate)[0] || null;

    const weakestCategory =
      categories
        .filter(c => c.views > 0)
        .sort((a, b) => a.conversionRate - b.conversionRate)[0] || null;

    return {
      meta: {
        rangeDays: days,
        startDate,
        endDate,
        viewSource,
      },
      summary: {
        totalRevenue: Number(totals.revenue.toFixed(2)),
        totalOrders: totals.orders,
        totalViews: totals.views,
        totalQuantity: totals.quantity,
        categoryCount: totals.categories,
        averageOrderValue:
          totals.orders > 0
            ? Number((totals.revenue / totals.orders).toFixed(2))
            : 0,
        overallConversionRate:
          totals.views > 0
            ? Number(((totals.orders / totals.views) * 100).toFixed(2))
            : 0,
      },
      insights: {
        topRevenueCategory,
        bestConversionCategory,
        weakestCategory,
      },
      categories,
    };
  }

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
    }));
  }

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

  static async getEventTrends(
    restaurantId: string,
    days: number = 30,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.getDailyTrends(restaurantId, startDate);
  }

  private static async getDailyTrends(
    restaurantId: string,
    monthStart: Date,
  ): Promise<any[]> {
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );

    return await Analytics.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          timestamp: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
          },
          scans: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "scan"] }, 1, 0],
            },
          },
          views: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "view"] }, 1, 0],
            },
          },
          arViews: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "ar_view"] }, 1, 0],
            },
          },
          shares: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "share"] }, 1, 0],
            },
          },
          total: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);
  }
}
