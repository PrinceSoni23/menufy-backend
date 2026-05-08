import { Request, Response, NextFunction } from "express";
import { MenuService } from "../services/menu.service";
import { AppError } from "../middleware/errorHandler";
import { validateObjectId } from "../utils/validation";
import { MenuItem, Restaurant } from "../models";
import { resolvePublicBaseUrl } from "../utils/uploadHandler";
import Joi from "joi";

const createMenuItemSchema = Joi.object({
  restaurantId: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().max(500).optional(),
  price: Joi.number().positive().required(),
  currency: Joi.string().default("USD"),
  category: Joi.string().required(),
  imageUrl2D: Joi.string()
    .optional()
    .default("https://via.placeholder.com/300x300?text=No+Image"), // Default placeholder if not provided
  model3DUrl: Joi.string().optional(), // 3D model file URL (optional at creation)
  variants: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        priceModifier: Joi.number().default(0),
        available: Joi.boolean().default(true),
      }),
    )
    .optional(),
  arEnabled: Joi.boolean().default(true),
  scaling: Joi.number().min(0.1).max(10).default(1),
  displayOrder: Joi.number().default(0),
  isActive: Joi.boolean().default(true),
});

const updateMenuItemSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().max(500).optional(),
  price: Joi.number().positive().optional(),
  currency: Joi.string().optional(),
  category: Joi.string().optional(),
  imageUrl2D: Joi.string().uri().optional(),
  model3DUrl: Joi.string().optional(), // Allow updating 3D model
  variants: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        priceModifier: Joi.number().default(0),
        available: Joi.boolean().default(true),
      }),
    )
    .optional(),
  arEnabled: Joi.boolean().optional(),
  scaling: Joi.number().min(0.1).max(10).optional(),
  displayOrder: Joi.number().optional(),
  isActive: Joi.boolean().optional(),
});

export class MenuController {
  private static toPublicMediaUrl(
    req: Request,
    value?: string,
  ): string | undefined {
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const baseUrl = resolvePublicBaseUrl(req).replace(/\/$/, "");
    const normalized = value.startsWith("/")
      ? value
      : `/uploads/images/${value}`;
    return `${baseUrl}${normalized}`;
  }

  private static mapMenuItemMediaUrls(req: Request, menuItem: any): any {
    if (!menuItem) return menuItem;
    return {
      ...menuItem,
      imageUrl2D: this.toPublicMediaUrl(req, menuItem.imageUrl2D),
      model3DUrl: this.toPublicMediaUrl(req, menuItem.model3DUrl),
    };
  }

  /**
   * POST /api/menu
   * Create a new menu item
   */
  static async createMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { error, value } = createMenuItemSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      const { restaurantId } = value;

      const menuItem = await MenuService.createMenuItem(
        restaurantId,
        req.user.userId,
        value,
      );

      res.status(201).json({
        success: true,
        message: "Menu item created successfully",
        data: { menuItem },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/:id
   * Get menu item by ID
   */
  static async getMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      const menuItem = await MenuService.getMenuItemById(id);
      const menuItemWithPublicUrls = MenuController.mapMenuItemMediaUrls(
        req,
        menuItem,
      );

      res.status(200).json({
        success: true,
        message: "Menu item retrieved successfully",
        data: menuItemWithPublicUrls,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/public/:restaurantId
   * Get all PUBLIC menu items for a restaurant (only active items)
   */
  static async getPublicRestaurantMenu(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId } = req.params;
      const { category, limit, skip } = req.query;

      // Validate restaurantId
      validateObjectId(restaurantId);

      // HIGH FIX: Pass pagination parameters
      const limitNum = limit
        ? Math.min(parseInt(limit as string, 10), 100)
        : 50;
      const skipNum = skip ? Math.max(0, parseInt(skip as string, 10)) : 0;

      const result = await MenuService.getPublicRestaurantMenuItems(
        restaurantId,
        category as string,
        limitNum,
        skipNum,
      );
      const normalizedItems = result.data.map((item: any) =>
        MenuController.mapMenuItemMediaUrls(req, item),
      );

      res.status(200).json({
        success: true,
        message: "Menu items retrieved successfully",
        data: {
          menuItems: normalizedItems,
          pagination: result.pagination,
          count: normalizedItems.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/restaurant/:restaurantId
   * Get all menu items for a restaurant (owner management - includes inactive)
   */
  static async getRestaurantMenu(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId } = req.params;
      const { category, limit, skip } = req.query;

      // Validate restaurantId
      validateObjectId(restaurantId);

      // HIGH FIX: Pass pagination parameters
      const limitNum = limit
        ? Math.min(parseInt(limit as string, 10), 100)
        : 50;
      const skipNum = skip ? Math.max(0, parseInt(skip as string, 10)) : 0;

      const result = await MenuService.getRestaurantMenuItems(
        restaurantId,
        category as string,
        limitNum,
        skipNum,
      );
      const normalizedItems = result.data.map((item: any) =>
        MenuController.mapMenuItemMediaUrls(req, item),
      );

      res.status(200).json({
        success: true,
        message: "Menu items retrieved successfully",
        data: {
          menuItems: normalizedItems,
          pagination: result.pagination,
          count: normalizedItems.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/menu/:id
   * Update menu item
   */
  static async updateMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      // CRITICAL FIX: Verify ownership directly from menu item, not from request body
      // (prevents authorization bypass by passing different restaurantId)
      const menuItem = await MenuItem.findById(id);
      if (!menuItem) {
        throw new AppError(404, "Menu item not found");
      }

      // Verify user owns the restaurant this menu item belongs to
      const restaurant = await Restaurant.findById(menuItem.restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to update this menu item",
        );
      }

      const { error, value } = updateMenuItemSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Use the actual restaurantId from the menu item, not from request body
      const updatedItem = await MenuService.updateMenuItem(
        id,
        menuItem.restaurantId.toString(),
        req.user.userId,
        value,
      );

      res.status(200).json({
        success: true,
        message: "Menu item updated successfully",
        data: { menuItem: updatedItem },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/menu/:id
   * Delete menu item
   */
  static async deleteMenuItem(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      // CRITICAL FIX: Verify ownership directly from menu item, not from request body
      const menuItem = await MenuItem.findById(id);
      if (!menuItem) {
        throw new AppError(404, "Menu item not found");
      }

      // Verify user owns the restaurant this menu item belongs to
      const restaurant = await Restaurant.findById(menuItem.restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        throw new AppError(
          403,
          "You do not have permission to delete this menu item",
        );
      }

      await MenuService.deleteMenuItem(
        id,
        menuItem.restaurantId.toString(),
        req.user.userId,
      );

      res.status(200).json({
        success: true,
        message: "Menu item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/categories/:restaurantId
   * Get menu categories
   */
  static async getMenuCategories(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId } = req.params;

      const categories = await MenuService.getMenuCategories(restaurantId);

      res.status(200).json({
        success: true,
        message: "Categories retrieved successfully",
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/menu/:id/view
   * Track menu item view
   */
  static async trackMenuItemView(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { id } = req.params;

      const menuItem = await MenuService.incrementViewCount(id);

      res.status(200).json({
        success: true,
        message: "View tracked",
        data: { menuItem },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/menu/:id/ar-view
   * Track AR view
   */
  static async trackARView(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const menuItem = await MenuService.incrementARViewCount(id);

      res.status(200).json({
        success: true,
        message: "AR view tracked",
        data: { menuItem },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/:id/with-reviews
   * Get menu item with reviews
   */
  static async getMenuItemWithReviews(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { id } = req.params;

      const data = await MenuService.getMenuItemWithReviews(id);

      res.status(200).json({
        success: true,
        message: "Menu item with reviews retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/menu/search/:restaurantId
   * Search menu items
   */
  static async searchMenuItems(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId } = req.params;
      const { query } = req.query;

      if (!query) {
        throw new AppError(400, "Search query is required");
      }

      const results = await MenuService.searchMenuItems(
        restaurantId,
        query as string,
      );

      res.status(200).json({
        success: true,
        message: "Search results",
        data: { results },
      });
    } catch (error) {
      next(error);
    }
  }
}
