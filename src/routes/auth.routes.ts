import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { verifyToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * Public routes (no authentication required)
 */

// POST /api/auth/register - Register new user
router.post("/register", AuthController.register);

// POST /api/auth/login - Login user
router.post("/login", AuthController.login);

// POST /api/auth/refresh - Refresh access token
router.post("/refresh", AuthController.refresh);

/**
 * Protected routes (authentication required)
 */

// GET /api/auth/me - Get current user profile
router.get("/me", verifyToken, AuthController.getProfile);

// POST /api/auth/logout - Logout user
router.post("/logout", verifyToken, AuthController.logout);

export default router;
