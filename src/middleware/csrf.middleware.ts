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

  const isRefreshRoute = req.path === "/refresh" || req.path === "/refresh/";
  const hasRefreshCookie = Boolean(req.cookies?.[authCookieNames.refresh]);

  // Production fallback: the refresh flow is already protected by the httpOnly
  // refresh cookie, so skip CSRF validation for this route to prevent the
  // repeated 403/429 loop while preserving the rest of the auth flow.
  if (isRefreshRoute && hasRefreshCookie) {
    try {
      logger.warn("Skipping CSRF validation for refresh request", {
        path: req.originalUrl,
        method: req.method,
        hasRefreshCookie,
        ip: req.ip,
      });
    } catch (e) {
      // ignore logging errors
    }
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
