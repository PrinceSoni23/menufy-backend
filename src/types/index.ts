import { ObjectId } from "mongoose";

// User Types
export interface IUser {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  businessName: string;
  avatar?: string;
  role: "owner" | "customer";
  plan: "free" | "pro" | "enterprise";
  subscriptionStatus: "active" | "expired";
  subscriptionEndDate?: Date;
  emailVerified: boolean;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
  notifications: {
    email: boolean;
    push: boolean;
    analytics: boolean;
  };
}

// Restaurant Types
export interface IRestaurant {
  ownerId: ObjectId | string;
  name: string;
  description: string;
  cuisine: string[];
  imageUrl?: string;
  address: string;
  city: string;
  phone: string;
  website?: string;
  qrCodeId?: ObjectId | string;
  publicUrl?: string;
  totalMenuItems: number;
  totalScans: number;
  totalViews: number;
  averageRating?: number;
  isActive: boolean;
  theme: {
    primaryColor: string;
    fontFamily: string;
    layout: "grid" | "list";
  };
  createdAt: Date;
  updatedAt: Date;
}

// Menu Item Types
export interface IMenuItem {
  restaurantId: ObjectId | string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrl2D: string;
  ingredients?: string[];
  calories?: number;
  model3DUrl?: string; // 3D model uploaded by owner
  variants: Array<{
    name: string;
    priceModifier: number;
    available: boolean;
  }>;
  arEnabled: boolean;
  scaling: number;
  views: number;
  clicks: number;
  arViews: number;
  avgTimeViewed: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// QR Code Types
export interface IQRCode {
  restaurantId: ObjectId | string;
  code: string;
  qrDataUrl: string;
  publicUrl: string;
  totalScans: number;
  scansToday: number;
  lastScannedAt?: Date;
  uniqueDevices: number;
  createdAt: Date;
  updatedAt: Date;
}

// Conversion Job Types
export interface IConversionJob {
  menuItemId: ObjectId | string;
  imageUrl: string;
  tripoJobId: string;
  tripoStatus: "pending" | "waiting" | "processing" | "succeeded" | "failed";
  modelUrl?: string;
  modelSize?: number;
  generatedAt?: Date;
  error?: string;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics Types
export interface IAnalytics {
  restaurantId: ObjectId | string;
  menuItemId?: ObjectId | string;
  deviceId?: string;
  eventType:
    | "scan"
    | "view"
    | "view_menu"
    | "ar_view"
    | "share"
    | "add_to_cart"
    | "remove_from_cart"
    | "cart_abandoned"
    | "scroll_depth";
  eventValue?: number | null;
  deviceType: "iOS" | "Android" | "Web";
  timestamp: Date;
  sessionId: string;
  userAgent: string;
  ipAddress: string;
}

// Order Types
export interface IOrder {
  restaurantId: ObjectId | string;
  menuItemId: ObjectId | string;
  userId?: ObjectId | string;
  sessionId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  customerEmail?: string;
  customerPhone?: string;
  status: "pending" | "completed" | "cancelled";
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// JWT Payload
export interface IJWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// API Response Types
export interface IAPIResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
