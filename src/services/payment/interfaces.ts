/**
 * Payment Gateway Abstraction Layer
 * Every provider must implement this interface.
 * Adding a new gateway = create a new class implementing IPaymentProvider.
 */

export type Currency = "INR" | "USD";
export type PlanId =
  | "monthly_inr"
  | "monthly_usd"
  | "yearly_inr"
  | "yearly_usd";
export type GatewayId = "razorpay" | "paypal" | "payu";
export type PaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled";

export interface PlanDetails {
  id: PlanId;
  name: string;
  duration: "monthly" | "yearly";
  currency: Currency;
  amount: number; // in smallest currency unit (paise for INR, cents for USD)
  amountDisplay: number; // human-readable (₹2000 or $20)
  displayName: string;
  description: string;
}

export interface CreateOrderOptions {
  planId: PlanId;
  userId: string;
  userEmail: string;
  userName: string;
  currency: Currency;
  isRecurring: boolean;
  idempotencyKey: string; // prevent duplicate orders
}

export interface CreateOrderResult {
  orderId: string; // gateway-specific order ID
  gatewayPlanId?: string; // for recurring subscriptions
  amount: number; // in smallest unit
  currency: Currency;
  keyId?: string; // public key for client-side initialization
  clientSecret?: string; // PayPal approval URL or similar
  approvalUrl?: string; // redirect URL for some gateways
  metadata: Record<string, unknown>;
}

export interface VerifyPaymentOptions {
  orderId: string;
  paymentId: string;
  signature?: string; // Razorpay signature
  gatewaySubscriptionId?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyPaymentResult {
  verified: boolean;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  gatewayResponse: Record<string, unknown>;
}

export interface WebhookEvent {
  gateway: GatewayId;
  eventType: string;
  rawBody: string;
  signature: string;
  headers: Record<string, string>;
}

export interface WebhookProcessResult {
  eventId: string;
  eventType: string;
  paymentId?: string;
  subscriptionId?: string;
  userId?: string;
  action:
    | "subscription_activated"
    | "subscription_cancelled"
    | "payment_failed"
    | "refunded"
    | "renewed"
    | "none";
  metadata: Record<string, unknown>;
}

export interface CancelSubscriptionOptions {
  gatewaySubscriptionId: string;
  userId: string;
  cancelImmediately?: boolean;
}

export interface RecurringSubscriptionOptions {
  planId: PlanId;
  userId: string;
  userEmail: string;
  userName: string;
  currency: Currency;
  idempotencyKey: string;
}

export interface RecurringSubscriptionResult {
  gatewaySubscriptionId: string;
  approvalUrl?: string;
  status: string;
  nextBillingDate?: Date;
  metadata: Record<string, unknown>;
}

/**
 * Every payment gateway must implement this interface.
 */
export interface IPaymentProvider {
  readonly gatewayId: GatewayId;
  readonly displayName: string;
  readonly supportsCurrencies: Currency[];
  readonly supportsRecurring: boolean;

  /**
   * Create a one-time payment order
   */
  createOrder(options: CreateOrderOptions): Promise<CreateOrderResult>;

  /**
   * Verify payment signature and authenticity server-side
   */
  verifyPayment(options: VerifyPaymentOptions): Promise<VerifyPaymentResult>;

  /**
   * Handle incoming webhook from gateway
   */
  handleWebhook(event: WebhookEvent): Promise<WebhookProcessResult>;

  /**
   * Cancel an active recurring subscription
   */
  cancelSubscription(options: CancelSubscriptionOptions): Promise<boolean>;

  /**
   * Create a recurring subscription (autopay)
   */
  createRecurringSubscription(
    options: RecurringSubscriptionOptions,
  ): Promise<RecurringSubscriptionResult>;
}
