import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

// Custom error class
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true,
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler middleware
const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Default error values
  let statusCode = 500;
  let message = "Internal Server Error";
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err instanceof Error) {
    message = err.message;
  }

  // Log error
  logger.error({
    message: message,
    statusCode: statusCode,
    isOperational: isOperational,
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Send response
  res.status(statusCode).json({
    success: false,
    message: message,
    ...(isDevelopment && {
      stack: err instanceof Error ? err.stack : undefined,
    }),
  });
};

export default errorHandler;
