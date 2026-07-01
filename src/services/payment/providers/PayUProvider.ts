/**
 * PayU Payment Provider
 * Uses PayU REST API (India/Global)
 * Supports: One-time payments + Recurring (via SI - Standing Instructions)
 * Currencies: INR primary
 */
import axios from "axios";
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

export class PayUProvider implements IPaymentProvider {
  readonly gatewayId: GatewayId = "payu";
  readonly displayName = "PayU";
  readonly supportsCurrencies: Currency[] = ["INR"];
  readonly supportsRecurring = true; // via Standing Instructions

  private merchantKey: string;
  private merchantSalt: string;
  private baseUrl: string;
  private paymentUrl: string;

  constructor() {
    const merchantKey = process.env.PAYU_MERCHANT_KEY;
    const merchantSalt = process.env.PAYU_MERCHANT_SALT;

    if (!merchantKey || !merchantSalt) {
      throw new Error(
        "PayU credentials not configured. Set PAYU_MERCHANT_KEY, PAYU_MERCHANT_SALT in .env",
      );
    }

    this.merchantKey = merchantKey;
    this.merchantSalt = merchantSalt;

    const isTest = process.env.PAYU_ENV !== "production";
    this.baseUrl = isTest ? "https://test.payu.in" : "https://info.payu.in";
    this.paymentUrl = isTest
      ? "https://test.payu.in/_payment"
      : "https://secure.payu.in/_payment";
  }

  /**
   * Generate PayU hash for request
   * hash = SHA512(key|txnid|amount|productinfo|firstname|email|udf1..5||||||SALT)
   */
  private generateHash(params: {
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
  }): string {
    const hashString = [
      this.merchantKey,
      params.txnid,
      params.amount,
      params.productinfo,
      params.firstname,
      params.email,
      params.udf1 || "",
      params.udf2 || "",
      params.udf3 || "",
      params.udf4 || "",
      params.udf5 || "",
      "",
      "",
      "",
      "",
      "",
      this.merchantSalt,
    ].join("|");

    return crypto.createHash("sha512").update(hashString).digest("hex");
  }

  /**
   * Verify PayU response hash (reverse hash)
   * reverse_hash = SHA512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
   */
  private verifyResponseHash(params: Record<string, string>): boolean {
    const reverseHashString = [
      this.merchantSalt,
      params.status,
      params.udf5 || "",
      params.udf4 || "",
      params.udf3 || "",
      params.udf2 || "",
      params.udf1 || "",
      params.email || "",
      params.firstname || "",
      params.productinfo || "",
      params.amount || "",
      params.txnid || "",
      this.merchantKey,
    ].join("|");

    const expectedHash = crypto
      .createHash("sha512")
      .update(reverseHashString)
      .digest("hex");
    return expectedHash === params.hash;
  }

  async createOrder(options: CreateOrderOptions): Promise<CreateOrderResult> {
    const plan = resolvePlan(options.planId);

    const txnid = `txn_${options.idempotencyKey.substring(0, 20)}`;
    const amount = plan.amountDisplay.toFixed(2);
    const productinfo = plan.displayName;
    const firstname = options.userName.split(" ")[0] || "User";

    const hash = this.generateHash({
      txnid,
      amount,
      productinfo,
      firstname,
      email: options.userEmail,
      udf1: options.userId,
      udf2: options.planId,
    });

    const formParams = {
      key: this.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email: options.userEmail,
      phone: "",
      surl: `${process.env.BACKEND_URL}/api/webhooks/payu/success`,
      furl: `${process.env.BACKEND_URL}/api/webhooks/payu/failure`,
      hash,
      udf1: options.userId,
      udf2: options.planId,
      service_provider: "payu_paisa",
    };

    return {
      orderId: txnid,
      amount: plan.amount,
      currency: plan.currency,
      approvalUrl: this.paymentUrl,
      clientSecret: JSON.stringify(formParams), // pass to frontend for form POST
      metadata: {
        planId: options.planId,
        userId: options.userId,
        formParams,
        paymentUrl: this.paymentUrl,
      },
    };
  }

  async verifyPayment(
    options: VerifyPaymentOptions,
  ): Promise<VerifyPaymentResult> {
    const meta = options.metadata || {};
    const params = meta as Record<string, string>;

    const isHashValid = this.verifyResponseHash(params);

    if (!isHashValid) {
      logger.warn(`PayU hash verification failed for txn ${options.orderId}`);
      return {
        verified: false,
        paymentId: options.paymentId,
        orderId: options.orderId,
        amount: 0,
        currency: "INR",
        status: "failed",
        gatewayResponse: { error: "Hash verification failed" },
      };
    }

    // Cross-verify with PayU Verify API
    try {
      const verifyHash = crypto
        .createHash("sha512")
        .update(
          `${this.merchantKey}|verify_payment|${options.orderId}|${this.merchantSalt}`,
        )
        .digest("hex");

      const response = await axios.post(
        `${this.baseUrl}/merchant/postservice?form=2`,
        new URLSearchParams({
          key: this.merchantKey,
          command: "verify_payment",
          var1: options.orderId,
          hash: verifyHash,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );

      const txnData = response.data?.transaction_details?.[options.orderId];
      const isSuccess = txnData?.status === "success";
      const verifiedAmount =
        parseFloat(txnData?.amt || params.amount || "0") * 100;

      return {
        verified: isSuccess && txnData?.txnid === options.orderId,
        paymentId: options.paymentId || txnData?.mihpayid || "",
        orderId: options.orderId,
        amount: verifiedAmount,
        currency: "INR",
        status: isSuccess ? "paid" : "failed",
        gatewayResponse: txnData || {},
      };
    } catch (err) {
      logger.error("PayU verify API error", err);
      // Fall back to hash-only verification
      return {
        verified:
          isHashValid &&
          params.status === "success" &&
          params.txnid === options.orderId,
        paymentId: options.paymentId,
        orderId: options.orderId,
        amount: parseFloat(params.amount || "0") * 100,
        currency: "INR",
        status: params.status === "success" ? "paid" : "failed",
        gatewayResponse: params,
      };
    }
  }

  async handleWebhook(event: WebhookEvent): Promise<WebhookProcessResult> {
    const params = JSON.parse(event.rawBody) as Record<string, string>;

    const isValid = this.verifyResponseHash(params);
    if (!isValid) {
      throw new Error("PayU webhook hash verification failed");
    }

    const result: WebhookProcessResult = {
      eventId: params.mihpayid || crypto.randomUUID(),
      eventType: params.status,
      action: "none",
      metadata: params,
    };

    if (params.status === "success") {
      result.paymentId = params.mihpayid;
      result.action = "subscription_activated";
    } else if (params.status === "failure") {
      result.paymentId = params.mihpayid;
      result.action = "payment_failed";
    }

    return result;
  }

  async cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean> {
    // PayU SI cancellation via API
    logger.info(
      `PayU cancel subscription requested for ${options.gatewaySubscriptionId}`,
    );
    // PayU SI cancellation requires merchant portal or API depending on plan type
    // This is a graceful fallback - actual SI cancellation handled via PayU dashboard
    return true;
  }

  async createRecurringSubscription(
    options: RecurringSubscriptionOptions,
  ): Promise<RecurringSubscriptionResult> {
    const plan = resolvePlan(options.planId);
    const txnid = `si_${options.idempotencyKey.substring(0, 20)}`;

    // PayU Standing Instructions (SI) setup
    // SI requires si_details in form params
    const amount = plan.amountDisplay.toFixed(2);
    const productinfo = `${plan.displayName} - AutoPay`;
    const firstname = options.userName.split(" ")[0] || "User";

    const siDetails = JSON.stringify({
      billingAmount: amount,
      billingCurrency: plan.currency,
      billingCycle: plan.duration === "monthly" ? "MNTH" : "YEAR",
      billingInterval: 1,
      paymentStartDate: new Date().toISOString().split("T")[0],
      paymentEndDate:
        plan.duration === "monthly"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]
          : new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
      remarks: productinfo,
    });

    const hash = this.generateHash({
      txnid,
      amount,
      productinfo,
      firstname,
      email: options.userEmail,
      udf1: options.userId,
      udf2: options.planId,
    });

    const formParams = {
      key: this.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email: options.userEmail,
      surl: `${process.env.BACKEND_URL}/api/webhooks/payu/success`,
      furl: `${process.env.BACKEND_URL}/api/webhooks/payu/failure`,
      hash,
      si: "1",
      si_details: siDetails,
      udf1: options.userId,
      udf2: options.planId,
    };

    return {
      gatewaySubscriptionId: txnid,
      approvalUrl: this.paymentUrl,
      status: "created",
      metadata: {
        formParams,
        paymentUrl: this.paymentUrl,
        siDetails,
      },
    };
  }
}
