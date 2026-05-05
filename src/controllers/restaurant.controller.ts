import { Request, Response, NextFunction } from "express";
import { RestaurantService } from "../services/restaurant.service";
import { AppError } from "../middleware/errorHandler";
import { validateObjectId } from "../utils/validation";
import Joi from "joi";
import logger from "../utils/logger";

// Validation schemas
const createRestaurantSchema = Joi.object({
  name: Joi.string().min(2).required(),
  description: Joi.string().max(500).optional(),
  cuisine: Joi.array().items(Joi.string()).optional(),
  address: Joi.string().min(5).required(),
  city: Joi.string().min(2).required(),
  phone: Joi.string()
    .regex(/^[\d\s\-\+\(\)]+$/)
    .required(),
  website: Joi.string().uri().optional(),
  imageUrl: Joi.string().uri().optional(),
  theme: Joi.object({
    primaryColor: Joi.string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
    fontFamily: Joi.string().optional(),
    layout: Joi.string().valid("grid", "list").optional(),
  }).optional(),
});

const updateRestaurantSchema = Joi.object({
  name: Joi.string().min(2).optional(),
  description: Joi.string().max(500).optional(),
  cuisine: Joi.array().items(Joi.string()).optional(),
  address: Joi.string().min(5).optional(),
  city: Joi.string().min(2).optional(),
  phone: Joi.string()
    .regex(/^[\d\s\-\+\(\)]+$/)
    .optional(),
  website: Joi.string().uri().optional(),
  imageUrl: Joi.string().uri().optional(),
  isActive: Joi.boolean().optional(),
  theme: Joi.object({
    primaryColor: Joi.string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
    fontFamily: Joi.string().optional(),
    layout: Joi.string().valid("grid", "list").optional(),
  }).optional(),
});

const searchSchema = Joi.object({
  query: Joi.string().optional(),
  city: Joi.string().optional(),
  limit: Joi.number().max(100).optional(),
  skip: Joi.number().optional(),
});

export class RestaurantController {
  /**
   * POST /api/restaurants
   * Create a new restaurant (owner only)
   */
  static async createRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      // Validate request body
      const { error, value } = createRestaurantSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Create restaurant
      const restaurant = await RestaurantService.createRestaurant(
        req.user.userId,
        value,
      );

      res.status(201).json({
        success: true,
        message: "Restaurant created successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/:id
   * Get restaurant by ID
   */
  static async getRestaurant(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      const restaurant = await RestaurantService.getRestaurantById(id);

      res.status(200).json({
        success: true,
        message: "Restaurant retrieved successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/public/:publicUrl
   * Get restaurant by public URL (public route)
   */
  static async getPublicRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { publicUrl } = req.params;

      const restaurant =
        await RestaurantService.getRestaurantByPublicUrl(publicUrl);

      res.status(200).json({
        success: true,
        message: "Restaurant retrieved successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/qr/:qrcode
   * Get restaurant by QR code (public route)
   */
  static async getRestaurantByQRCode(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { qrcode } = req.params;

      const restaurant = await RestaurantService.getRestaurantByQRCode(qrcode);

      res.status(200).json({
        success: true,
        message: "Restaurant retrieved successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants
   * Get all restaurants for authenticated owner
   */
  static async getOwnerRestaurants(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const restaurants = await RestaurantService.getOwnerRestaurants(
        req.user.userId,
      );

      res.status(200).json({
        success: true,
        message: "Restaurants retrieved successfully",
        data: restaurants,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/restaurants/:id
   * Update restaurant (owner only)
   */
  static async updateRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      // Validate request body
      const { error, value } = updateRestaurantSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Update restaurant
      const restaurant = await RestaurantService.updateRestaurant(
        id,
        req.user.userId,
        value,
      );

      res.status(200).json({
        success: true,
        message: "Restaurant updated successfully",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/restaurants/:id
   * Delete restaurant (owner only)
   */
  static async deleteRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const { id } = req.params;

      // CRITICAL FIX: Validate ObjectID format
      validateObjectId(id);

      // Delete restaurant
      await RestaurantService.deleteRestaurant(id, req.user.userId);

      res.status(200).json({
        success: true,
        message: "Restaurant deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/search
   * Search restaurants
   */
  static async searchRestaurants(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      // Validate query parameters
      const { error, value } = searchSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      const { query, city, limit = 10, skip = 0 } = value;

      const result = await RestaurantService.searchRestaurants(
        query,
        city,
        limit,
        skip,
      );

      res.status(200).json({
        success: true,
        message: "Restaurants found",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/:id/stats
   * Get restaurant statistics (owner only)
   */
  static async getRestaurantStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const { id } = req.params;

      const stats = await RestaurantService.getRestaurantStats(
        id,
        req.user.userId,
      );

      res.status(200).json({
        success: true,
        message: "Restaurant stats retrieved successfully",
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/restaurants/:id/scan
   * Increment scan count (when QR code is scanned)
   */
  static async incrementScanCount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { id } = req.params;

      const restaurant = await RestaurantService.incrementScanCount(id);

      res.status(200).json({
        success: true,
        message: "Scan count incremented",
        data: restaurant,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/restaurants/city/:city
   * Get restaurants by city
   */
  static async getRestaurantsByCity(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { city } = req.params;
      const { limit = 20, skip = 0 } = req.query;

      const result = await RestaurantService.getRestaurantsByCity(
        city,
        parseInt(limit as string) || 20,
        parseInt(skip as string) || 0,
      );

      res.status(200).json({
        success: true,
        message: "Restaurants retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
