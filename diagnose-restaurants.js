require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: String,
  ownerId: mongoose.Schema.Types.ObjectId,
});

const userSchema = new mongoose.Schema({
  email: String,
  _id: mongoose.Schema.Types.ObjectId,
});

const analyticsSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  eventType: String,
});

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const User = mongoose.model("User", userSchema);
const Analytics = mongoose.model("Analytics", analyticsSchema);

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DATABASE_NAME,
    });
    console.log("\n✓ Connected to MongoDB Atlas\n");

    console.log("=== YOUR RESTAURANTS ===");
    const restaurants = await Restaurant.find().lean();

    if (restaurants.length === 0) {
      console.log("No restaurants found");
    } else {
      for (const rest of restaurants) {
        const analyticsCount = await Analytics.countDocuments({
          restaurantId: rest._id,
        });
        console.log(`\n📍 ${rest.name}`);
        console.log(`   ID: ${rest._id}`);
        console.log(`   Owner ID: ${rest.ownerId}`);
        console.log(`   Analytics events: ${analyticsCount}`);
      }
    }

    console.log("\n\n=== RECENT USERS ===");
    const users = await User.find().limit(5).lean();
    if (users.length > 0) {
      for (const user of users) {
        console.log(`\n👤 ${user.email}`);
        console.log(`   ID: ${user._id}`);
        const ownedRests = await Restaurant.countDocuments({
          ownerId: user._id,
        });
        console.log(`   Restaurants owned: ${ownedRests}`);
      }
    }

    console.log("\n\n=== TOTAL ANALYTICS EVENTS ===");
    const totalEvents = await Analytics.countDocuments();
    const breakdown = await Analytics.aggregate([
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    console.log(`Total: ${totalEvents}`);
    breakdown.forEach(b => console.log(`  ${b._id}: ${b.count}`));

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

diagnose();
