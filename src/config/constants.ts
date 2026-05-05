/**
 * Constants for the AR Menu Platform
 * Used across the application for configuration
 */

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const FILE_UPLOAD = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
  ALLOWED_3D_TYPES: ["model/gltf-binary", "application/octet-stream"],
};

export const CONVERSION_STATUS = {
  PENDING: "pending",
  CONVERTING: "converting",
  READY: "ready",
  FAILED: "failed",
};

export const TRIPO_CONFIG = {
  API_BASE: process.env.TRIPO_API_BASE_URL || "https://api.tripo3d.com",
  TIMEOUT: 300000, // 5 minutes
  POLL_INTERVAL: 5000, // 5 seconds
  MAX_RETRIES: 3,
  // CRITICAL FIX: Webhook signature secret for verification
  WEBHOOK_SECRET: process.env.TRIPO_WEBHOOK_SECRET,
};

export const JWT_CONFIG = {
  // CRITICAL FIX: Do NOT use hardcoded defaults for secrets
  // Use auth.service.ts getJWTSecret() and getJWTRefreshSecret() instead
  EXPIRY: process.env.JWT_EXPIRY || "15m",
  REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || "7d",
};

export const CLOUDINARY_CONFIG = {
  CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  API_KEY: process.env.CLOUDINARY_API_KEY,
  API_SECRET: process.env.CLOUDINARY_API_SECRET,
  FOLDER: "ar-menu",
};

export const RESTAURANT_DEFAULTS = {
  PLAN: "free",
  SUBSCRIPTION_STATUS: "expired",
  MAX_MENU_ITEMS_FREE: 10,
  MAX_MENU_ITEMS_PRO: 100,
  MAX_MENU_ITEMS_ENTERPRISE: -1, // Unlimited
};

export const QR_CODE_PREFIX = "rest_";

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Resource not found",
  BAD_REQUEST: "Bad request",
  INVALID_EMAIL: "Invalid email format",
  WEAK_PASSWORD: "Password is too weak",
  EMAIL_EXISTS: "Email already exists",
  INVALID_TOKEN: "Invalid authentication token",
  TOKEN_EXPIRED: "Token has expired",
  INVALID_CREDENTIALS: "Invalid email or password",
  FILE_TOO_LARGE: "File size exceeds limit",
  INVALID_FILE_TYPE: "Invalid file type",
  CONVERSION_FAILED: "Image to 3D conversion failed",
};

export const SUCCESS_MESSAGES = {
  CREATED: "Resource created successfully",
  UPDATED: "Resource updated successfully",
  DELETED: "Resource deleted successfully",
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "Logout successful",
};
