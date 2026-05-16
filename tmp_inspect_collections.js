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
    const collections = [
      "analytics",
      "orders",
      "reviews",
      "menuitems",
      "users",
      "restaurants",
    ];
    const objId = ObjectId.isValid(restaurantId)
      ? new ObjectId(restaurantId)
      : restaurantId;

    for (const col of collections) {
      const c = db.collection(col);
      let query = { restaurantId: objId };
      if (col === "users" || col === "restaurants") query = {};

      const count = await c.countDocuments(query);
      const sample = await c.find(query).limit(3).toArray();
      console.log(`\nCollection: ${col}`);
      console.log(`Count (filtered by restaurant if applicable): ${count}`);
      console.log("Sample docs:");
      console.log(JSON.stringify(sample, null, 2));
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
