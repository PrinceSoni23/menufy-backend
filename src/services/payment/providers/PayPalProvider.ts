/**
 * PayPal Payment Provider
 * Uses PayPal REST API v2 (Orders + Subscriptions)
 * Supports: One-time orders + Recurring subscriptions
 * Currencies: USD (primary), INR (limited support)
 */
import axios, { AxiosInstance } from "axios";
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

export class PayPalProvider implements IPaymentProvider {
  readonly gatewayId: GatewayId = "paypal";
  readonly displayName = "PayPal";
  readonly supportsCurrencies: Currency[] = ["USD"];
  readonly supportsRecurring = true;

  private clientId: string;
  private clientSecret: string;
  private webhookId: string;
  private baseUrl: string;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    if (!clientId || !clientSecret || !webhookId) {
      throw new Error(
        "PayPal credentials not configured. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID in .env",
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.webhookId = webhookId;
    this.baseUrl =
      process.env.PAYPAL_ENV === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    this.httpClient = axios.create({ baseURL: this.baseUrl });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");
    const response = await this.httpClient.post(
      "/v1/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
    return this.accessToken!;
  }

  private async authHeader() {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const plan = resolvePlan(options.planId);

    if (!this.supportsCurrencies.includes(plan.currency)) {
      throw new Error(
        `PayPal does not support ${plan.currency}. Use a USD plan.`,
      );
    }

    const headers = await this.authHeader();
    const amountStr = plan.amountDisplay.toFixed(2);

    const response = await this.httpClient.post(
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: options.idempotencyKey,
            description: plan.displayName,
            custom_id: options.userId,
            amount: {
              currency_code: plan.currency,
              value: amountStr,
            },
          },
        ],
        application_context: {
          brand_name: "menuffy",
          landing_page: "NO_PREFERENCE",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: `${process.env.FRONTEND_URL}/payment/success?gateway=paypal`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/failed?gateway=paypal`,
        },
      },
      { headers: { ...headers, "PayPal-Request-Id": options.idempotencyKey } },
    );

    const approvalLink = response.data.links?.find(
      (l: { rel: string }) => l.rel === "approve",
    );

    return {
      orderId: response.data.id,
      amount: plan.amount,
      currency: plan.currency,
      approvalUrl: approvalLink?.href,
      clientSecret: approvalLink?.href,
      keyId: this.clientId,
      metadata: {
        planId: options.planId,
        userId: options.userId,
        paypalOrderId: response.data.id,
        idempotencyKey: options.idempotencyKey,
      },
    };
  }

  async verifyPayment(
    options: VerifyPaymentOptions,
  ): Promise<VerifyPaymentResult> {
    const headers = await this.authHeader();

    // Capture the order server-side
    const response = await this.httpClient.post(
      `/v2/checkout/orders/${options.orderId}/capture`,
      {},
      { headers },
    );

    const capture = response.data.purchase_units?.[0]?.payments?.captures?.[0];
    const isCompleted = response.data.status === "COMPLETED";
    const captureOrderId = response.data.id;
    const referenceId = response.data.purchase_units?.[0]?.reference_id;

    return {
      verified:
        isCompleted &&
        captureOrderId === options.orderId &&
        (!options.metadata?.idempotencyKey ||
          options.metadata.idempotencyKey === referenceId),
      paymentId: capture?.id || options.paymentId,
      orderId: options.orderId,
      amount: parseFloat(capture?.amount?.value || "0") * 100, // convert to cents
      currency: (capture?.amount?.currency_code || "USD") as Currency,
      status: isCompleted ? "paid" : "failed",
      gatewayResponse: response.data,
    };
  }

  async handleWebhook(event: WebhookEvent): Promise<WebhookProcessResult> {
    // Verify PayPal webhook signature
    const transmissionId = event.headers["paypal-transmission-id"];
    const transmissionTime = event.headers["paypal-transmission-time"];
    const certUrl = event.headers["paypal-cert-url"];
    const authAlgo = event.headers["paypal-auth-algo"];
    const transmissionSig = event.headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionSig) {
      throw new Error("Missing PayPal webhook headers");
    }

    // Verify webhook with PayPal API
    const headers = await this.authHeader();
    const verifyResponse = await this.httpClient.post(
      "/v1/notifications/verify-webhook-signature",
      {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: JSON.parse(event.rawBody),
      },
      { headers },
    );

    if (verifyResponse.data.verification_status !== "SUCCESS") {
      throw new Error("PayPal webhook verification failed");
    }

    const payload = JSON.parse(event.rawBody);
    const eventType: string = payload.event_type;
    logger.info(`PayPal webhook: ${eventType}`);

    const result: WebhookProcessResult = {
      eventId: payload.id,
      eventType,
      action: "none",
      metadata: payload,
    };

    switch (eventType) {
      case "PAYMENT.CAPTURE.COMPLETED":
        result.paymentId = payload.resource?.id;
        result.action = "subscription_activated";
        break;
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        result.paymentId = payload.resource?.id;
        result.action = "payment_failed";
        break;
      case "BILLING.SUBSCRIPTION.CANCELLED":
        result.subscriptionId = payload.resource?.id;
        result.action = "subscription_cancelled";
        break;
      case "BILLING.SUBSCRIPTION.RENEWED":
      case "PAYMENT.SALE.COMPLETED":
        result.subscriptionId = payload.resource?.billing_agreement_id;
        result.action = "renewed";
        break;
      case "PAYMENT.CAPTURE.REFUNDED":
        result.paymentId = payload.resource?.id;
        result.action = "refunded";
        break;
    }

    return result;
  }

  async cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean> {
    try {
      const headers = await this.authHeader();
      await this.httpClient.post(
        `/v1/billing/subscriptions/${options.gatewaySubscriptionId}/cancel`,
        { reason: "User requested cancellation" },
        { headers },
      );
      return true;
    } catch (err) {
      logger.error("PayPal cancel subscription error", err);
      return false;
    }
  }

  async createRecurringSubscription(
    options: RecurringSubscriptionOptions,
  ): Promise<RecurringSubscriptionResult> {
    const plan = resolvePlan(options.planId);
    const headers = await this.authHeader();

    // Create billing plan
    const billingPlanRes = await this.httpClient.post(
      "/v1/billing/plans",
      {
        name: plan.displayName,
        description: plan.description,
        type: "INFINITE",
        payment_definitions: [
          {
            name: `${plan.duration} payment`,
            type: "REGULAR",
            frequency: plan.duration === "monthly" ? "MONTH" : "YEAR",
            frequency_interval: "1",
            amount: {
              value: plan.amountDisplay.toFixed(2),
              currency: plan.currency,
            },
            cycles: "0",
          },
        ],
        merchant_preferences: {
          auto_bill_amount: "YES",
          cancel_url: `${process.env.FRONTEND_URL}/payment/failed?gateway=paypal`,
          return_url: `${process.env.FRONTEND_URL}/payment/success?gateway=paypal`,
          max_fail_attempts: "3",
        },
      },
      { headers },
    );

    const planId = billingPlanRes.data.id;

    // Activate plan
    await this.httpClient.patch(
      `/v1/billing/plans/${planId}`,
      [{ op: "replace", path: "/", value: { state: "ACTIVE" } }],
      { headers },
    );

    // Create subscription
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);

    const subscriptionRes = await this.httpClient.post(
      "/v1/billing/subscriptions",
      {
        plan_id: planId,
        subscriber: {
          name: { given_name: options.userName },
          email_address: options.userEmail,
        },
        application_context: {
          brand_name: "menuffy",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${process.env.FRONTEND_URL}/payment/success?gateway=paypal&type=recurring`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/failed?gateway=paypal`,
        },
      },
      { headers },
    );

    const approvalLink = subscriptionRes.data.links?.find(
      (l: { rel: string }) => l.rel === "approve",
    );

    return {
      gatewaySubscriptionId: subscriptionRes.data.id,
      approvalUrl: approvalLink?.href,
      status: subscriptionRes.data.status,
      metadata: { planId, subscriptionData: subscriptionRes.data },
    };
  }
}
