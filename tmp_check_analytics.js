const mongoose = require("mongoose");
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
    const orders = db.collection("orders");
    const reviews = db.collection("reviews");
    const menuitems = db.collection("menuitems");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    // Use ObjectId for collections that store restaurantId as ObjectId
    const objId = ObjectId.isValid(restaurantId)
      ? new ObjectId(restaurantId)
      : restaurantId;
    const queryBase = {
      restaurantId: objId,
      timestamp: { $gte: monthStart, $lte: monthEnd },
    };

    const scanCount = await analytics.countDocuments({
      ...queryBase,
      eventType: "scan",
    });
    const viewCount = await analytics.countDocuments({
      ...queryBase,
      eventType: "view",
    });
    const arViewCount = await analytics.countDocuments({
      ...queryBase,
      eventType: "ar_view",
    });
    const addToCartCount = await analytics.countDocuments({
      ...queryBase,
      eventType: "add_to_cart",
    });
    const distinctSessions = await analytics.distinct("sessionId", queryBase);

    const completedOrders = await orders.countDocuments({
      restaurantId: objId,
      status: "completed",
      createdAt: { $gte: monthStart, $lte: monthEnd },
    });
    const totalOrders = await orders.countDocuments({ restaurantId: objId });
    const reviewsCount = await reviews.countDocuments({
      restaurantId: objId,
      createdAt: { $gte: monthStart, $lte: monthEnd },
    });

    const topAddToCart = await analytics
      .aggregate([
        {
          $match: {
            restaurantId: objId,
            eventType: "add_to_cart",
            timestamp: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: "$menuItemId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    console.log(
      JSON.stringify(
        {
          monthStart,
          monthEnd,
          scanCount,
          viewCount,
          arViewCount,
          addToCartCount,
          distinctSessions: distinctSessions.length,
          completedOrders,
          totalOrders,
          reviewsCount,
          topAddToCart,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
