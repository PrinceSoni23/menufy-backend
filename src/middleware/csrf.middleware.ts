import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { authCookieNames } from "../utils/authCookies";
import logger from "../utils/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const verifyCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.[authCookieNames.csrf];
  const csrfHeader = req.get(authCookieNames.csrfHeader);

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    // Enhanced logging to help diagnose cross-site cookie/header issues in production
    try {
      logger.warn("CSRF validation failed", {
        path: req.originalUrl,
        method: req.method,
        origin: req.get("origin") || req.get("referer") || "unknown",
        hasCookie: Boolean(csrfCookie),
        hasHeader: Boolean(csrfHeader),
        cookieValuePreview: csrfCookie ? String(csrfCookie).slice(0, 8) : null,
        headerValuePreview: csrfHeader ? String(csrfHeader).slice(0, 8) : null,
        ip: req.ip,
        userAgent: req.get("user-agent") || "",
      });
    } catch (e) {
      // ignore logging errors
    }

    next(new AppError(403, "CSRF validation failed"));
    return;
  }

  next();
};
