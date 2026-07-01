#!/usr/bin/env node
/**
 * Fix owners who were incorrectly auto-marked as active at registration.
 *
 * Dry run (default):
 *   node scripts/fix-subscription-status-for-new-owners.js
 *
 * Apply changes:
 *   node scripts/fix-subscription-status-for-new-owners.js --apply
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function main() {
  const shouldApply = process.argv.includes("--apply");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI or MONGODB_URI is required in environment");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);

  const db = mongoose.connection.db;
  const users = db.collection("users");

  const filter = {
    role: "owner",
    subscriptionStatus: "active",
    subscriptionPlan: null,
    activeSubscriptionId: null,
  };

  const affectedCount = await users.countDocuments(filter);
  console.log(`Matched owners to fix: ${affectedCount}`);

  if (!shouldApply) {
    console.log("Dry run complete. Re-run with --apply to update records.");
    await mongoose.disconnect();
    return;
  }

  const result = await users.updateMany(filter, {
    $set: {
      subscriptionStatus: "expired",
      plan: "free",
    },
  });

  console.log(`Modified records: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error("Migration failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
