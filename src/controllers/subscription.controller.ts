/**
 * Subscription Controller
 * Handles all subscription lifecycle: create order → verify → activate → manage
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import Joi from "joi";
import { paymentService } from "../services/payment/PaymentService";
import {
  getPublicPlans,
  resolvePlan,
  calculateSubscriptionEndDate,
} from "../services/payment/PlanConfig";
import { Payment } from "../models/Payment";
import { Subscription } from "../models/Subscription";
import User from "../models/User";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import {
  activateSubscriptionFromPayment,
  markPaymentStatus,
} from "../services/subscriptionLifecycle.service";
import type { GatewayId, PlanId } from "../services/payment/interfaces";

// ========================
// Validation schemas
// ========================
const createOrderSchema = Joi.object({
  planId: Joi.string()
    .valid("monthly_inr", "monthly_usd", "yearly_inr", "yearly_usd")
    .required(),
  gateway: Joi.string().valid("razorpay", "paypal", "payu").required(),
  isRecurring: Joi.boolean().default(false),
});

const verifyPaymentSchema = Joi.object({
  gateway: Joi.string().valid("razorpay", "paypal", "payu").required(),
  orderId: Joi.string().required(),
  paymentId: Joi.string().allow("").default(""),
  signature: Joi.string().allow("").optional(),
  metadata: Joi.object().optional(),
});

// ========================
// Helper: generate invoice number
// ========================
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${randomSuffix}`;
}

// ========================
// Controller methods
// ========================
export const SubscriptionController = {
  /**
   * GET /api/subscriptions/plans
   * Public — returns plan list. No prices from frontend ever.
   */
  getPlans: async (req: Request, res: Response): Promise<void> => {
    const plans = getPublicPlans();
    const gateways = paymentService.getAvailableGateways();

    res.json({
      success: true,
      data: { plans, gateways },
    });
  },

  /**
   * GET /api/subscriptions/status
   * Protected — returns current user's subscription status
   */
  getStatus: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const user = await User.findById(userId).select(
        "subscriptionStatus subscriptionPlan subscriptionStartDate subscriptionEndDate paymentGateway plan",
      );

      if (!user) throw new AppError(404, "User not found");

      const subscription = await Subscription.findOne({ userId }).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        data: {
          subscriptionStatus: user.subscriptionStatus,
          subscriptionPlan: (user as { subscriptionPlan?: string })
            .subscriptionPlan,
          subscriptionStartDate: (user as { subscriptionStartDate?: Date })
            .subscriptionStartDate,
          subscriptionEndDate: user.subscriptionEndDate,
          paymentGateway: (user as { paymentGateway?: string }).paymentGateway,
          plan: user.plan,
          autoRenew: subscription?.autoRenew ?? false,
          isRecurring: subscription?.isRecurring ?? false,
          renewalDate: subscription?.renewalDate,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/subscriptions/create-order
   * Protected — creates a payment order with the chosen gateway
   * Backend calculates price — frontend only sends planId + gateway
   */
  createOrder: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { error, value } = createOrderSchema.validate(req.body);
      if (error) throw new AppError(400, error.details[0].message);

      const { planId, gateway, isRecurring } = value as {
        planId: PlanId;
        gateway: GatewayId;
        isRecurring: boolean;
      };

      if (isRecurring) {
        throw new AppError(
          501,
          "Recurring billing is not enabled in this build.",
        );
      }

      const userId = req.user!.userId;
      const userEmail = req.user!.email;

      // Resolve plan — backend calculates price (never trust frontend)
      const plan = resolvePlan(planId);

      // Check if gateway supports the plan's currency
      const provider = paymentService.getProvider(gateway);
      if (!provider.supportsCurrencies.includes(plan.currency)) {
        throw new AppError(
          400,
          `Gateway '${gateway}' does not support ${plan.currency}. Please choose a compatible plan and gateway combination.`,
        );
      }

      // Fraud check: block if successful payment exists in last 2 minutes (replay attack)
      const recentPaid = await Payment.findOne({
        userId,
        status: "paid",
        planId,
        createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
      });
      if (recentPaid) {
        throw new AppError(
          409,
          "A recent successful payment already exists. Please check your subscription status.",
        );
      }

      // Idempotency key — ensures single order per session
      const idempotencyKey = uuidv4();

      const userData = await User.findById(userId).select("firstName lastName");
      const userName = userData
        ? `${userData.firstName} ${userData.lastName}`
        : "User";

      // Create order via gateway
      const orderResult = await paymentService.createOrder(gateway, {
        planId,
        userId,
        userEmail,
        userName,
        currency: plan.currency,
        isRecurring,
        idempotencyKey,
      });

      // Store pending payment record
      await Payment.create({
        userId,
        gateway,
        orderId: orderResult.orderId,
        paymentId: "",
        planId,
        amount: plan.amount,
        amountDisplay: plan.amountDisplay,
        currency: plan.currency,
        status: "created",
        isRecurring,
        idempotencyKey,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        metadata: orderResult.metadata,
      });

      logger.info(
        `Order created: ${orderResult.orderId} for user ${userId} via ${gateway}`,
      );

      res.json({
        success: true,
        data: {
          orderId: orderResult.orderId,
          amount: plan.amountDisplay, // only human-readable amount to frontend
          currency: plan.currency,
          gateway,
          planId,
          keyId: orderResult.keyId,
          approvalUrl: orderResult.approvalUrl,
          clientSecret: orderResult.clientSecret,
          idempotencyKey,
          metadata: gateway === "payu" ? orderResult.metadata : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/subscriptions/verify-payment
   * Protected — verifies payment signature server-side and activates subscription
   */
  verifyPayment: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { error, value } = verifyPaymentSchema.validate(req.body);
      if (error) throw new AppError(400, error.details[0].message);

      const { gateway, orderId, paymentId, signature, metadata } = value as {
        gateway: GatewayId;
        orderId: string;
        paymentId: string;
        signature?: string;
        metadata?: Record<string, unknown>;
      };

      const userId = req.user!.userId;

      // Find the pending payment record
      const pendingPayment = await Payment.findOne({
        userId,
        orderId,
        gateway,
        status: { $in: ["created", "pending"] },
      });

      if (!pendingPayment) {
        throw new AppError(
          404,
          "Payment record not found or already processed",
        );
      }

      // Verify payment with gateway (cryptographic verification)
      const verifyResult = await paymentService.verifyPayment(gateway, {
        orderId,
        paymentId,
        signature,
        metadata,
      });

      if (!verifyResult.verified) {
        // Mark payment as failed
        await markPaymentStatus({
          payment: pendingPayment,
          status: "failed",
        });
        throw new AppError(
          400,
          "Payment verification failed. Possible fraud attempt detected.",
        );
      }

      if (verifyResult.status !== "paid") {
        await markPaymentStatus({
          payment: pendingPayment,
          status: verifyResult.status === "pending" ? "pending" : "failed",
          metadata: verifyResult.gatewayResponse,
        });
        throw new AppError(409, "Payment is not in a captured/paid state yet.");
      }

      if (verifyResult.amount !== pendingPayment.amount) {
        await markPaymentStatus({
          payment: pendingPayment,
          status: "failed",
          metadata: {
            ...(pendingPayment.metadata || {}),
            verifyAmount: verifyResult.amount,
            expectedAmount: pendingPayment.amount,
          },
        });
        throw new AppError(400, "Payment amount mismatch detected.");
      }

      if (verifyResult.currency !== pendingPayment.currency) {
        await markPaymentStatus({
          payment: pendingPayment,
          status: "failed",
          metadata: {
            ...(pendingPayment.metadata || {}),
            verifyCurrency: verifyResult.currency,
            expectedCurrency: pendingPayment.currency,
          },
        });
        throw new AppError(400, "Payment currency mismatch detected.");
      }

      const invoiceNumber = await generateInvoiceNumber();

      await Payment.updateOne(
        { _id: pendingPayment._id },
        { $set: { invoiceNumber } },
      );

      await activateSubscriptionFromPayment({
        payment: pendingPayment,
        gateway,
        paymentId: verifyResult.paymentId,
        invoiceNumber,
        gatewaySubscriptionId: verifyResult.gatewayResponse.id as
          | string
          | undefined,
        metadata: verifyResult.gatewayResponse,
      });

      logger.info(`Subscription activated for user ${userId} via ${gateway}`);

      res.json({
        success: true,
        message: "Payment verified and subscription activated",
        data: {
          invoiceNumber,
          planId: pendingPayment.planId,
          gateway,
          expiresAt: calculateSubscriptionEndDate(
            resolvePlan(pendingPayment.planId as PlanId).duration,
          ),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/subscriptions/cancel
   * Protected — cancels active subscription
   */
  cancelSubscription: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const subscription = await Subscription.findOne({
        userId,
        status: "active",
      });

      if (!subscription) {
        throw new AppError(404, "No active subscription found");
      }

      // Cancel with gateway if recurring
      if (subscription.isRecurring && subscription.gatewaySubscriptionId) {
        await paymentService.cancelSubscription(subscription.gateway, {
          gatewaySubscriptionId: subscription.gatewaySubscriptionId,
          userId,
          cancelImmediately: false,
        });
      }

      // Update subscription
      await Subscription.findByIdAndUpdate(subscription._id, {
        status: "cancelled",
        autoRenew: false,
        cancelledAt: new Date(),
        cancellationReason: req.body.reason || "User requested cancellation",
      });

      // Update user — subscription remains active until end date
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: "active", // still valid until endDate
      });

      res.json({
        success: true,
        message:
          "Subscription cancelled. You will retain access until the end of the billing period.",
        data: {
          accessUntil: subscription.currentPeriodEnd,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/subscriptions/toggle-autorenew
   * Protected — toggle auto-renew on/off
   */
  toggleAutoRenew: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { autoRenew } = req.body;

      if (typeof autoRenew !== "boolean") {
        throw new AppError(400, "autoRenew must be a boolean");
      }

      throw new AppError(
        501,
        "Recurring billing management is not enabled in this build.",
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/subscriptions/invoices
   * Protected — list payment history / invoices
   */
  getInvoices: async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 10);

      const payments = await Payment.find({
        userId,
        status: "paid",
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          "gateway planId amountDisplay currency status invoiceNumber isRecurring createdAt",
        );

      const total = await Payment.countDocuments({ userId, status: "paid" });

      res.json({
        success: true,
        data: {
          invoices: payments,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
