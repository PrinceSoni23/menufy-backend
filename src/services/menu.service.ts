import { MenuItem, Restaurant } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import { IMenuItem } from "../types";

export class MenuService {
  /**
   * Create a new menu item
   */
  static async createMenuItem(
    restaurantId: string,
    ownerId: string,
    data: Omit<
      IMenuItem,
      | "_id"
      | "createdAt"
      | "updatedAt"
      | "views"
      | "clicks"
      | "arViews"
      | "avgTimeViewed"
    >,
  ): Promise<any> {
    // Verify restaurant ownership
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    if (restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to add items to this restaurant",
      );
    }

    const menuItem = new MenuItem({
      ...data,
      restaurantId,
    });

    await menuItem.save();

    // Update restaurant menu item count
    restaurant.totalMenuItems = (restaurant.totalMenuItems || 0) + 1;
    await restaurant.save();

    logger.info(
      `Menu item created: ${menuItem._id} for restaurant: ${restaurantId}`,
    );

    return menuItem.toObject();
  }

  /**
   * Get menu item by ID
   */
  static async getMenuItemById(menuItemId: string): Promise<any> {
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    return menuItem.toObject();
  }

  /**
   * Get all PUBLIC menu items for a restaurant (only active items)
   */
  static async getPublicRestaurantMenuItems(
    restaurantId: string,
    category?: string,
    limit: number = 50,
    skip: number = 0,
  ): Promise<any> {
    // HIGH FIX: Add pagination to prevent loading all items at once
    // Enforce reasonable limits
    const MAX_LIMIT = 100;
    limit = Math.min(Math.abs(limit || 50), MAX_LIMIT);
    skip = Math.max(0, skip || 0);

    // Filter only active items for public menu
    const filters: any = { restaurantId, isActive: true };

    if (category) {
      filters.category = category;
    }

    logger.info(
      `Fetching PUBLIC menu items for restaurant ${restaurantId} with filters and pagination - limit: ${limit}, skip: ${skip}`,
    );

    // Execute query with pagination
    const menuItems = await MenuItem.find(filters)
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();

    // Get total count for pagination metadata
    const totalCount = await MenuItem.countDocuments(filters);

    logger.info(
      `Found ${menuItems.length} PUBLIC menu items for restaurant ${restaurantId}, total: ${totalCount}`,
    );

    return {
      data: menuItems.map(item => item.toObject()),
      pagination: {
        limit,
        skip,
        total: totalCount,
        hasMore: skip + limit < totalCount,
      },
    };
  }

  /**
   * Get all menu items for a restaurant
   */
  static async getRestaurantMenuItems(
    restaurantId: string,
    category?: string,
    limit: number = 50,
    skip: number = 0,
  ): Promise<any> {
    // HIGH FIX: Add pagination to prevent loading all items at once
    // Enforce reasonable limits
    const MAX_LIMIT = 100;
    limit = Math.min(Math.abs(limit || 50), MAX_LIMIT);
    skip = Math.max(0, skip || 0);

    // Updated filter to include both active and inactive items (for owner management)
    const filters: any = { restaurantId };

    if (category) {
      filters.category = category;
    }

    logger.info(
      `Fetching menu items for restaurant ${restaurantId} with filters and pagination - limit: ${limit}, skip: ${skip}`,
    );

    // Execute query with pagination
    const menuItems = await MenuItem.find(filters)
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();

    // Get total count for pagination metadata
    const totalCount = await MenuItem.countDocuments(filters);

    logger.info(
      `Found ${menuItems.length} menu items for restaurant ${restaurantId}, total: ${totalCount}`,
    );

    return {
      data: menuItems.map(item => item.toObject()),
      pagination: {
        limit,
        skip,
        total: totalCount,
        hasMore: skip + limit < totalCount,
      },
    };
  }

  /**
   * Update menu item (owner only)
   */
  static async updateMenuItem(
    menuItemId: string,
    restaurantId: string,
    ownerId: string,
    data: Partial<IMenuItem>,
  ): Promise<any> {
    // Verify ownership through restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(403, "You do not have permission to update this item");
    }

    const menuItem = await MenuItem.findByIdAndUpdate(
      menuItemId,
      {
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency,
        category: data.category,
        imageUrl2D: data.imageUrl2D,
        model3DUrl: data.model3DUrl,
        variants: data.variants,
        arEnabled: data.arEnabled,
        scaling: data.scaling,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
      { new: true },
    );

    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    logger.info(`Menu item updated: ${menuItemId}`);

    return menuItem.toObject();
  }

  /**
   * Delete menu item (owner only)
   */
  static async deleteMenuItem(
    menuItemId: string,
    restaurantId: string,
    ownerId: string,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(403, "You do not have permission to delete this item");
    }

    const menuItem = await MenuItem.findByIdAndDelete(menuItemId);

    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    // Update restaurant menu item count
    restaurant.totalMenuItems = Math.max(
      (restaurant.totalMenuItems || 0) - 1,
      0,
    );
    await restaurant.save();

    logger.info(`Menu item deleted: ${menuItemId}`);

    return { message: "Menu item deleted successfully" };
  }

  /**
   * Get menu items by category
   */
  static async getMenuItemsByCategory(
    restaurantId: string,
    category: string,
  ): Promise<any> {
    const menuItems = await MenuItem.find({
      restaurantId,
      category,
      isActive: true,
    }).sort({ displayOrder: 1 });

    return menuItems.map(item => item.toObject());
  }

  /**
   * Search menu items
   */
  static async searchMenuItems(
    restaurantId: string,
    query: string,
  ): Promise<any> {
    const menuItems = await MenuItem.find(
      {
        restaurantId,
        isActive: true,
        $or: [
          { name: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
          { category: { $regex: query, $options: "i" } },
        ],
      },
      {
        similarity: { $meta: "textScore" },
      },
    ).sort({ similarity: { $meta: "textScore" } });

    return menuItems.map(item => item.toObject());
  }

  /**
   * Get menu categories for restaurant
   */
  static async getMenuCategories(restaurantId: string): Promise<string[]> {
    const categories = await MenuItem.distinct("category", {
      restaurantId,
      isActive: true,
    });

    return categories;
  }

  /**
   * Update menu item view count
   */
  static async incrementViewCount(menuItemId: string): Promise<any> {
    const menuItem = await MenuItem.findByIdAndUpdate(
      menuItemId,
      { $inc: { views: 1 } },
      { new: true },
    );

    return menuItem?.toObject();
  }

  /**
   * Update menu item click count
   */
  static async incrementClickCount(menuItemId: string): Promise<any> {
    const menuItem = await MenuItem.findByIdAndUpdate(
      menuItemId,
      { $inc: { clicks: 1 } },
      { new: true },
    );

    return menuItem?.toObject();
  }

  /**
   * Update AR view count
   */
  static async incrementARViewCount(menuItemId: string): Promise<any> {
    const menuItem = await MenuItem.findByIdAndUpdate(
      menuItemId,
      { $inc: { arViews: 1 } },
      { new: true },
    );

    return menuItem?.toObject();
  }

  /**
   * Update menu item conversion status
   */
  static async updateConversionStatus(
    menuItemId: string,
    status: "pending" | "converting" | "ready" | "failed",
    modelUrl?: string,
    modelPreviewUrl?: string,
    progress?: number,
  ): Promise<any> {
    const updateData: any = { status };

    if (modelUrl) updateData.modelUrl = modelUrl;
    if (modelPreviewUrl) updateData.modelPreviewUrl = modelPreviewUrl;
    if (progress !== undefined) updateData.conversionProgress = progress;

    const menuItem = await MenuItem.findByIdAndUpdate(menuItemId, updateData, {
      new: true,
    });

    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    logger.info(
      `Menu item conversion status updated: ${menuItemId} - ${status}`,
    );

    return menuItem.toObject();
  }

  /**
   * Get menu item with reviews
   */
  static async getMenuItemWithReviews(menuItemId: string): Promise<any> {
    const Review = (await import("../models/index.js")).Review;
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) {
      throw new AppError(404, "Menu item not found");
    }

    const reviews = await Review.find({ menuItemId }).sort({ createdAt: -1 });

    return {
      ...menuItem.toObject(),
      reviews: reviews.map((r: any) => r.toObject()),
      reviewCount: reviews.length,
      averageRating:
        reviews.length > 0
          ? (
              reviews.reduce((sum: number, r: any) => sum + r.rating, 0) /
              reviews.length
            ).toFixed(1)
          : 0,
    };
  }
}
