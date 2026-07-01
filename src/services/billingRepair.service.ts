import { Payment } from "../models/Payment";
import { Subscription } from "../models/Subscription";
import User from "../models/User";
import logger from "../utils/logger";
import {
  activateSubscriptionFromPayment,
  expireUserSubscription,
} from "./subscriptionLifecycle.service";

export interface BillingRepairSummary {
  expiredUsers: number;
  revivedUsers: number;
  cancelledPendingPayments: number;
}

export async function repairBillingState(
  now = new Date(),
): Promise<BillingRepairSummary> {
  let expiredUsers = 0;
  let revivedUsers = 0;

  const expiredActiveUsers = await User.find({
    subscriptionStatus: "active",
    subscriptionEndDate: { $ne: null, $lt: now },
  }).select("_id");

  for (const user of expiredActiveUsers) {
    await expireUserSubscription(String(user._id));
    await Subscription.updateMany(
      { userId: user._id, status: "active", currentPeriodEnd: { $lt: now } },
      { $set: { status: "expired", autoRenew: false } },
    );
    expiredUsers += 1;
  }

  const recoverablePayments = await Payment.find({ status: "paid" })
    .sort({ createdAt: -1 })
    .limit(200);

  for (const payment of recoverablePayments) {
    const user = await User.findById(payment.userId).select(
      "subscriptionStatus subscriptionEndDate",
    );

    if (!user) {
      continue;
    }

    const needsRepair =
      user.subscriptionStatus !== "active" ||
      !user.subscriptionEndDate ||
      new Date(user.subscriptionEndDate) < now;

    if (!needsRepair) {
      continue;
    }

    try {
      await activateSubscriptionFromPayment({
        payment,
        gateway: payment.gateway,
        paymentId: payment.paymentId || payment.orderId,
        invoiceNumber: payment.invoiceNumber,
        gatewaySubscriptionId: payment.gatewaySubscriptionId,
        metadata: payment.metadata || {},
      });
      revivedUsers += 1;
    } catch (error) {
      logger.warn(
        `Failed to repair entitlement for payment ${payment._id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const stalePendingResult = await Payment.updateMany(
    {
      status: { $in: ["created", "pending"] },
      createdAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    { $set: { status: "cancelled" } },
  );

  return {
    expiredUsers,
    revivedUsers,
    cancelledPendingPayments: stalePendingResult.modifiedCount,
  };
}
