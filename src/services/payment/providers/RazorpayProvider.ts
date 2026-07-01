/**
 * Razorpay Payment Provider
 * Supports: One-time orders + Recurring subscriptions
 * Currencies: INR, USD (INR primary)
 */
import Razorpay from "razorpay";
import crypto from "crypto";
import {
  IPaymentProvider,
  GatewayId,
  Currency,
  CreateOrderOptions,
  CreateOrderResult,
  VerifyPaymentOptions,
  VerifyPaymentResult,
  WebhookEvent,
  WebhookProcessResult,
  CancelSubscriptionOptions,
  RecurringSubscriptionOptions,
  RecurringSubscriptionResult,
} from "../interfaces";
import { resolvePlan } from "../PlanConfig";
import logger from "../../../utils/logger";

export class RazorpayProvider implements IPaymentProvider {
  readonly gatewayId: GatewayId = "razorpay";
  readonly displayName = "Razorpay";
  readonly supportsCurrencies: Currency[] = ["INR"];
  readonly supportsRecurring = true;

  private client: Razorpay;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!keyId || !keySecret || !webhookSecret) {
      throw new Error(
        "Razorpay credentials not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET in .env",
      );
    }

    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const plan = resolvePlan(options.planId);

    const order = await this.client.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt: `rcpt_${options.idempotencyKey.substring(0, 30)}`,
      notes: {
        userId: options.userId,
        planId: options.planId,
        userEmail: options.userEmail,
      },
    });

    return {
      orderId: order.id,
      amount: plan.amount,
      currency: plan.currency,
      keyId: process.env.RAZORPAY_KEY_ID!,
      metadata: {
        planId: options.planId,
        userId: options.userId,
        razorpayOrderId: order.id,
      },
    };
  }

  async verifyPayment(
    options: VerifyPaymentOptions,
  ): Promise<VerifyPaymentResult> {
    if (!options.signature) {
      return {
        verified: false,
        paymentId: options.paymentId,
        orderId: options.orderId,
        amount: 0,
        currency: "INR",
        status: "failed",
        gatewayResponse: { error: "Missing signature" },
      };
    }

    // Cryptographically verify the signature
    const expectedSignature = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${options.orderId}|${options.paymentId}`)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(options.signature, "hex"),
    );

    if (!isValid) {
      logger.warn(`Razorpay signature mismatch for order ${options.orderId}`);
      return {
        verified: false,
        paymentId: options.paymentId,
        orderId: options.orderId,
        amount: 0,
        currency: "INR",
        status: "failed",
        gatewayResponse: { error: "Signature verification failed" },
      };
    }

    // Fetch payment details from Razorpay to confirm amount
    const payment = await this.client.payments.fetch(options.paymentId);

    return {
      verified: payment.order_id === options.orderId,
      paymentId: options.paymentId,
      orderId: options.orderId,
      amount: Number(payment.amount),
      currency: payment.currency as Currency,
      status: payment.status === "captured" ? "paid" : "pending",
      gatewayResponse: {
        ...(payment as unknown as Record<string, unknown>),
        order_id: payment.order_id,
      },
    };
  }

  async handleWebhook(event: WebhookEvent): Promise<WebhookProcessResult> {
    // Verify webhook signature
    const expectedSig = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(event.rawBody)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(event.signature),
    );

    if (!isValid) {
      logger.error("Razorpay webhook signature invalid");
      throw new Error("Invalid webhook signature");
    }

    const payload = JSON.parse(event.rawBody);
    const eventType: string = payload.event;

    logger.info(`Razorpay webhook: ${eventType}`);

    const result: WebhookProcessResult = {
      eventId: payload.payload?.payment?.entity?.id || crypto.randomUUID(),
      eventType,
      action: "none",
      metadata: payload,
    };

    switch (eventType) {
      case "payment.captured":
        result.paymentId = payload.payload.payment.entity.id;
        result.action = "subscription_activated";
        break;
      case "payment.failed":
        result.paymentId = payload.payload.payment?.entity?.id;
        result.action = "payment_failed";
        break;
      case "subscription.charged":
        result.paymentId = payload.payload.payment?.entity?.id;
        result.subscriptionId = payload.payload.subscription?.entity?.id;
        result.action = "renewed";
        break;
      case "subscription.cancelled":
        result.subscriptionId = payload.payload.subscription?.entity?.id;
        result.action = "subscription_cancelled";
        break;
      case "refund.created":
        result.paymentId = payload.payload.refund?.entity?.payment_id;
        result.action = "refunded";
        break;
    }

    return result;
  }

  async cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean> {
    try {
      // cancelAtCycleEnd=true means cancel at period end (not immediate)
      // cancelAtCycleEnd=false means cancel immediately
      const cancelAtCycleEnd = !options.cancelImmediately;
      await this.client.subscriptions.cancel(
        options.gatewaySubscriptionId,
        cancelAtCycleEnd,
      );
      return true;
    } catch (err) {
      logger.error("Razorpay cancel subscription error", err);
      return false;
    }
  }

  async createRecurringSubscription(
    options: RecurringSubscriptionOptions,
  ): Promise<RecurringSubscriptionResult> {
    const plan = resolvePlan(options.planId);

    // Create or retrieve Razorpay plan
    const rzpPlan = await this.client.plans.create({
      period: plan.duration === "monthly" ? "monthly" : "yearly",
      interval: 1,
      item: {
        name: plan.displayName,
        amount: plan.amount,
        currency: plan.currency,
        description: plan.description,
      },
    });

    // Create subscription
    const subscription = await this.client.subscriptions.create({
      plan_id: rzpPlan.id,
      total_count: plan.duration === "monthly" ? 12 : 5, // max cycles
      customer_notify: 1,
      notes: {
        userId: options.userId,
        planId: options.planId,
        userEmail: options.userEmail,
      },
    });

    const nextBilling = new Date(Number(subscription.current_end) * 1000);

    return {
      gatewaySubscriptionId: subscription.id,
      status: subscription.status,
      nextBillingDate: nextBilling,
      metadata: { razorpayPlanId: rzpPlan.id, subscription },
    };
  }
}
