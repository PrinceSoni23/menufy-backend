import { MenuItem, QRCode, Restaurant } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import { IRestaurant } from "../types";
import { generatePublicUrl } from "../utils/urlGenerator";

export class RestaurantService {
  /**
   * Get a live dashboard summary for an owner.
   * Computes values from the source collections so production dashboards
   * do not rely on stale counters stored on restaurant documents.
   */
  static async getOwnerDashboardSummary(ownerId: string): Promise<any> {
    const restaurants = await Restaurant.find({ ownerId })
      .select("_id isActive")
      .lean();

    const restaurantIds = restaurants.map(restaurant => restaurant._id);
    const activeRestaurants = restaurants.filter(
      restaurant => restaurant.isActive !== false,
    ).length;

    if (restaurantIds.length === 0) {
      return {
        totalRestaurants: 0,
        totalMenuItems: 0,
        totalQRScans: 0,
        totalModelViews: 0,
        modelViewsTrend: 0,
      };
    }

    // Calculate current month boundaries
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const previousMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );

    const [totalMenuItems, qrCodes, modelViewStats] = await Promise.all([
      MenuItem.countDocuments({ restaurantId: { $in: restaurantIds } }),
      QRCode.find({ restaurantId: { $in: restaurantIds } })
        .select("totalScans")
        .lean(),
      MenuItem.aggregate([
        { $match: { restaurantId: { $in: restaurantIds } } },
        {
          $facet: {
            currentMonth: [
              {
                $match: {
                  createdAt: { $gte: currentMonthStart },
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: { $ifNull: ["$arViews", 0] } },
                },
              },
            ],
            previousMonth: [
              {
                $match: {
                  createdAt: {
                    $gte: previousMonthStart,
                    $lte: previousMonthEnd,
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: { $ifNull: ["$arViews", 0] } },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const totalQRScans = qrCodes.reduce(
      (sum, qrCode) => sum + (qrCode.totalScans || 0),
      0,
    );

    const currentMonthViews = modelViewStats[0]?.currentMonth[0]?.total || 0;
    const previousMonthViews = modelViewStats[0]?.previousMonth[0]?.total || 0;

    // Calculate trend percentage
    let modelViewsTrend = 0;
    if (previousMonthViews > 0) {
      modelViewsTrend = Math.round(
        ((currentMonthViews - previousMonthViews) / previousMonthViews) * 100,
      );
    } else if (currentMonthViews > 0) {
      modelViewsTrend = 100; // New views in current month when none existed before
    }

    return {
      totalRestaurants: activeRestaurants,
      totalMenuItems,
      totalQRScans,
      totalModelViews: currentMonthViews,
      modelViewsTrend,
    };
  }

  /**
   * Create a new restaurant
   */
  static async createRestaurant(
    ownerId: string,
    data: Omit<
      IRestaurant,
      | "_id"
      | "createdAt"
      | "updatedAt"
      | "totalMenuItems"
      | "totalScans"
      | "totalViews"
    >,
  ): Promise<any> {
    // Check if owner already has a restaurant (single restaurant per owner for now)
    const existingRestaurant = await Restaurant.findOne({ ownerId });
    if (existingRestaurant) {
      throw new AppError(
        409,
        "You already have a restaurant. Please update it instead.",
      );
    }

    // Generate unique public URL
    const publicUrl = generatePublicUrl(data.name);
    const existingUrl = await Restaurant.findOne({ publicUrl });
    if (existingUrl) {
      throw new AppError(
        409,
        "This restaurant name is already taken. Please choose another.",
      );
    }

    const restaurant = new Restaurant({
      ownerId,
      name: data.name,
      description: data.description,
      cuisine: data.cuisine,
      imageUrl: data.imageUrl,
      address: data.address,
      city: data.city,
      phone: data.phone,
      website: data.website,
      publicUrl,
      theme: data.theme,
      isActive: true,
    });

    await restaurant.save();

    logger.info(`Restaurant created: ${restaurant._id} for owner: ${ownerId}`);

    return restaurant.toObject();
  }

  /**
   * Get restaurant by ID
   */
  static async getRestaurantById(restaurantId: string): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    return restaurant.toObject();
  }

  /**
   * Get restaurant by public URL
   */
  static async getRestaurantByPublicUrl(publicUrl: string): Promise<any> {
    const restaurant = await Restaurant.findOne({ publicUrl });

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    // Increment total views
    restaurant.totalViews = (restaurant.totalViews || 0) + 1;
    await restaurant.save();

    return restaurant.toObject();
  }

  /**
   * Get restaurant by QR code
   */
  static async getRestaurantByQRCode(qrcode: string): Promise<any> {
    const restaurant = await Restaurant.findOne({
      qrCodeId: { $exists: true, $ne: null },
    }).populate("qrCodeId");

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    const qrCodeModel = restaurant.qrCodeId as any;
    if (qrCodeModel && qrCodeModel.code !== qrcode) {
      throw new AppError(404, "Restaurant not found");
    }

    // Increment total views
    restaurant.totalViews = (restaurant.totalViews || 0) + 1;
    await restaurant.save();

    return restaurant.toObject();
  }

  /**
   * Get all restaurants for an owner
   */
  static async getOwnerRestaurants(ownerId: string): Promise<any> {
    const restaurants = await Restaurant.find({ ownerId }).sort({
      createdAt: -1,
    });

    return restaurants.map(r => r.toObject());
  }

  /**
   * Update restaurant (owner only)
   */
  static async updateRestaurant(
    restaurantId: string,
    ownerId: string,
    data: Partial<IRestaurant>,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    // Verify ownership
    if (restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to update this restaurant",
      );
    }

    // Update allowed fields
    const allowedFields = [
      "name",
      "description",
      "cuisine",
      "address",
      "city",
      "phone",
      "website",
      "imageUrl",
      "theme",
      "isActive",
    ];

    Object.keys(data).forEach(key => {
      if (allowedFields.includes(key)) {
        (restaurant as any)[key] = (data as any)[key];
      }
    });

    await restaurant.save();

    logger.info(`Restaurant updated: ${restaurantId}`);

    return restaurant.toObject();
  }

  /**
   * Delete restaurant (owner only)
   */
  static async deleteRestaurant(
    restaurantId: string,
    ownerId: string,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    // Verify ownership
    if (restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to delete this restaurant",
      );
    }

    await Restaurant.deleteOne({ _id: restaurantId });

    logger.info(`Restaurant deleted: ${restaurantId}`);

    return { message: "Restaurant deleted successfully" };
  }

  /**
   * Search restaurants by city or name
   */
  static async searchRestaurants(
    query: string,
    city?: string,
    limit: number = 10,
    skip: number = 0,
  ): Promise<any> {
    const filters: any = { isActive: true };

    if (query) {
      filters.$or = [
        { name: { $regex: query, $options: "i" } },
        { cuisine: { $in: [new RegExp(query, "i")] } },
      ];
    }

    if (city) {
      filters.city = { $regex: city, $options: "i" };
    }

    const restaurants = await Restaurant.find(filters)
      .sort({ averageRating: -1, totalViews: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Restaurant.countDocuments(filters);

    return {
      restaurants: restaurants.map(r => r.toObject()),
      total,
      limit,
      skip,
    };
  }

  /**
   * Get restaurant statistics
   */
  static async getRestaurantStats(
    restaurantId: string,
    ownerId: string,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    // Verify ownership
    if (restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view this restaurant stats",
      );
    }

    return {
      restaurantId: restaurant._id,
      name: restaurant.name,
      totalMenuItems: restaurant.totalMenuItems,
      totalScans: restaurant.totalScans,
      totalViews: restaurant.totalViews,
      averageRating: restaurant.averageRating,
      createdAt: restaurant.createdAt,
      updatedAt: restaurant.updatedAt,
    };
  }

  /**
   * Update rating
   */
  static async updateRating(
    restaurantId: string,
    newRating: number,
    currentCount: number = 1,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    // Calculate new average rating
    const currentTotal = (restaurant.averageRating || 0) * (currentCount - 1);
    const newAverage = (currentTotal + newRating) / currentCount;

    restaurant.averageRating = Math.min(newAverage, 5);
    await restaurant.save();

    return restaurant.toObject();
  }

  /**
   * Increment scan count (when QR code is scanned)
   */
  static async incrementScanCount(restaurantId: string): Promise<any> {
    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $inc: { totalScans: 1 } },
      { new: true },
    );

    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    return restaurant.toObject();
  }

  /**
   * Get restaurants by city (for discovery page)
   */
  static async getRestaurantsByCity(
    city: string,
    limit: number = 20,
    skip: number = 0,
  ): Promise<any> {
    const restaurants = await Restaurant.find({
      city: { $regex: city, $options: "i" },
      isActive: true,
    })
      .sort({ averageRating: -1, totalViews: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Restaurant.countDocuments({
      city: { $regex: city, $options: "i" },
      isActive: true,
    });

    return {
      restaurants: restaurants.map(r => r.toObject()),
      total,
      city,
      limit,
      skip,
    };
  }
}
