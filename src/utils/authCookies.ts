import crypto from "crypto";
import { Response } from "express";

const ACCESS_COOKIE = "ar_access";
const REFRESH_COOKIE = "ar_refresh";
const CSRF_COOKIE = "ar_csrf";
const CSRF_HEADER = "x-csrf-token";

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function issueCsrfToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function setAuthCookies(
  res: Response,
  params: {
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
  },
): void {
  const accessMaxAge = parseInt(
    process.env.AUTH_COOKIE_ACCESS_MAX_AGE_MS || "900000",
    10,
  );
  const refreshMaxAge = parseInt(
    process.env.AUTH_COOKIE_REFRESH_MAX_AGE_MS || "604800000",
    10,
  );

  res.cookie(
    ACCESS_COOKIE,
    params.accessToken,
    baseCookieOptions(accessMaxAge),
  );
  res.cookie(
    REFRESH_COOKIE,
    params.refreshToken,
    baseCookieOptions(refreshMaxAge),
  );
  res.cookie(CSRF_COOKIE, params.csrfToken, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: refreshMaxAge,
  });
}

export function setCsrfCookie(res: Response, csrfToken: string): void {
  const refreshMaxAge = parseInt(
    process.env.AUTH_COOKIE_REFRESH_MAX_AGE_MS || "604800000",
    10,
  );

  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions(0));
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions(0));
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
  });
}

export const authCookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
  csrf: CSRF_COOKIE,
  csrfHeader: CSRF_HEADER,
};
