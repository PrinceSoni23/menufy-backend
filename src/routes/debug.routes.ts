import express from "express";
import { Request, Response } from "express";

const router = express.Router();

// Simple debug endpoint to echo cookies and CSRF header.
// Enabled only when ENABLE_DEBUG_ROUTE=true in env to avoid accidental exposure.
router.get("/inspect", (req: Request, res: Response) => {
  try {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    const csrfHeader = req.get("x-csrf-token") || null;
    const origin = req.get("origin") || req.get("referer") || null;

    res.json({
      success: true,
      received: {
        cookies: req.cookies || {},
        csrfHeader,
        origin,
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
      },
      note: "This endpoint is intended for short-term debugging. Disable ENABLE_DEBUG_ROUTE in production when finished.",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
