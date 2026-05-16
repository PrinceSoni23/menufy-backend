const { MongoClient, ObjectId } = require("mongodb");

async function run() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb+srv://princesoni21332:U472bmtp@cluster1.modcibs.mongodb.net/ar-menu";
  const dbName = process.env.DATABASE_NAME || "ar-menu";
  const restaurantId = process.argv[2] || "69d8b9057e1081f915428d8a";
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    const analytics = db.collection("analytics");

    const objId = ObjectId.isValid(restaurantId)
      ? new ObjectId(restaurantId)
      : restaurantId;

    // Delete seeded events (Test Agent + localhost IP)
    const deleteFilter = {
      restaurantId: objId,
      userAgent: "Test Agent",
      ipAddress: "127.0.0.1",
    };
    const deleteResult = await analytics.deleteMany(deleteFilter);
    console.log(
      `Deleted ${deleteResult.deletedCount} seeded analytics events for restaurant ${restaurantId}`,
    );

    // Start watching for new real inserts (exclude Test Agent)
    const pipeline = [
      {
        $match: {
          operationType: "insert",
          $and: [
            {
              $or: [
                { "fullDocument.restaurantId": objId },
                { "fullDocument.restaurantId": restaurantId },
              ],
            },
            { "fullDocument.userAgent": { $ne: "Test Agent" } },
          ],
        },
      },
    ];

    const changeStream = analytics.watch(pipeline, { fullDocument: "default" });
    console.log(
      "Watching for new real analytics inserts for 60 seconds... (press Ctrl+C to stop early)",
    );

    const timer = setTimeout(async () => {
      await changeStream.close();
      await client.close();
      console.log("Finished watching (timeout)");
      process.exit(0);
    }, 60000);

    changeStream.on("change", change => {
      console.log("Observed new analytics insert:");
      console.log(JSON.stringify(change.fullDocument, null, 2));
    });

    changeStream.on("error", async err => {
      console.error("Change stream error:", err);
      clearTimeout(timer);
      try {
        await changeStream.close();
      } catch (e) {}
      try {
        await client.close();
      } catch (e) {}
      process.exit(1);
    });
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
