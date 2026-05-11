#!/usr/bin/env node
/**
 * Migration: Convert relative upload URLs to absolute public URLs
 * This updates all existing menu items with relative paths to use absolute URLs
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." API_URL="https://yourdomain.com" node migrate-urls.js
 *
 * Or set in .env and run:
 *   node migrate-urls.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const apiUrl = process.env.API_URL || "http://localhost:5000";

  if (!mongoUri) {
    console.error(
      "❌ MONGODB_URI environment variable is required\n" +
        "Set it in .env or pass it as: MONGODB_URI=... node migrate-urls.js",
    );
    process.exit(1);
  }

  console.log("🔄 MongoDB URL Migration");
  console.log("========================\n");
  console.log(`📍 MongoDB: ${mongoUri.replace(/:[^@]*@/, ":****@")}`);
  console.log(`🌐 API URL: ${apiUrl}\n`);

  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected\n");

    const db = mongoose.connection.db;
    const menuItems = db.collection("menuitems");

    // Find items with relative imageUrl2D (not starting with http)
    const relativeImageItems = await menuItems
      .find({
        imageUrl2D: { $exists: true, $not: /^https?:\/\// },
      })
      .toArray();

    const relativeModelItems = await menuItems
      .find({
        model3DUrl: { $exists: true, $ne: null, $not: /^https?:\/\// },
      })
      .toArray();

    console.log(`📊 Found:`);
    console.log(
      `   - ${relativeImageItems.length} items with relative imageUrl2D`,
    );
    console.log(
      `   - ${relativeModelItems.length} items with relative model3DUrl\n`,
    );

    let updatedCount = 0;

    // Update imageUrl2D from relative to absolute
    if (relativeImageItems.length > 0) {
      console.log(`🔄 Updating imageUrl2D paths...`);
      for (const item of relativeImageItems) {
        const oldUrl = item.imageUrl2D;
        let newUrl;

        // Handle various relative path formats
        if (oldUrl.startsWith("/uploads/")) {
          newUrl = `${apiUrl}${oldUrl}`;
        } else if (oldUrl.startsWith("uploads/")) {
          newUrl = `${apiUrl}/uploads/${oldUrl.replace("uploads/", "")}`;
        } else {
          newUrl = `${apiUrl}/uploads/images/${oldUrl}`;
        }

        try {
          await menuItems.updateOne(
            { _id: item._id },
            { $set: { imageUrl2D: newUrl } },
          );
          updatedCount++;
          console.log(`   ✓ ${item.name}: ${oldUrl} → ${newUrl}`);
        } catch (error) {
          console.error(`   ✗ ${item.name}: ${error.message}`);
        }
      }
    }

    // Update model3DUrl from relative to absolute
    if (relativeModelItems.length > 0) {
      console.log(`\n🔄 Updating model3DUrl paths...`);
      for (const item of relativeModelItems) {
        const oldUrl = item.model3DUrl;
        let newUrl;

        if (oldUrl.startsWith("/uploads/")) {
          newUrl = `${apiUrl}${oldUrl}`;
        } else if (oldUrl.startsWith("uploads/")) {
          newUrl = `${apiUrl}/${oldUrl}`;
        } else {
          newUrl = `${apiUrl}/uploads/3d-models/${oldUrl}`;
        }

        try {
          await menuItems.updateOne(
            { _id: item._id },
            { $set: { model3DUrl: newUrl } },
          );
          updatedCount++;
          console.log(`   ✓ ${item.name}: ${oldUrl} → ${newUrl}`);
        } catch (error) {
          console.error(`   ✗ ${item.name}: ${error.message}`);
        }
      }
    }

    if (updatedCount === 0) {
      console.log(`\n✅ No migration needed - all URLs are already absolute!`);
    } else {
      console.log(`\n✅ Successfully updated ${updatedCount} entries`);
    }

    // Verify results
    console.log(`\n📋 Verification:`);
    const stillRelative = await menuItems
      .find({
        $or: [
          { imageUrl2D: { $exists: true, $not: /^https?:\/\// } },
          { model3DUrl: { $exists: true, $ne: null, $not: /^https?:\/\// } },
        ],
      })
      .toArray();

    if (stillRelative.length === 0) {
      console.log(`   ✅ All URLs are now absolute public URLs`);
    } else {
      console.log(
        `   ⚠️  ${stillRelative.length} items still have relative URLs`,
      );
      stillRelative.forEach(item => {
        console.log(`      - ${item.name}`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
