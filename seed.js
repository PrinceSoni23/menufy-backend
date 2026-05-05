require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

// Simple models for seeding
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "owner" },
  createdAt: { type: Date, default: Date.now },
});

const restaurantSchema = new mongoose.Schema({
  ownerId: mongoose.Schema.Types.ObjectId,
  name: String,
  description: String,
  cuisine: [String],
  address: String,
  city: String,
  phone: String,
  qrCodeId: mongoose.Schema.Types.ObjectId,
  publicUrl: String,
  totalMenuItems: { type: Number, default: 0 },
  totalScans: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  theme: {
    primaryColor: { type: String, default: "#FF6B35" },
    fontFamily: { type: String, default: "Inter" },
    layout: { type: String, default: "grid" },
  },
  createdAt: { type: Date, default: Date.now },
});

const qrcodeSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  code: String,
  qrDataUrl: String,
  publicUrl: String,
  totalScans: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const menuItemSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  name: String,
  description: String,
  category: String,
  price: Number,
  discount: { type: Number, default: 0 },
  imageUrl: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const QRCode = mongoose.model("QRCode", qrcodeSchema);
const MenuItem = mongoose.model("MenuItem", menuItemSchema);

async function seed() {
  try {
    await mongoose.connect(process.env.DATABASE_URL || process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Your actual restaurant ID with 15 dishes
    const ACTUAL_RESTAURANT_ID = "69d8b9057e1081f915428d8a";

    // Find or get the actual restaurant
    const restaurant = await Restaurant.findById(ACTUAL_RESTAURANT_ID);
    if (!restaurant) {
      console.error("Restaurant not found with ID:", ACTUAL_RESTAURANT_ID);
      process.exit(1);
    }

    console.log(
      "Found restaurant:",
      restaurant.name,
      "with ID:",
      restaurant._id,
    );
    console.log("Restaurant has", restaurant.totalMenuItems, "menu items");

    // Find the QR code for this restaurant
    let qrcode = await QRCode.findOne({ restaurantId: restaurant._id });

    if (!qrcode) {
      // Create new QR code if it doesn't exist
      qrcode = new QRCode({
        restaurantId: restaurant._id,
        code: "kitchen",
        qrDataUrl:
          "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=kitchen",
        publicUrl: restaurant.publicUrl,
      });
      await qrcode.save();
      console.log("QR Code created:", qrcode._id);
    } else {
      // Update existing QR code with "kitchen" as the code
      qrcode.code = "kitchen";
      qrcode.qrDataUrl =
        "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=kitchen";
      await qrcode.save();
      console.log("QR Code updated with code 'kitchen':", qrcode._id);
    }

    // Link QR code to restaurant if not already linked
    if (!restaurant.qrCodeId) {
      restaurant.qrCodeId = qrcode._id;
      await restaurant.save();
      console.log("Restaurant linked with QR code");
    }

    console.log("\n✅ Seeding complete!");
    console.log("Restaurant:", restaurant.name);
    console.log("Restaurant ID:", restaurant._id);
    console.log("Menu items:", restaurant.totalMenuItems);
    console.log("QR Code:", "kitchen");
    console.log("You can now visit: http://localhost:3000/menu/kitchen");

    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

seed();
