/**
 * Webhook Controller
 * Receives and processes payment gateway webhooks securely.
 * All signature verification is done before any database writes.
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { paymentService } from "../services/payment/PaymentService";
import { Payment } from "../models/Payment";
import { Subscription } from "../models/Subscription";
import { WebhookLog } from "../models/WebhookLog";
import User from "../models/User";
import {
  activateSubscriptionFromPayment,
  expireUserSubscription,
  markPaymentStatus,
} from "../services/subscriptionLifecycle.service";
import {
  resolvePlan,
  calculateSubscriptionEndDate,
} from "../services/payment/PlanConfig";
import logger from "../utils/logger";
import type { GatewayId, PlanId } from "../services/payment/interfaces";

async function processWebhookResult(result: {
  eventId: string;
  eventType: string;
  paymentId?: string;
  subscriptionId?: string;
  action: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  switch (result.action) {
    case "subscription_activated": {
      if (!result.paymentId) break;
      const metadata = result.metadata as {
        payload?: { payment?: { entity?: { order_id?: string } } };
        resource?: {
          supplementary_data?: { related_ids?: { order_id?: string } };
        };
      };
      const linkedOrderId =
        metadata.payload?.payment?.entity?.order_id ||
        metadata.resource?.supplementary_data?.related_ids?.order_id;
      const payment = await Payment.findOne({
        $or: [
          { paymentId: result.paymentId },
          { orderId: result.paymentId },
          ...(linkedOrderId ? [{ orderId: linkedOrderId }] : []),
        ],
      });
      if (payment && payment.status !== "paid") {
        await activateSubscriptionFromPayment({
          payment,
          gateway: payment.gateway,
          paymentId: result.paymentId,
          gatewaySubscriptionId: result.subscriptionId,
          metadata: result.metadata,
        });
      }
      break;
    }

    case "payment_failed": {
      if (!result.paymentId) break;
      const payment = await Payment.findOne({
        $or: [{ paymentId: result.paymentId }, { orderId: result.paymentId }],
      });
      if (payment) {
        await markPaymentStatus({
          payment,
          status: "failed",
          metadata: result.metadata,
        });
      }
      break;
    }

    case "subscription_cancelled": {
      if (!result.subscriptionId) break;
      const sub = await Subscription.findOneAndUpdate(
        { gatewaySubscriptionId: result.subscriptionId },
        { status: "cancelled", autoRenew: false, cancelledAt: new Date() },
        { new: true },
      );
      if (sub) {
        // Keep active until period ends
        const now = new Date();
        if (now > sub.currentPeriodEnd) {
          await expireUserSubscription(String(sub.userId));
        }
      }
      break;
    }

    case "renewed": {
      const sub = result.subscriptionId
        ? await Subscription.findOne({
            gatewaySubscriptionId: result.subscriptionId,
          })
        : null;
      if (sub) {
        const plan = resolvePlan(sub.planId as PlanId);
        const endDate = calculateSubscriptionEndDate(plan.duration);
        await Subscription.findByIdAndUpdate(sub._id, {
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: endDate,
          renewalDate: endDate,
        });
        await User.findByIdAndUpdate(sub.userId, {
          subscriptionStatus: "active",
          subscriptionEndDate: endDate,
        });
      }
      break;
    }

    case "refunded": {
      if (!result.paymentId) break;
      const payment = await Payment.findOne({
        $or: [{ paymentId: result.paymentId }, { orderId: result.paymentId }],
      });
      if (payment) {
        await markPaymentStatus({
          payment,
          status: "refunded",
          metadata: result.metadata,
        });
      }
      break;
    }

    default:
      break;
  }
}

export const WebhookController = {
  /**
   * POST /api/webhooks/razorpay
   * Raw body required for signature verification
   */
  razorpay: async (req: Request, res: Response): Promise<void> => {
    const gateway: GatewayId = "razorpay";
    const rawBody =
      (req as Request & { rawBody?: string }).rawBody ||
      JSON.stringify(req.body);
    const signature = req.headers["x-razorpay-signature"] as string;

    try {
      const eventId = crypto.createHash("sha256").update(rawBody).digest("hex");

      // Idempotency — skip already processed events
      const existing = await WebhookLog.findOne({ gateway, eventId });
      if (existing?.status === "processed") {
        logger.info(`Razorpay webhook ${eventId} already processed — skipping`);
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      const logEntry = await WebhookLog.findOneAndUpdate(
        { gateway, eventId },
        {
          gateway,
          eventType: req.body?.event || "unknown",
          eventId,
          rawBody,
          headers: req.headers as Record<string, string>,
          status: "pending",
        },
        { upsert: true, new: true },
      );

      const result = await paymentService.handleWebhook(gateway, {
        gateway,
        eventType: req.body?.event,
        rawBody,
        signature,
        headers: req.headers as Record<string, string>,
      });

      await processWebhookResult(result);

      await WebhookLog.findByIdAndUpdate(logEntry._id, {
        status: "processed",
        processedAt: new Date(),
        action: result.action,
      });

      logger.info(
        `Razorpay webhook processed: ${result.eventType} → ${result.action}`,
      );
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Razorpay webhook error: ${message}`);
      await WebhookLog.findOneAndUpdate(
        {
          gateway,
          eventId: crypto.createHash("sha256").update(rawBody).digest("hex"),
        },
        {
          status: "failed",
          errorMessage: message,
          $inc: { retryCount: 1 },
        },
      );
      res.status(400).json({ received: false });
    }
  },

  /**
   * POST /api/webhooks/paypal
   */
  paypal: async (req: Request, res: Response): Promise<void> => {
    const gateway: GatewayId = "paypal";
    const rawBody =
      (req as Request & { rawBody?: string }).rawBody ||
      JSON.stringify(req.body);

    try {
      const eventId = req.body?.id || `pp_${Date.now()}`;

      const existing = await WebhookLog.findOne({ gateway, eventId });
      if (existing?.status === "processed") {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      const logEntry = await WebhookLog.findOneAndUpdate(
        { gateway, eventId },
        {
          gateway,
          eventType: req.body?.event_type || "unknown",
          eventId,
          rawBody,
          headers: req.headers as Record<string, string>,
          status: "pending",
        },
        { upsert: true, new: true },
      );

      const result = await paymentService.handleWebhook(gateway, {
        gateway,
        eventType: req.body?.event_type,
        rawBody,
        signature: req.headers["paypal-transmission-sig"] as string,
        headers: req.headers as Record<string, string>,
      });

      await processWebhookResult(result);

      await WebhookLog.findByIdAndUpdate(logEntry._id, {
        status: "processed",
        processedAt: new Date(),
        action: result.action,
      });
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`PayPal webhook error: ${message}`);
      res.status(400).json({ received: false });
    }
  },

  /**
   * POST /api/webhooks/payu/success
   * PayU posts to success/failure URLs (form POST)
   */
  payuSuccess: async (req: Request, res: Response): Promise<void> => {
    const gateway: GatewayId = "payu";
    const rawBody = JSON.stringify(req.body);

    try {
      const eventId = req.body?.mihpayid || `pu_${Date.now()}`;

      const existing = await WebhookLog.findOne({ gateway, eventId });
      if (existing?.status === "processed") {
        res.redirect(`${process.env.FRONTEND_URL}/payment/success`);
        return;
      }

      const logEntry = await WebhookLog.findOneAndUpdate(
        { gateway, eventId },
        {
          gateway,
          eventType: "payment.success",
          eventId,
          rawBody,
          headers: req.headers as Record<string, string>,
          status: "pending",
        },
        { upsert: true, new: true },
      );

      const result = await paymentService.handleWebhook(gateway, {
        gateway,
        eventType: "payment.success",
        rawBody,
        signature: req.body?.hash || "",
        headers: req.headers as Record<string, string>,
      });

      await processWebhookResult(result);

      await WebhookLog.findByIdAndUpdate(logEntry._id, {
        status: "processed",
        processedAt: new Date(),
        action: result.action,
      });

      // PayU redirects user browser — redirect to frontend success page
      res.redirect(
        `${process.env.FRONTEND_URL}/payment/success?gateway=payu&txnid=${req.body?.txnid}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`PayU success webhook error: ${message}`);
      res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=payu`);
    }
  },

  /**
   * POST /api/webhooks/payu/failure
   */
  payuFailure: async (req: Request, res: Response): Promise<void> => {
    const gateway: GatewayId = "payu";
    const eventId = req.body?.mihpayid || `pu_fail_${Date.now()}`;
    const rawBody = JSON.stringify(req.body);

    try {
      const result = await paymentService.handleWebhook(gateway, {
        gateway,
        eventType: "payment.failure",
        rawBody,
        signature: req.body?.hash || "",
        headers: req.headers as Record<string, string>,
      });

      await WebhookLog.findOneAndUpdate(
        { gateway, eventId },
        {
          gateway,
          eventType: "payment.failure",
          eventId,
          rawBody,
          headers: req.headers as Record<string, string>,
          status: "processed",
          processedAt: new Date(),
          action: result.action,
        },
        { upsert: true },
      );

      await processWebhookResult(result);
    } catch (err) {
      logger.error("PayU failure webhook error", err);
    }

    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=payu`);
  },
};
