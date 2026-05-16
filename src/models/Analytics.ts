import mongoose, { Document, Schema } from "mongoose";
import { IAnalytics } from "../types";

interface IAnalyticsDocument extends IAnalytics, Document {}

const analyticsSchema = new Schema<IAnalyticsDocument>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      default: null,
    },
    deviceId: {
      type: String,
      default: null,
      trim: true,
    },
    eventType: {
      type: String,
      enum: [
        "scan",
        "view",
        "view_menu",
        "ar_view",
        "share",
        "add_to_cart",
        "remove_from_cart",
        "cart_abandoned",
        "scroll_depth",
      ],
      required: true,
    },
    eventValue: {
      type: Number,
      default: null,
    },
    deviceType: {
      type: String,
      enum: ["iOS", "Android", "Web"],
      default: "Web",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: false, // We use timestamp field instead
  },
);

// Indexes for faster queries
analyticsSchema.index({ restaurantId: 1, timestamp: -1 });
analyticsSchema.index({ menuItemId: 1 });
analyticsSchema.index({ deviceId: 1 });
analyticsSchema.index({ eventType: 1 });
analyticsSchema.index({ sessionId: 1 });
analyticsSchema.index({ timestamp: -1 }); // For TTL if needed

const Analytics = mongoose.model<IAnalyticsDocument>(
  "Analytics",
  analyticsSchema,
);

export default Analytics;
