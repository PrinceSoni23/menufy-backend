import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { AuthService } from "../services/auth.service";
import { IJWTPayload } from "../types";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: Omit<IJWTPayload, "iat" | "exp">;
      token?: string;
    }
  }
}

/**
 * Middleware to verify JWT token from Authorization header
 * Expected format: Bearer <token>
 */
export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid authorization header");
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token
    const payload = AuthService.verifyAccessToken(token);

    // Attach user to request
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Token verification failed",
    });
  }
};

/**
 * Middleware to verify JWT token (optional)
 * Does not throw error if token is missing, but verifies if present
 */
export const optionalVerifyToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = AuthService.verifyAccessToken(token);
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      };
      req.token = token;
    }

    next();
  } catch (error) {
    // Continue even if token verification fails
    next();
  }
};

/**
 * Middleware to verify user role
 */
export const verifyRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
      return;
    }

    next();
  };
};

/**
 * CRITICAL FIX: Middleware to verify user is an owner (role='owner')
 * Use on routes that should only be accessible to restaurant owners
 */
export const verifyOwner = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role !== "owner") {
    res.status(403).json({
      success: false,
      message: "This action is only available to restaurant owners",
    });
    return;
  }

  next();
};
