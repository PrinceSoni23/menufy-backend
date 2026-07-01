import logger from "../utils/logger";
import { repairBillingState } from "../services/billingRepair.service";

let intervalHandle: NodeJS.Timeout | null = null;

export function startBillingRepairJob(): void {
  if (intervalHandle) {
    return;
  }

  const intervalMs = parseInt(
    process.env.BILLING_REPAIR_INTERVAL_MS || "300000",
    10,
  );

  const run = async () => {
    try {
      const result = await repairBillingState();
      logger.info(
        `Billing repair completed: expired=${result.expiredUsers}, revived=${result.revivedUsers}, cancelledPending=${result.cancelledPendingPayments}`,
      );
    } catch (error) {
      logger.error("Billing repair job failed", error);
    }
  };

  void run();
  intervalHandle = setInterval(() => {
    void run();
  }, intervalMs);
}

export function stopBillingRepairJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
