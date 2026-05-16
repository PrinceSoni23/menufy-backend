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

    const seedCount = await analytics.countDocuments({
      restaurantId: objId,
      userAgent: "Test Agent",
    });
    const sample = await analytics
      .find({ restaurantId: objId })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    console.log("seedCount:", seedCount);
    console.log("sample documents:");
    sample.forEach(doc => console.log(JSON.stringify(doc, null, 2)));
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
