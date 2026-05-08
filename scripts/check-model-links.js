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

async function main() {
  await mongoose.connect(MONGODB_URI, {
    dbName: process.env.MONGODB_DB || undefined,
  });
  console.log("Connected to MongoDB");

  // Define minimal MenuItem schema to read model3DUrl
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

  const missing = [];
  for (const item of items) {
    const url = item.model3DUrl || "";
    // extract filename
    let filename = null;
    try {
      const u = new URL(url);
      filename = path.basename(u.pathname);
    } catch (e) {
      // Not a URL, maybe stored as filename
      filename = path.basename(url);
    }
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) {
      missing.push({
        name: item.name || "(no name)",
        model3DUrl: url,
        filename,
        path: filePath,
      });
    }
  }

  if (missing.length === 0) {
    console.log("No missing files found. All model files exist on disk.");
  } else {
    console.log(`Missing ${missing.length} model files:`);
    missing.forEach(m =>
      console.log(
        `- ${m.filename} referenced by '${m.name}' -> ${m.model3DUrl}`,
      ),
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Error during scan:", err);
  process.exit(2);
});
