const { MongoClient } = require("mongodb");

(async () => {
  const client = new MongoClient("mongodb://localhost:27017/menu_app");
  try {
    await client.connect();
    const db = client.db("menu_app");

    console.log("\n=== ANALYTICS COLLECTION DIAGNOSTICS ===\n");

    const count = await db.collection("analytics").countDocuments();
    console.log("Total analytics events:", count);

    if (count > 0) {
      console.log("\nSample events:");
      const sample = await db
        .collection("analytics")
        .find({})
        .limit(3)
        .toArray();
      sample.forEach(doc => console.log(JSON.stringify(doc, null, 2)));

      console.log("\nEvent types breakdown:");
      const eventTypes = await db
        .collection("analytics")
        .aggregate([
          { $group: { _id: "$eventType", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();
      eventTypes.forEach(et => console.log(`  ${et._id}: ${et.count}`));

      console.log("\nRestaurant IDs in analytics:");
      const restaurants = await db
        .collection("analytics")
        .aggregate([{ $group: { _id: "$restaurantId", count: { $sum: 1 } } }])
        .toArray();
      restaurants.forEach(r => console.log(`  ${r._id}: ${r.count}`));

      console.log("\nDate range of events:");
      const dates = await db
        .collection("analytics")
        .aggregate([
          {
            $group: {
              _id: null,
              minDate: { $min: "$timestamp" },
              maxDate: { $max: "$timestamp" },
            },
          },
        ])
        .toArray();
      if (dates[0]) {
        console.log(`  Min: ${new Date(dates[0].minDate)}`);
        console.log(`  Max: ${new Date(dates[0].maxDate)}`);
      }
    } else {
      console.log("\n*** NO ANALYTICS EVENTS FOUND IN DATABASE ***");
      console.log("This explains why the dashboard shows all zeros.");
      console.log("\nNeed to either:");
      console.log("1. Seed test analytics events");
      console.log("2. Verify the QR menu page is tracking events properly");
      console.log("3. Check if trackEvent endpoint is being called");
    }
  } catch (e) {
    console.error("MongoDB Error:", e.message);
  } finally {
    await client.close();
  }
})();
