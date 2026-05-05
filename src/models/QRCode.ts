import mongoose, { Document, Schema } from "mongoose";
import { IQRCode } from "../types";

interface IQRCodeDocument extends IQRCode, Document {}

const qrcodeSchema = new Schema<IQRCodeDocument>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    qrDataUrl: {
      type: String,
      required: true,
      trim: true,
    },
    publicUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    totalScans: {
      type: Number,
      default: 0,
    },
    scansToday: {
      type: Number,
      default: 0,
    },
    lastScannedAt: {
      type: Date,
      default: null,
    },
    uniqueDevices: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
qrcodeSchema.index({ restaurantId: 1 });
qrcodeSchema.index({ code: 1 });
qrcodeSchema.index({ publicUrl: 1 });

const QRCode = mongoose.model<IQRCodeDocument>("QRCode", qrcodeSchema);

export default QRCode;
