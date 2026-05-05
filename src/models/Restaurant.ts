import mongoose, { Document, Schema } from "mongoose";
import { IRestaurant } from "../types";

interface IRestaurantDocument extends IRestaurant, Document {}

const restaurantSchema = new Schema<IRestaurantDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
    cuisine: {
      type: [String],
      default: [],
    },
    imageUrl: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      default: null,
      trim: true,
    },
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: "QRCode",
      default: null,
    },
    publicUrl: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    totalMenuItems: {
      type: Number,
      default: 0,
    },
    totalScans: {
      type: Number,
      default: 0,
    },
    totalViews: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    theme: {
      primaryColor: { type: String, default: "#FF6B35" },
      fontFamily: { type: String, default: "Inter" },
      layout: { type: String, enum: ["grid", "list"], default: "grid" },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
restaurantSchema.index({ ownerId: 1 });
restaurantSchema.index({ publicUrl: 1 });
restaurantSchema.index({ city: 1 });

const Restaurant = mongoose.model<IRestaurantDocument>(
  "Restaurant",
  restaurantSchema,
);

export default Restaurant;
