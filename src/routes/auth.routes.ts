import { Router, Request, Response, NextFunction } from "express";
import { AuthController } from "../controllers/auth.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { verifyCsrfToken } from "../middleware/csrf.middleware";
import {
  forgotPasswordLimiter,
  verifyOTPLimiter,
  resetPasswordLimiter,
} from "../middleware/password-reset.limiter";

// Async wrapper to handle Promise rejection
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const router = Router();

/**
 * Public routes (no authentication required)
 */

// GET /api/auth/csrf - Bootstrap CSRF token/cookie
router.get("/csrf", asyncHandler(AuthController.csrf.bind(AuthController)));

// POST /api/auth/register - Register new user
router.post(
  "/register",
  verifyCsrfToken,
  asyncHandler(AuthController.register.bind(AuthController)),
);

// POST /api/auth/login - Login user
router.post(
  "/login",
  verifyCsrfToken,
  asyncHandler(AuthController.login.bind(AuthController)),
);

// POST /api/auth/refresh - Refresh access token
router.post(
  "/refresh",
  verifyCsrfToken,
  asyncHandler(AuthController.refresh.bind(AuthController)),
);

// POST /api/auth/forgot-password - Request password reset
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  verifyCsrfToken,
  asyncHandler(AuthController.forgotPassword.bind(AuthController)),
);

// POST /api/auth/verify-otp - Verify OTP
router.post(
  "/verify-otp",
  verifyOTPLimiter,
  verifyCsrfToken,
  asyncHandler(AuthController.verifyOTP.bind(AuthController)),
);

// POST /api/auth/reset-password - Reset password with token
router.post(
  "/reset-password",
  resetPasswordLimiter,
  verifyCsrfToken,
  asyncHandler(AuthController.resetPassword.bind(AuthController)),
);

/**
 * Protected routes (authentication required)
 */

// GET /api/auth/me - Get current user profile
router.get(
  "/me",
  verifyToken,
  asyncHandler(AuthController.getProfile.bind(AuthController)),
);

// POST /api/auth/logout - Logout user
router.post(
  "/logout",
  verifyToken,
  verifyCsrfToken,
  asyncHandler(AuthController.logout.bind(AuthController)),
);

export default router;
