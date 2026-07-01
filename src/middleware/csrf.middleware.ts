import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { authCookieNames } from "../utils/authCookies";

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
    next(new AppError(403, "CSRF validation failed"));
    return;
  }

  next();
};
