import mongoose, { Document, Schema } from "mongoose";

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planId: string;
  gateway: "razorpay" | "paypal" | "payu";
  status: "active" | "cancelled" | "expired" | "pending";
  autoRenew: boolean;
  isRecurring: boolean;
  gatewaySubscriptionId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  renewalDate?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  lastPaymentId?: mongoose.Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
    },
    gateway: {
      type: String,
      enum: ["razorpay", "paypal", "payu"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "cancelled", "expired", "pending"],
      default: "pending",
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    gatewaySubscriptionId: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    renewalDate: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    lastPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// Only one active-or-pending subscription record per user at a time.
SubscriptionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["active", "pending"] } },
  },
);

export const Subscription = mongoose.model<ISubscription>(
  "Subscription",
  SubscriptionSchema,
);
