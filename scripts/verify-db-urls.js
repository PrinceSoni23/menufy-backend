#!/usr/bin/env node
/**
 * Verify DB sample entries for imageUrl2D and model3DUrl format
 * Usage: node scripts/verify-db-urls.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

async function main() {
  try {
    const mongoUri =
      process.env.MONGO_URI || "mongodb+srv://your-connection-string";

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;
    const menuItems = db.collection("menuitems");

    // Find first 5 items with imageUrl2D
    const samples = await menuItems
      .find({
        imageUrl2D: { $exists: true, $ne: null },
      })
      .limit(5)
      .toArray();

    if (samples.length === 0) {
      console.log("❌ No menu items found with imageUrl2D");
    } else {
      console.log(`\n✅ Found ${samples.length} sample menu items:\n`);
      samples.forEach((item, idx) => {
        console.log(`[${idx + 1}] ${item.name}`);
        console.log(`    ID: ${item._id}`);
        console.log(`    imageUrl2D: ${item.imageUrl2D}`);
        console.log(`    model3DUrl: ${item.model3DUrl || "(not set)"}`);

        // Check if URLs are absolute or relative
        const isImageAbsolute = item.imageUrl2D?.startsWith("http");
        const isModelAbsolute = item.model3DUrl?.startsWith("http");

        console.log(
          `    Format: imageUrl2D is ${isImageAbsolute ? "✓ ABSOLUTE" : "✗ RELATIVE"}, model3DUrl is ${isModelAbsolute ? "✓ ABSOLUTE" : "✗ RELATIVE"}`,
        );
        console.log();
      });

      // Count total items with old (relative) URLs
      const oldFormatCount = await menuItems.countDocuments({
        imageUrl2D: { $exists: true, $not: /^https?:\/\// },
      });

      if (oldFormatCount > 0) {
        console.log(
          `\n⚠️  WARNING: ${oldFormatCount} items still have relative URLs.`,
        );
        console.log("Run migration script to update them to absolute URLs.\n");
      } else {
        console.log(
          "\n✅ All imageUrl2D entries are now using absolute public URLs!\n",
        );
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
