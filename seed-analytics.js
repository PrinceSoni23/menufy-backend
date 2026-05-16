require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  eventType: String,
  menuItemId: mongoose.Schema.Types.ObjectId,
  deviceType: String,
  sessionId: String,
  timestamp: Date,
  userAgent: String,
  ipAddress: String,
});

const restaurantSchema = new mongoose.Schema({
  name: String,
  ownerId: mongoose.Schema.Types.ObjectId,
});

const menuItemSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  name: String,
});

const Analytics = mongoose.model("Analytics", analyticsSchema);
const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const MenuItem = mongoose.model("MenuItem", menuItemSchema);

async function seedAnalytics() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DATABASE_NAME,
    });
    console.log("\n✓ Connected to MongoDB Atlas");

    // Find first restaurant or create a test one
    let restaurant = await Restaurant.findOne();

    if (!restaurant) {
      console.log("\n⚠ No restaurants found. Creating test restaurant...");
      const ownerId = new mongoose.Types.ObjectId();
      restaurant = await Restaurant.create({
        name: "Test Restaurant",
        ownerId,
      });
      console.log(`✓ Created test restaurant: ${restaurant._id}`);
    }

    const restaurantId = restaurant._id;
    console.log(`Using restaurant: ${restaurantId} (${restaurant.name})`);

    // Find or create menu items
    let menuItems = await MenuItem.find({ restaurantId }).limit(10);

    if (menuItems.length === 0) {
      console.log("\n⚠ No menu items found. Creating test items...");
      const testItems = [
        "Margherita Pizza",
        "Pepperoni Pizza",
        "Vegetable Burger",
        "Caesar Salad",
        "Grilled Chicken",
        "Fish Tacos",
        "Pasta Carbonara",
        "Chicken Wings",
        "Nachos",
        "Tiramisu",
      ];

      const items = testItems.map(name => ({
        restaurantId,
        name,
      }));

      menuItems = await MenuItem.insertMany(items);
      console.log(`✓ Created ${menuItems.length} test menu items`);
    }

    // Clear existing analytics
    const deleteResult = await Analytics.deleteMany({ restaurantId });
    console.log(
      `\nCleared ${deleteResult.deletedCount} existing analytics events`,
    );

    // Generate synthetic analytics events
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const sessions = Array.from(
      { length: 80 },
      () => `session-${Math.random().toString(36).substr(2, 9)}`,
    );

    const events = [];

    for (let day = 0; day < 30; day++) {
      const dayStart = new Date(
        startDate.getTime() + day * 24 * 60 * 60 * 1000,
      );
      dayStart.setHours(8, 0, 0, 0); // Start at 8 AM

      // 60-120 sessions per day
      const sessionsToday = sessions.slice(
        0,
        60 + Math.floor(Math.random() * 60),
      );

      for (const sessionId of sessionsToday) {
        const sessionStart = new Date(
          dayStart.getTime() + Math.random() * 12 * 60 * 60 * 1000,
        );
        let lastEventTime = sessionStart;

        // SCAN EVENT (always first)
        events.push({
          restaurantId,
          eventType: "scan",
          sessionId,
          deviceType: Math.random() > 0.6 ? "Mobile" : "Web",
          timestamp: sessionStart,
          userAgent: "Test Agent",
          ipAddress: "127.0.0.1",
        });

        // VIEW EVENT (~85% of scans)
        if (Math.random() > 0.15) {
          lastEventTime = new Date(
            lastEventTime.getTime() + 15000 + Math.random() * 30000,
          );
          events.push({
            restaurantId,
            eventType: "view",
            sessionId,
            deviceType: Math.random() > 0.6 ? "Mobile" : "Web",
            timestamp: lastEventTime,
            userAgent: "Test Agent",
            ipAddress: "127.0.0.1",
          });

          // AR VIEW EVENT (~25% of view sessions, mobile only)
          if (Math.random() > 0.75) {
            lastEventTime = new Date(
              lastEventTime.getTime() + 20000 + Math.random() * 40000,
            );
            events.push({
              restaurantId,
              eventType: "ar_view",
              menuItemId:
                menuItems[Math.floor(Math.random() * menuItems.length)]._id,
              sessionId,
              deviceType: "Mobile",
              timestamp: lastEventTime,
              userAgent: "Test Agent",
              ipAddress: "127.0.0.1",
            });
          }

          // ADD TO CART EVENT (~50% of views)
          if (Math.random() > 0.5) {
            lastEventTime = new Date(
              lastEventTime.getTime() + 30000 + Math.random() * 120000,
            );

            // First item
            events.push({
              restaurantId,
              eventType: "add_to_cart",
              menuItemId:
                menuItems[Math.floor(Math.random() * menuItems.length)]._id,
              sessionId,
              deviceType: Math.random() > 0.6 ? "Mobile" : "Web",
              timestamp: lastEventTime,
              userAgent: "Test Agent",
              ipAddress: "127.0.0.1",
            });

            // Second item (~60% of the time)
            if (Math.random() > 0.4) {
              lastEventTime = new Date(
                lastEventTime.getTime() + 15000 + Math.random() * 30000,
              );
              events.push({
                restaurantId,
                eventType: "add_to_cart",
                menuItemId:
                  menuItems[Math.floor(Math.random() * menuItems.length)]._id,
                sessionId,
                deviceType: Math.random() > 0.6 ? "Mobile" : "Web",
                timestamp: lastEventTime,
                userAgent: "Test Agent",
                ipAddress: "127.0.0.1",
              });
            }

            // CART ABANDONED EVENT (~40% of cart sessions)
            if (Math.random() > 0.6) {
              lastEventTime = new Date(
                lastEventTime.getTime() + 60000 + Math.random() * 600000,
              );
              events.push({
                restaurantId,
                eventType: "cart_abandoned",
                sessionId,
                deviceType: Math.random() > 0.6 ? "Mobile" : "Web",
                timestamp: lastEventTime,
                userAgent: "Test Agent",
                ipAddress: "127.0.0.1",
              });
            }
          }
        }
      }
    }

    // Insert all events
    await Analytics.insertMany(events);
    console.log(`\n✓ Seeded ${events.length} analytics events over 30 days`);

    // Show breakdown
    console.log("\nEvent breakdown:");
    const breakdown = await Analytics.aggregate([
      { $match: { restaurantId } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    breakdown.forEach(b => {
      const icon =
        {
          scan: "🔍",
          view: "👀",
          ar_view: "📱",
          add_to_cart: "🛒",
          cart_abandoned: "❌",
        }[b._id] || "📊";
      console.log(`  ${icon} ${b._id}: ${b.count}`);
    });

    // Calculate some metrics
    const totalSessions = await Analytics.distinct("sessionId", {
      restaurantId,
    });
    const cartSessions = await Analytics.distinct("sessionId", {
      restaurantId,
      eventType: "add_to_cart",
    });
    const abandonedSessions = await Analytics.distinct("sessionId", {
      restaurantId,
      eventType: "cart_abandoned",
    });

    console.log("\nMetrics:");
    console.log(`  📊 Total sessions: ${totalSessions.length}`);
    console.log(`  🛒 Sessions with cart: ${cartSessions.length}`);
    console.log(`  ❌ Abandoned carts: ${abandonedSessions.length}`);
    console.log(
      `  📈 Abandonment rate: ${((abandonedSessions.length / cartSessions.length) * 100).toFixed(1)}%`,
    );

    console.log(`\n✓ SETUP COMPLETE!`);
    console.log(`\n📋 To view this data in your dashboard:`);
    console.log(`   Restaurant ID: ${restaurantId}`);
    console.log(
      `   Use this ID when selecting a restaurant in the analytics dashboard`,
    );

    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("\n✗ Seed error:", error.message);
    process.exit(1);
  }
}

seedAnalytics();
