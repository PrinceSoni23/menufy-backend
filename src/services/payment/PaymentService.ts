/**
 * Payment Service - Central abstraction layer
 * Manages all payment providers and routes requests to the correct one.
 * To add a new gateway: create a new provider class and register it here.
 */
import {
  IPaymentProvider,
  GatewayId,
  CreateOrderOptions,
  CreateOrderResult,
  VerifyPaymentOptions,
  VerifyPaymentResult,
  WebhookEvent,
  WebhookProcessResult,
  CancelSubscriptionOptions,
  RecurringSubscriptionOptions,
  RecurringSubscriptionResult,
} from "./interfaces";
import { RazorpayProvider } from "./providers/RazorpayProvider";
import { PayPalProvider } from "./providers/PayPalProvider";
import { PayUProvider } from "./providers/PayUProvider";
import logger from "../../utils/logger";

class PaymentService {
  private providers: Map<GatewayId, IPaymentProvider> = new Map();

  constructor() {
    this.registerProviders();
  }

  /**
   * Register all payment providers.
   * Each provider is lazy-initialized (only if credentials exist).
   */
  private registerProviders(): void {
    this.tryRegister("razorpay", () => new RazorpayProvider());
    this.tryRegister("paypal", () => new PayPalProvider());
    this.tryRegister("payu", () => new PayUProvider());
  }

  private tryRegister(
    gatewayId: GatewayId,
    factory: () => IPaymentProvider,
  ): void {
    try {
      const provider = factory();
      this.providers.set(gatewayId, provider);
      logger.info(`Payment provider registered: ${gatewayId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Payment provider '${gatewayId}' skipped: ${message}`);
    }
  }

  /**
   * Get a specific provider, throws if not available
   */
  getProvider(gatewayId: GatewayId): IPaymentProvider {
    const provider = this.providers.get(gatewayId);
    if (!provider) {
      throw new Error(
        `Payment gateway '${gatewayId}' is not configured or not available`,
      );
    }
    return provider;
  }

  /**
   * Get list of available gateways
   */
  getAvailableGateways(): Array<{
    id: GatewayId;
    name: string;
    currencies: string[];
    supportsRecurring: boolean;
  }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.gatewayId,
      name: p.displayName,
      currencies: p.supportsCurrencies,
      supportsRecurring: p.supportsRecurring,
    }));
  }

  async createOrder(
    gatewayId: GatewayId,
    options: CreateOrderOptions,
  ): Promise<CreateOrderResult> {
    const provider = this.getProvider(gatewayId);
    logger.info(
      `Creating order via ${gatewayId} for user ${options.userId}, plan ${options.planId}`,
    );
    return provider.createOrder(options);
  }

  async verifyPayment(
    gatewayId: GatewayId,
    options: VerifyPaymentOptions,
  ): Promise<VerifyPaymentResult> {
    const provider = this.getProvider(gatewayId);
    logger.info(
      `Verifying payment via ${gatewayId}, orderId: ${options.orderId}`,
    );
    return provider.verifyPayment(options);
  }

  async handleWebhook(
    gatewayId: GatewayId,
    event: WebhookEvent,
  ): Promise<WebhookProcessResult> {
    const provider = this.getProvider(gatewayId);
    return provider.handleWebhook(event);
  }

  async cancelSubscription(
    gatewayId: GatewayId,
    options: CancelSubscriptionOptions,
  ): Promise<boolean> {
    const provider = this.getProvider(gatewayId);
    return provider.cancelSubscription(options);
  }

  async createRecurringSubscription(
    gatewayId: GatewayId,
    options: RecurringSubscriptionOptions,
  ): Promise<RecurringSubscriptionResult> {
    const provider = this.getProvider(gatewayId);
    return provider.createRecurringSubscription(options);
  }
}

// Singleton instance
export const paymentService = new PaymentService();
