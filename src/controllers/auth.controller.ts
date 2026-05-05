import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AppError } from "../middleware/errorHandler";
import Joi from "joi";
import logger from "../utils/logger";

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(2).required(),
  lastName: Joi.string().min(2).required(),
  businessName: Joi.string().min(2).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export class AuthController {
  /**
   * POST /api/auth/register
   * Register new restaurant owner
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const { error, value } = registerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Register user
      const result = await AuthService.register(value);

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Login user
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const { error, value } = loginSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Login user
      const result = await AuthService.login(value);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const { error, value } = refreshTokenSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message);
        throw new AppError(400, messages.join(", "));
      }

      // Refresh token
      const result = await AuthService.refreshAccessToken(value.refreshToken);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Get current user profile (requires auth)
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const user = await AuthService.getUserProfile(req.user.userId);

      res.status(200).json({
        success: true,
        message: "Profile retrieved successfully",
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Logout user (client-side token deletion mainly)
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      logger.info(`User logged out: ${req.user.email}`);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
