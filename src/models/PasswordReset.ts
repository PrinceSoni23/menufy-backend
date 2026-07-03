import mongoose, { Document, Schema } from "mongoose";

interface IPasswordReset extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  otp: string;
  otpExpiry: Date;
  resetToken: string;
  resetTokenExpiry: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetSchema = new Schema<IPasswordReset>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    otp: {
      type: String,
      required: true,
      // OTP should be hashed before storing
    },
    otpExpiry: {
      type: Date,
      required: true,
      // Default: 15 minutes from now
      default: () => new Date(Date.now() + 15 * 60 * 1000),
    },
    resetToken: {
      type: String,
      required: true,
      // Optional: used if sending reset link instead of OTP
    },
    resetTokenExpiry: {
      type: Date,
      required: true,
      // Default: 1 hour from now
      default: () => new Date(Date.now() + 60 * 60 * 1000),
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster lookups
passwordResetSchema.index({ email: 1, isUsed: 1 });
passwordResetSchema.index({ userId: 1, isUsed: 1 });
passwordResetSchema.index(
  { otpExpiry: 1 },
  { expireAfterSeconds: 0 }, // Auto-delete expired records
);

const PasswordReset = mongoose.model<IPasswordReset>(
  "PasswordReset",
  passwordResetSchema,
);

export default PasswordReset;
