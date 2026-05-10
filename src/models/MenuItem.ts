import mongoose, { Document, Schema } from "mongoose";
import { IMenuItem } from "../types";

interface IMenuItemDocument extends IMenuItem, Document {}

const menuItemSchema = new Schema<IMenuItemDocument>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    ingredients: {
      type: [String],
      default: [],
    },
    calories: {
      type: Number,
      default: null,
      min: 0,
    },
    // 2D Image uploaded by user
    imageUrl2D: {
      type: String,
      required: true,
      trim: true,
    },
    // 3D Model uploaded by restaurant owner (replaces auto-conversion)
    model3DUrl: {
      type: String,
      default: null,
      trim: true,
    },
    // Menu item variants (sizes, flavors, etc)
    variants: [
      {
        name: String,
        priceModifier: { type: Number, default: 0 },
        available: { type: Boolean, default: true },
      },
    ],
    // AR settings
    arEnabled: {
      type: Boolean,
      default: true,
    },
    scaling: {
      type: Number,
      default: 1,
      min: 0.1,
      max: 10,
    },
    // Analytics
    views: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    arViews: {
      type: Number,
      default: 0,
    },
    avgTimeViewed: {
      type: Number,
      default: 0, // seconds
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
menuItemSchema.index({ restaurantId: 1 });
menuItemSchema.index({ restaurantId: 1, category: 1 });
menuItemSchema.index({ status: 1 });
menuItemSchema.index({ conversionJobId: 1 });

const MenuItem = mongoose.model<IMenuItemDocument>("MenuItem", menuItemSchema);

export default MenuItem;
