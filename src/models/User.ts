import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "../types";

interface IUserDocument extends IUser, Document {}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 6,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["owner", "customer"],
      default: "customer",
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "expired"],
      default: "expired",
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      analytics: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
userSchema.index({ email: 1 });

const User = mongoose.model<IUserDocument>("User", userSchema);

export default User;
