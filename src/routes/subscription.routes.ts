import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller";
import { verifyToken } from "../middleware/auth.middleware";
import rateLimit from "express-rate-limit";

const router = Router();

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many payment requests. Please slow down.",
});

// Public — plan listing (no auth needed, shows prices)
router.get(
  "/plans",
  (req, res) => void SubscriptionController.getPlans(req, res),
);

// Protected routes
router.use(verifyToken);

// Get subscription status
router.get(
  "/status",
  (req, res, next) => void SubscriptionController.getStatus(req, res, next),
);

// Create a payment order
router.post(
  "/create-order",
  paymentLimiter,
  (req, res, next) => void SubscriptionController.createOrder(req, res, next),
);

// Verify payment after gateway callback
router.post(
  "/verify-payment",
  paymentLimiter,
  (req, res, next) => void SubscriptionController.verifyPayment(req, res, next),
);

// Cancel subscription
router.post(
  "/cancel",
  (req, res, next) =>
    void SubscriptionController.cancelSubscription(req, res, next),
);

// Toggle auto-renew
router.post(
  "/toggle-autorenew",
  (req, res, next) =>
    void SubscriptionController.toggleAutoRenew(req, res, next),
);

// Payment history / invoices
router.get(
  "/invoices",
  (req, res, next) => void SubscriptionController.getInvoices(req, res, next),
);

export default router;
