import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { authCookieNames } from "../utils/authCookies";
import logger from "../utils/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getTrustedFrontendOrigins(): string[] {
  const configuredOrigins = [
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.CLIENT_ORIGIN,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .filter(Boolean)
    .flatMap(value => value!.split(","))
    .map(value => value.trim())
    .filter(Boolean);

  const normalizedOrigins = configuredOrigins.map(origin => {
    try {
      return new URL(origin).origin;
    } catch {
      return origin.replace(/\/+$/, "").toLowerCase();
    }
  });

  return Array.from(new Set(normalizedOrigins));
}

function isTrustedFrontendOrigin(req: Request): boolean {
  const requestOrigin = req.get("origin") || req.get("referer") || "";
  if (!requestOrigin) {
    return false;
  }

  const trustedOrigins = getTrustedFrontendOrigins();
  if (trustedOrigins.length === 0) {
    return false;
  }

  try {
    const normalizedRequestOrigin = new URL(requestOrigin).origin;
    return trustedOrigins.some(trustedOrigin => {
      try {
        return normalizedRequestOrigin === new URL(trustedOrigin).origin;
      } catch {
        return normalizedRequestOrigin === trustedOrigin;
      }
    });
  } catch {
    return trustedOrigins.some(
      trustedOrigin => requestOrigin === trustedOrigin,
    );
  }
}

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
  const isCrossSiteAuthRoute = ["/login", "/register", "/refresh"].includes(
    normalizedPath,
  );
  const isTrustedFrontendRequest = isTrustedFrontendOrigin(req);
  const csrfCookie = req.cookies?.[authCookieNames.csrf];
  const csrfHeader = req.get(authCookieNames.csrfHeader);
  const hasValidCsrfPair = Boolean(
    csrfCookie && csrfHeader && csrfCookie === csrfHeader,
  );

  // Allow trusted frontend-origin auth requests in production when the browser
  // cannot reliably provide a matching CSRF cookie/header pair during the
  // login/register/refresh flow. This keeps the login page working without
  // weakening CSRF protection for unrelated pages or routes.
  if (
    process.env.NODE_ENV === "production" &&
    isCrossSiteAuthRoute &&
    isTrustedFrontendRequest &&
    !hasValidCsrfPair
  ) {
    try {
      logger.warn(
        "Bypassing CSRF validation for trusted frontend auth request",
        {
          path: req.originalUrl,
          method: req.method,
          route: normalizedPath,
          origin: req.get("origin") || null,
          referer: req.get("referer") || null,
          nodeEnv: process.env.NODE_ENV,
          ip: req.ip,
        },
      );
    } catch (e) {
      // ignore logging errors
    }
    next();
    return;
  }

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
