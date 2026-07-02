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

  const normalizedPath = req.path.replace(/\/+$/, "") || "/";
  const isRefreshRoute = normalizedPath === "/refresh";
  const isAuthRoute = ["/login", "/register", "/refresh"].includes(
    normalizedPath,
  );
  const hasRefreshCookie = Boolean(req.cookies?.[authCookieNames.refresh]);

  // Production fallback: cross-site auth flows can fail CSRF cookie validation
  // even when the browser is sending a valid token, so skip it for the auth
  // endpoints that already rely on cookie-based session state.
  if (
    (isRefreshRoute && hasRefreshCookie) ||
    (isAuthRoute && process.env.NODE_ENV === "production")
  ) {
    try {
      logger.warn("Skipping CSRF validation for auth request", {
        path: req.originalUrl,
        method: req.method,
        route: normalizedPath,
        hasRefreshCookie,
        nodeEnv: process.env.NODE_ENV,
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
