import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

// Middleware to log incoming requests
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log request
  logger.info(
    `${req.method} ${req.path} - User-Agent: ${req.get("user-agent")}`,
  );

  // Override res.json to log responses
  const originalJson = res.json.bind(res);
  res.json = function (data: any) {
    const duration = Date.now() - startTime;
    logger.info(
      `${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms`,
    );
    return originalJson(data);
  };

  next();
};

export default requestLogger;
