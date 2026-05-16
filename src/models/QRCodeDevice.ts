import mongoose, { Document, Schema } from "mongoose";

interface IQrCodeDeviceDocument extends Document {
  qrCodeId: mongoose.Types.ObjectId;
  sessionId: string;
  deviceId?: string;
  lastSeen: Date;
}

const qrCodeDeviceSchema = new Schema<IQrCodeDeviceDocument>(
  {
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: "QRCode",
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    deviceId: {
      type: String,
      required: false,
      trim: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Unique per qrCode + session
qrCodeDeviceSchema.index({ qrCodeId: 1, sessionId: 1 }, { unique: true });
// Also support unique per qrCode + deviceId when deviceId is provided
qrCodeDeviceSchema.index(
  { qrCodeId: 1, deviceId: 1 },
  { unique: true, sparse: true },
);

const QRCodeDevice = mongoose.model<IQrCodeDeviceDocument>(
  "QRCodeDevice",
  qrCodeDeviceSchema,
);

export default QRCodeDevice;
