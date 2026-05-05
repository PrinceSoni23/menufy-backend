import { ConversionService } from "../services/conversion.service";
import logger from "../utils/logger";

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the conversion status polling scheduler
 * Polls pending conversions every 30 seconds
 */
export function startConversionScheduler() {
  // Avoid duplicate schedulers
  if (schedulerInterval) {
    logger.warn("Conversion scheduler already running");
    return;
  }

  const pollIntervalMs = parseInt(
    process.env.CONVERSION_POLL_INTERVAL_MS || "30000",
  );

  logger.info(
    `Starting conversion scheduler (polling every ${pollIntervalMs}ms)`,
  );

  schedulerInterval = setInterval(async () => {
    try {
      await ConversionService.processPendingConversions();
    } catch (error) {
      logger.error(`Error in conversion scheduler: ${error}`);
      // Don't crash the server on scheduler error
    }
  }, pollIntervalMs);

  // Ensure scheduler stops on process termination
  process.on("exit", () => stopConversionScheduler());
}

/**
 * Stop the conversion status polling scheduler
 */
export function stopConversionScheduler() {
  if (schedulerInterval) {
    logger.info("Stopping conversion scheduler");
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

/**
 * Check if scheduler is running
 */
export function isConversionSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
