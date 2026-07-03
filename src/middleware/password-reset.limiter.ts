import rateLimit from "express-rate-limit";

/**
 * Rate limiter for forgot password endpoint
 * Allow 3 requests per 15 minutes per IP to prevent email bombing
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per windowMs
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: req => {
    // Skip rate limiting if it's a test environment (optional)
    return process.env.NODE_ENV === "test";
  },
  keyGenerator: req => {
    // Use IP address as the key, but if behind a proxy, use the X-Forwarded-For header
    return (req.ip || req.socket.remoteAddress || "unknown") as string;
  },
});

/**
 * Rate limiter for OTP verification endpoint
 * Allow 5 requests per 10 minutes per IP to prevent brute force
 */
export const verifyOTPLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 attempts per windowMs
  message: {
    success: false,
    message: "Too many OTP verification attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    return process.env.NODE_ENV === "test";
  },
  keyGenerator: req => {
    return (req.ip || req.socket.remoteAddress || "unknown") as string;
  },
});

/**
 * Rate limiter for password reset endpoint
 * Allow 3 requests per 15 minutes per IP to prevent abuse
 */
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per windowMs
  message: {
    success: false,
    message: "Too many password reset attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    return process.env.NODE_ENV === "test";
  },
  keyGenerator: req => {
    return (req.ip || req.socket.remoteAddress || "unknown") as string;
  },
});
