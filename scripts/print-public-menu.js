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

  const QRSchema = new mongoose.Schema({}, { strict: false });
  const QR = mongoose.model("QRCode", QRSchema, "qrcodes");

  const MenuItem = mongoose.model(
    "MenuItem",
    new mongoose.Schema({}, { strict: false }),
    "menuitems",
  );

  const publicUrl = process.argv[2] || "handi";
  const qr = await QR.findOne({ publicUrl }).lean().exec();
  if (!qr) {
    console.log(`No QR code found for publicUrl='${publicUrl}'`);
    await mongoose.disconnect();
    process.exit(0);
  }
  console.log("QR found:", qr._id.toString(), "restaurantId:", qr.restaurantId);

  const items = await MenuItem.find({ restaurantId: qr.restaurantId })
    .lean()
    .exec();
  console.log(
    `Found ${items.length} menu items for restaurant ${qr.restaurantId}`,
  );
  items.forEach(it => {
    const name = it.name || "(no name)";
    const model = it.model3DUrl || null;
    let filename = null;
    try {
      filename = new URL(model).pathname.split("/").pop();
    } catch (e) {
      filename = model ? path.basename(model) : null;
    }
    const filepathImage = filename
      ? path.join(__dirname, "..", "uploads", "images", filename)
      : null;
    const filepathModel = filename
      ? path.join(__dirname, "..", "uploads", "3d-models", filename)
      : null;
    const existsImage = filepathImage ? fs.existsSync(filepathImage) : false;
    const existsModel = filepathModel ? fs.existsSync(filepathModel) : false;
    const existsText = existsImage
      ? "images"
      : existsModel
        ? "3d-models"
        : "none";
    console.log(
      `- ${it._id} | ${name} | model3DUrl: ${model} | fileExists: ${existsText} ${
        existsImage ? filepathImage : existsModel ? filepathModel : ""
      }`,
    );
  });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(2);
});
