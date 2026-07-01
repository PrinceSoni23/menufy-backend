import mongoose, { Document, Schema } from "mongoose";

export interface IWebhookLog extends Document {
  gateway: "razorpay" | "paypal" | "payu";
  eventType: string;
  eventId: string;
  rawBody: string;
  headers: Record<string, string>;
  processedAt?: Date;
  status: "pending" | "processed" | "failed";
  retryCount: number;
  errorMessage?: string;
  action?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    gateway: {
      type: String,
      enum: ["razorpay", "paypal", "payu"],
      required: true,
    },
    eventType: { type: String, required: true },
    eventId: { type: String, required: true, index: true },
    rawBody: { type: String, required: true },
    headers: { type: Schema.Types.Mixed, default: {} },
    processedAt: { type: Date },
    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "pending",
    },
    retryCount: { type: Number, default: 0 },
    errorMessage: { type: String },
    action: { type: String },
  },
  { timestamps: true },
);

// Prevent duplicate webhook processing (idempotency)
WebhookLogSchema.index({ gateway: 1, eventId: 1 }, { unique: true });
WebhookLogSchema.index({ status: 1, retryCount: 1 });

export const WebhookLog = mongoose.model<IWebhookLog>(
  "WebhookLog",
  WebhookLogSchema,
);
