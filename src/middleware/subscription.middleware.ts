/**
 * Subscription Middleware
 * requireActiveSubscription() - blocks access if user has no active subscription.
 * Backend is the ONLY source of truth. Never trusts frontend state.
 */
import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import logger from "../utils/logger";
import { expireUserSubscription } from "../services/subscriptionLifecycle.service";

export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
      return;
    }

    // Always re-query from DB — never trust the JWT claim for subscription status
    const user = await User.findById(req.user.userId).select(
      "subscriptionStatus subscriptionEndDate role",
    );

    if (!user) {
      res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
      return;
    }

    // Admins bypass subscription check
    if (user.role === "admin") {
      next();
      return;
    }

    // Check subscription is active
    if (user.subscriptionStatus !== "active") {
      res.status(403).json({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
        message: "An active subscription is required to access this feature",
        data: {
          subscriptionStatus: user.subscriptionStatus,
          subscriptionEndDate: user.subscriptionEndDate,
        },
      });
      return;
    }

    // Check subscription has not expired (double-check date)
    if (
      user.subscriptionEndDate &&
      new Date() > new Date(user.subscriptionEndDate)
    ) {
      // Auto-expire the subscription
      await expireUserSubscription(req.user.userId);

      logger.info(`Auto-expired subscription for user ${req.user.userId}`);

      res.status(403).json({
        success: false,
        code: "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired. Please renew to continue.",
        data: {
          subscriptionStatus: "expired",
          subscriptionEndDate: user.subscriptionEndDate,
        },
      });
      return;
    }

    next();
  } catch (err) {
    logger.error("requireActiveSubscription middleware error", err);
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Internal server error",
    });
  }
};

/**
 * Optional subscription check — attaches subscription info to request
 * but does not block access.
 */
export const attachSubscriptionInfo = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user) {
      const user = await User.findById(req.user.userId).select(
        "subscriptionStatus subscriptionEndDate subscriptionPlan paymentGateway",
      );
      if (user) {
        (req as Request & { subscriptionInfo?: object }).subscriptionInfo = {
          status: user.subscriptionStatus,
          endDate: user.subscriptionEndDate,
          plan: (user as { subscriptionPlan?: string }).subscriptionPlan,
          gateway: (user as { paymentGateway?: string }).paymentGateway,
        };
      }
    }
    next();
  } catch {
    next();
  }
};
