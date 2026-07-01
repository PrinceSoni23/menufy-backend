import mongoose, { Document, Schema } from "mongoose";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  gateway: "razorpay" | "paypal" | "payu";
  orderId: string;
  paymentId: string;
  planId: string;
  amount: number; // in smallest unit (paise/cents)
  amountDisplay: number; // human-readable
  currency: "INR" | "USD";
  status: "created" | "pending" | "paid" | "failed" | "refunded" | "cancelled";
  invoiceNumber: string;
  isRecurring: boolean;
  gatewaySubscriptionId?: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: ["razorpay", "paypal", "payu"],
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    paymentId: {
      type: String,
      default: "",
      index: true,
    },
    planId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountDisplay: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["INR", "USD"],
      required: true,
    },
    status: {
      type: String,
      enum: ["created", "pending", "paid", "failed", "refunded", "cancelled"],
      default: "created",
      index: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    gatewaySubscriptionId: {
      type: String,
      index: true,
      sparse: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

// Compound index for fraud detection (same user, same amount, recent)
PaymentSchema.index({ userId: 1, amount: 1, createdAt: -1 });
PaymentSchema.index({ gateway: 1, orderId: 1 }, { unique: true });

export const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
