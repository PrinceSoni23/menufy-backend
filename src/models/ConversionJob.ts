import mongoose, { Document, Schema } from "mongoose";
import { IConversionJob } from "../types";

interface IConversionJobDocument extends IConversionJob, Document {}

const conversionJobSchema = new Schema<IConversionJobDocument>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    // Tripo AI API tracking
    tripoJobId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    tripoStatus: {
      type: String,
      enum: ["pending", "waiting", "processing", "succeeded", "failed"],
      default: "pending",
    },
    // Output model
    modelUrl: {
      type: String,
      default: null,
      trim: true,
    },
    modelSize: {
      type: Number,
      default: 0, // bytes
    },
    generatedAt: {
      type: Date,
      default: null,
    },
    // Error tracking for retries
    error: {
      type: String,
      default: null,
      trim: true,
    },
    retries: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
conversionJobSchema.index({ menuItemId: 1 });
conversionJobSchema.index({ tripoJobId: 1 });
conversionJobSchema.index({ tripoStatus: 1 });

const ConversionJob = mongoose.model<IConversionJobDocument>(
  "ConversionJob",
  conversionJobSchema,
);

export default ConversionJob;
