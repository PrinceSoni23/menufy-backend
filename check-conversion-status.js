const { MongoClient } = require("mongodb");

const MONGODB_URI =
  "mongodb+srv://princesoni21332:U472bmtp@cluster1.modcibs.mongodb.net/ar-menu?retryWrites=true&w=majority";

(async () => {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db("ar-menu");

    console.log("=== RECENT MENU ITEMS ===");
    const menuItems = await db
      .collection("menuitems")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    menuItems.forEach(item => {
      console.log(`\nName: ${item.name}`);
      console.log(`Status: ${item.status}`);
      console.log(`ImageURL: ${item.imageUrl2D ? "YES" : "NO"}`);
      console.log(`ModelURL: ${item.modelUrl ? "YES" : "NO"}`);
      console.log(`CreatedAt: ${item.createdAt}`);
    });

    console.log("\n\n=== CONVERSION JOBS ===");
    const jobs = await db
      .collection("conversionjobs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (jobs.length === 0) {
      console.log("❌ No conversion jobs found! This means:");
      console.log("   - ConversionService.submitForConversion() is failing");
      console.log("   - Likely cause: Tripo AI authentication (401 error)");
      console.log(
        "\nFIX: Update TRIPO_CLIENT_ID and TRIPO_CLIENT_SECRET in .env.local",
      );
    } else {
      jobs.forEach(job => {
        console.log(`\nJobID: ${job._id}`);
        console.log(`Status: ${job.status}`);
        console.log(`TripoJobID: ${job.tripoJobId || "NOT SET"}`);
        console.log(`CreatedAt: ${job.createdAt}`);
      });
    }

    await client.close();
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
