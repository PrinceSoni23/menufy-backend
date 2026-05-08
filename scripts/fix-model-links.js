const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Load env from .env.local if present
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const MONGODB_URI =
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in environment");
  process.exit(1);
}

function isLocalhostUrl(url) {
  try {
    const u = new URL(url);
    return /^(localhost|127\.0\.0\.1|::1)$/i.test(u.hostname);
  } catch (e) {
    return false;
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI, {
    dbName: process.env.MONGODB_DB || undefined,
  });
  console.log("Connected to MongoDB");

  const menuItemSchema = new mongoose.Schema({
    model3DUrl: String,
    name: String,
  });
  const MenuItem = mongoose.model("MenuItem", menuItemSchema, "menuitems");

  const items = await MenuItem.find({
    model3DUrl: { $exists: true, $ne: null },
  })
    .lean()
    .exec();
  console.log(`Found ${items.length} menu items with model3DUrl`);

  const uploadsDir = path.join(__dirname, "..", "uploads", "images");

  const toNull = [];

  for (const item of items) {
    const url = item.model3DUrl || "";
    let filename = null;
    try {
      const u = new URL(url);
      filename = path.basename(u.pathname);
    } catch (e) {
      filename = path.basename(url);
    }

    const filePath = path.join(uploadsDir, filename);

    const missing = !fs.existsSync(filePath);
    const badHost = isLocalhostUrl(url);

    if (missing || badHost) {
      toNull.push({
        _id: item._id,
        name: item.name || "(no name)",
        filename,
        missing,
        badHost,
        original: url,
      });
    }
  }

  if (toNull.length === 0) {
    console.log("No entries to null. All model links look good.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Will null model3DUrl for ${toNull.length} items:`);
  toNull.forEach(t =>
    console.log(
      `- ${t.filename} (missing=${t.missing}, localhost=${t.badHost}) referenced by '${t.name}' (${t._id})`,
    ),
  );

  // Proceed to null the fields
  for (const t of toNull) {
    try {
      await MenuItem.updateOne(
        { _id: t._id },
        { $unset: { model3DUrl: "" } },
      ).exec();
      console.log(`Nullified model3DUrl for ${t._id} (${t.name})`);
    } catch (err) {
      console.error(`Failed to update ${t._id}:`, err);
    }
  }

  await mongoose.disconnect();
  console.log("Done. Disconnected from MongoDB.");
  process.exit(0);
}

main().catch(err => {
  console.error("Error during fix:", err);
  process.exit(2);
});
