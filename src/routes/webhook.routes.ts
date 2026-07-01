/**
 * Webhook Routes
 * IMPORTANT: Raw body must be captured BEFORE express.json() parses it.
 * These routes use express.raw() middleware for signature verification.
 */
import { Router, Request, Response, NextFunction } from "express";
import { WebhookController } from "../controllers/webhook.controller";
import rateLimit from "express-rate-limit";
import express from "express";

const router = Router();

// Stricter rate limit for webhook endpoints
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const parseRawJsonBody = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const rawBody = typeof req.body === "string" ? req.body : "";
  (req as Request & { rawBody?: string }).rawBody = rawBody;

  try {
    req.body = rawBody ? JSON.parse(rawBody) : {};
    next();
  } catch {
    res.status(400).json({
      success: false,
      message: "Invalid webhook payload",
    });
  }
};

// Razorpay webhook (JSON payload with HMAC-SHA256 signature header)
router.post(
  "/razorpay",
  webhookLimiter,
  express.text({ type: "application/json" }),
  parseRawJsonBody,
  (req, res) => void WebhookController.razorpay(req, res),
);

// PayPal webhook (JSON payload, verified via PayPal API call)
router.post(
  "/paypal",
  webhookLimiter,
  express.text({ type: "application/json" }),
  parseRawJsonBody,
  (req, res) => void WebhookController.paypal(req, res),
);

// PayU success redirect (browser-based form POST — redirect response)
router.post(
  "/payu/success",
  webhookLimiter,
  express.urlencoded({ extended: true }),
  (req, res) => void WebhookController.payuSuccess(req, res),
);

// PayU failure redirect
router.post(
  "/payu/failure",
  webhookLimiter,
  express.urlencoded({ extended: true }),
  (req, res) => void WebhookController.payuFailure(req, res),
);

export default router;
