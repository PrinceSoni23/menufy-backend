import mongoose, { Document, Schema } from "mongoose";

interface IReviewDocument extends Document {
  menuItemId: Schema.Types.ObjectId;
  restaurantId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  rating: number;
  title: string;
  comment: string;
  verified: boolean;
  helpful: number;
  unhelpful: number;
  images?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReviewDocument>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    helpful: {
      type: Number,
      default: 0,
    },
    unhelpful: {
      type: Number,
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
reviewSchema.index({ menuItemId: 1, rating: -1 });
reviewSchema.index({ restaurantId: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ createdAt: -1 });

const Review = mongoose.model<IReviewDocument>("Review", reviewSchema);

export default Review;
