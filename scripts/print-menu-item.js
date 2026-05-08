const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
const MONGODB_URI =
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI, {
    dbName: process.env.MONGODB_DB || undefined,
  });
  console.log("Connected to MongoDB");

  const menuItemSchema = new mongoose.Schema({}, { strict: false });
  const MenuItem = mongoose.model("MenuItem", menuItemSchema, "menuitems");

  const nameQuery = process.argv[2] || "handi";
  const item = await MenuItem.findOne({
    name: new RegExp(`^${nameQuery}$`, "i"),
  })
    .lean()
    .exec();
  if (!item) {
    console.log(`No menu item found with name matching '${nameQuery}'`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("Found item:", item._id.toString(), item.name);
  console.log("model3DUrl field:", item.model3DUrl);

  const uploadsDir = path.join(__dirname, "..", "uploads", "images");
  let filename = null;
  try {
    const u = new URL(item.model3DUrl);
    filename = path.basename(u.pathname);
  } catch (e) {
    filename = item.model3DUrl ? path.basename(item.model3DUrl) : null;
  }

  if (filename) {
    const fp = path.join(uploadsDir, filename);
    console.log("Resolved filename:", filename);
    console.log("File exists on disk:", fs.existsSync(fp), fp);
  } else {
    console.log("No filename could be resolved from model3DUrl");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(2);
});
