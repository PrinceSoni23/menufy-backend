import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { verifyCsrfToken } from "../middleware/csrf.middleware";

const router = Router();

/**
 * Public routes (no authentication required)
 */

// GET /api/auth/csrf - Bootstrap CSRF token/cookie
router.get(
  "/csrf",
  (req, res, next) => void AuthController.csrf(req, res, next),
);

// POST /api/auth/register - Register new user
router.post(
  "/register",
  verifyCsrfToken,
  (req, res, next) => void AuthController.register(req, res, next),
);

// POST /api/auth/login - Login user
router.post(
  "/login",
  verifyCsrfToken,
  (req, res, next) => void AuthController.login(req, res, next),
);

// POST /api/auth/refresh - Refresh access token
router.post(
  "/refresh",
  verifyCsrfToken,
  (req, res, next) => void AuthController.refresh(req, res, next),
);

/**
 * Protected routes (authentication required)
 */

// GET /api/auth/me - Get current user profile
router.get(
  "/me",
  verifyToken,
  (req, res, next) => void AuthController.getProfile(req, res, next),
);

// POST /api/auth/logout - Logout user
router.post(
  "/logout",
  verifyToken,
  verifyCsrfToken,
  (req, res, next) => void AuthController.logout(req, res, next),
);

export default router;
