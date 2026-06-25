import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OrderController } from "../controllers/order.controller";
import { verifyOwner, verifyToken } from "../middleware/auth.middleware";

const router = Router();

const publicOrderLimiter = rateLimit({
  windowMs: parseInt(process.env.PUBLIC_ORDER_RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.PUBLIC_ORDER_RATE_LIMIT_MAX_REQUESTS || "120"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many checkout requests from this IP, please try again later.",
});

router.post(
  "/guest-checkout",
  publicOrderLimiter,
  (req, res, next) => void OrderController.createGuestOrder(req, res, next),
);

router.get(
  "/guest-status",
  (req, res, next) => void OrderController.getGuestOrderStatus(req, res, next),
);

router.get(
  "/restaurant/:restaurantId",
  verifyToken,
  verifyOwner,
  (req, res, next) => void OrderController.getRestaurantOrders(req, res, next),
);

router.patch(
  "/:id/status",
  verifyToken,
  verifyOwner,
  (req, res, next) => void OrderController.updateOrderStatus(req, res, next),
);

export default router;
