import mongoose, { Document, Schema } from "mongoose";

interface IOrderLineItem {
  menuItemId: Schema.Types.ObjectId;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface IOrderDocument extends Document {
  restaurantId: Schema.Types.ObjectId;
  menuItemId?: Schema.Types.ObjectId;
  userId?: Schema.Types.ObjectId;
  sessionId: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  currency: string;
  lineItems: IOrderLineItem[];
  totalItems: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerRemark?: string;
  customerCookingRequest?: string;
  status: "pending" | "confirmed" | "preparing" | "completed" | "cancelled";
  source: "legacy" | "guest_menu" | "owner_dashboard";
  paymentMethod?: string;
  notes?: string;
  confirmedAt?: Date;
  preparingAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderLineItemSchema = new Schema<IOrderLineItem>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    name: {
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
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

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
      required: false,
      default: null,
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
      required: false,
      min: 1,
      default: null,
    },
    unitPrice: {
      type: Number,
      required: false,
      min: 0,
      default: null,
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
    lineItems: {
      type: [orderLineItemSchema],
      default: [],
    },
    totalItems: {
      type: Number,
      min: 1,
      default: 1,
    },
    orderNumber: {
      type: String,
      trim: true,
      default: null,
    },
    customerName: {
      type: String,
      trim: true,
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
    customerRemark: {
      type: String,
      trim: true,
    },
    customerCookingRequest: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "preparing", "completed", "cancelled"],
      default: "pending",
    },
    source: {
      type: String,
      enum: ["legacy", "guest_menu", "owner_dashboard"],
      default: "legacy",
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    preparingAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ menuItemId: 1 });
orderSchema.index({ "lineItems.menuItemId": 1 });
orderSchema.index({ sessionId: 1 });
orderSchema.index({ customerEmail: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true, sparse: true });

const Order = mongoose.model<IOrderDocument>("Order", orderSchema);

export default Order;
