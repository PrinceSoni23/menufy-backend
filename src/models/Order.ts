import mongoose, { Document, Schema } from "mongoose";

interface IOrderDocument extends Document {
  restaurantId: Schema.Types.ObjectId;
  menuItemId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  sessionId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  customerEmail?: string;
  customerPhone?: string;
  status: "pending" | "completed" | "cancelled";
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrderDocument>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    customerPhone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ menuItemId: 1 });
orderSchema.index({ sessionId: 1 });
orderSchema.index({ customerEmail: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model<IOrderDocument>("Order", orderSchema);

export default Order;
