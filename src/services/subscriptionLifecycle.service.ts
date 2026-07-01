import mongoose from "mongoose";
import { Payment, type IPayment } from "../models/Payment";
import { Subscription, type ISubscription } from "../models/Subscription";
import User from "../models/User";
import {
  calculateSubscriptionEndDate,
  resolvePlan,
} from "./payment/PlanConfig";
import type { GatewayId, PaymentStatus, PlanId } from "./payment/interfaces";
import logger from "../utils/logger";

type SupportedSession = mongoose.ClientSession | null;

interface ActivateFromPaymentParams {
  payment: IPayment;
  gateway: GatewayId;
  paymentId: string;
  gatewaySubscriptionId?: string;
  invoiceNumber?: string;
  metadata: Record<string, unknown>;
  status?: PaymentStatus;
}

interface MarkPaymentStatusParams {
  payment: IPayment;
  status: Extract<
    PaymentStatus,
    "failed" | "refunded" | "cancelled" | "pending"
  >;
  metadata?: Record<string, unknown>;
}

async function withOptionalTransaction<T>(
  work: (session: SupportedSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unsupportedTransaction =
        message.includes("Transaction numbers are only allowed") ||
        message.includes("replica set") ||
        message.includes("withTransaction");

      if (!unsupportedTransaction) {
        throw error;
      }

      logger.warn(
        `Mongo transaction unavailable for subscription lifecycle update, falling back to non-transactional writes: ${message}`,
      );
      return work(null);
    }
  } finally {
    await session.endSession();
  }
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const randomSuffix = new mongoose.Types.ObjectId()
    .toHexString()
    .slice(-8)
    .toUpperCase();
  return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${randomSuffix}`;
}

export async function activateSubscriptionFromPayment(
  params: ActivateFromPaymentParams,
): Promise<ISubscription> {
  return withOptionalTransaction(async session => {
    const planId = params.payment.planId as PlanId;
    const plan = resolvePlan(planId);
    const now = new Date();
    const endDate = calculateSubscriptionEndDate(plan.duration);

    await Payment.updateOne(
      { _id: params.payment._id },
      {
        $set: {
          paymentId: params.paymentId,
          status: params.status ?? "paid",
          invoiceNumber:
            params.invoiceNumber ||
            params.payment.invoiceNumber ||
            generateInvoiceNumber(),
          metadata: params.metadata,
          gatewaySubscriptionId:
            params.gatewaySubscriptionId ||
            params.payment.gatewaySubscriptionId,
        },
      },
      { session },
    );

    const subscription = await Subscription.findOneAndUpdate(
      { userId: params.payment.userId, status: { $in: ["pending", "active"] } },
      {
        $set: {
          userId: params.payment.userId,
          planId,
          gateway: params.gateway,
          status: "active",
          autoRenew: params.payment.isRecurring,
          isRecurring: params.payment.isRecurring,
          gatewaySubscriptionId:
            params.gatewaySubscriptionId ||
            params.payment.gatewaySubscriptionId,
          currentPeriodStart: now,
          currentPeriodEnd: endDate,
          renewalDate: params.payment.isRecurring ? endDate : undefined,
          cancelledAt: undefined,
          cancellationReason: undefined,
          lastPaymentId: params.payment._id,
          metadata: params.metadata,
        },
      },
      { upsert: true, new: true, session, setDefaultsOnInsert: true },
    );

    await User.updateOne(
      { _id: params.payment.userId },
      {
        $set: {
          subscriptionStatus: "active",
          subscriptionPlan: planId,
          subscriptionStartDate: now,
          subscriptionEndDate: endDate,
          paymentGateway: params.gateway,
          activeSubscriptionId: subscription._id,
          plan: plan.duration === "monthly" ? "pro" : "enterprise",
        },
      },
      { session },
    );

    return subscription;
  });
}

export async function markPaymentStatus(
  params: MarkPaymentStatusParams,
): Promise<void> {
  await Payment.updateOne(
    { _id: params.payment._id },
    {
      $set: {
        status: params.status,
        metadata: params.metadata ?? params.payment.metadata,
      },
    },
  );
}

export async function expireUserSubscription(userId: string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        subscriptionStatus: "expired",
        plan: "free",
      },
      $unset: {
        activeSubscriptionId: 1,
      },
    },
  );
}
