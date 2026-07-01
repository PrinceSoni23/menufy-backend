/**
 * Subscription Plan Configuration
 * Prices are ONLY defined here on the backend.
 * The frontend NEVER sets prices — it only sends a planId.
 */
import { PlanDetails, PlanId, Currency } from "./interfaces";

export const PLANS: Record<PlanId, PlanDetails> = {
  monthly_inr: {
    id: "monthly_inr",
    name: "Monthly",
    duration: "monthly",
    currency: "INR",
    amount: 200000, // ₹2000 in paise
    amountDisplay: 2000,
    displayName: "Monthly Plan",
    description: "Full access to all features, billed monthly",
  },
  monthly_usd: {
    id: "monthly_usd",
    name: "Monthly",
    duration: "monthly",
    currency: "USD",
    amount: 2000, // $20.00 in cents
    amountDisplay: 20,
    displayName: "Monthly Plan",
    description: "Full access to all features, billed monthly",
  },
  yearly_inr: {
    id: "yearly_inr",
    name: "Yearly",
    duration: "yearly",
    currency: "INR",
    amount: 2000000, // ₹20000 in paise
    amountDisplay: 20000,
    displayName: "Yearly Plan",
    description: "Full access to all features, billed yearly — save 17%",
  },
  yearly_usd: {
    id: "yearly_usd",
    name: "Yearly",
    duration: "yearly",
    currency: "USD",
    amount: 20000, // $200.00 in cents
    amountDisplay: 200,
    displayName: "Yearly Plan",
    description: "Full access to all features, billed yearly — save 17%",
  },
};

/**
 * Resolve plan safely. Throws if planId is invalid.
 */
export function resolvePlan(planId: string): PlanDetails {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }
  return plan;
}

/**
 * Calculate subscription end date based on plan duration
 */
export function calculateSubscriptionEndDate(
  duration: "monthly" | "yearly",
): Date {
  const now = new Date();
  if (duration === "monthly") {
    now.setMonth(now.getMonth() + 1);
  } else {
    now.setFullYear(now.getFullYear() + 1);
  }
  return now;
}

/**
 * List all available plans (for API response to frontend)
 */
export function getPublicPlans() {
  return Object.values(PLANS).map(plan => ({
    id: plan.id,
    name: plan.name,
    duration: plan.duration,
    currency: plan.currency,
    amount: plan.amountDisplay, // never send paise/cents to frontend
    displayName: plan.displayName,
    description: plan.description,
  }));
}
