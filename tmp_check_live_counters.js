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
    const objId = ObjectId.isValid(restaurantId)
      ? new ObjectId(restaurantId)
      : restaurantId;

    const restaurant = await db
      .collection("restaurants")
      .findOne({ _id: objId });
    const qrCodes = await db
      .collection("qrcodes")
      .find({ restaurantId: objId })
      .project({ totalScans: 1 })
      .toArray();
    const menuItems = await db
      .collection("menuitems")
      .find({ restaurantId: objId })
      .project({ views: 1, arViews: 1, clicks: 1, name: 1 })
      .toArray();

    const totalQRScans = qrCodes.reduce(
      (sum, qr) => sum + (qr.totalScans || 0),
      0,
    );
    const totalModelViews = menuItems.reduce(
      (sum, item) => sum + (item.arViews || 0),
      0,
    );
    const totalDishesVisited = menuItems.filter(
      item => (item.views || 0) > 0 || (item.arViews || 0) > 0,
    ).length;

    console.log(
      JSON.stringify(
        {
          restaurantName: restaurant?.name,
          qrCodeCount: qrCodes.length,
          totalQRScans,
          totalModelViews,
          totalDishesVisited,
          topMenuItems: menuItems
            .sort(
              (a, b) =>
                (b.views || 0) +
                (b.arViews || 0) +
                (b.clicks || 0) -
                ((a.views || 0) + (a.arViews || 0) + (a.clicks || 0)),
            )
            .slice(0, 5)
            .map(item => ({
              name: item.name,
              views: item.views || 0,
              arViews: item.arViews || 0,
              clicks: item.clicks || 0,
            })),
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
