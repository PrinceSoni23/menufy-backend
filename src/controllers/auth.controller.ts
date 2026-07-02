import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AppError } from "../middleware/errorHandler";
import Joi from "joi";
import logger from "../utils/logger";
import {
  clearAuthCookies,
  issueCsrfToken,
  setCsrfCookie,
  setAuthCookies,
} from "../utils/authCookies";

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

export class AuthController {
  /**
   * GET /api/auth/csrf
   * Bootstrap CSRF cookie/token for unauthenticated visitors.
   */
  static async csrf(req: Request, res: Response, next: NextFunction) {
    try {
      const csrfToken = issueCsrfToken();
      setCsrfCookie(res, csrfToken);

      res.status(200).json({
        success: true,
        message: "CSRF token issued",
        data: { csrfToken },
      });
    } catch (error) {
      next(error);
    }
  }

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
      const csrfToken = issueCsrfToken();
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
          csrfToken,
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
      const csrfToken = issueCsrfToken();
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
      });

      // Temporary debug logging: capture outgoing Set-Cookie headers to diagnose
      // cross-site cookie issues in production. Remove after debugging.
      try {
        const setCookieHeader = (res as any).getHeader
          ? (res as any).getHeader("Set-Cookie")
          : (res as any).getHeaders?.()["set-cookie"];
        logger.info("Outgoing Set-Cookie headers (login)", {
          setCookieHeader,
          nodeEnv: process.env.NODE_ENV,
        });
      } catch (e) {
        logger.warn("Failed to read Set-Cookie headers (login)", { error: e });
      }

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          csrfToken,
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
      const refreshToken = req.cookies?.ar_refresh;
      if (!refreshToken) {
        throw new AppError(401, "Refresh token missing");
      }

      // Refresh token
      const result = await AuthService.refreshAccessToken(refreshToken);
      const csrfToken = issueCsrfToken();
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
      });

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: { csrfToken },
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
      clearAuthCookies(res);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}
