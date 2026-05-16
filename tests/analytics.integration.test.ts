import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AnalyticsService } from "../src/services/analytics.service";
import { Analytics, Restaurant } from "../src/models";

// allow slower startup for in-memory mongo (10 minutes)
jest.setTimeout(600000);

describe("Analytics integration (in-memory)", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    try {
      mongo = await MongoMemoryServer.create({
        // pin a stable binary version to avoid long auto-detection delays
        binary: { version: "6.0.6" },
      });
      const uri = mongo.getUri();
      await mongoose.connect(uri, { dbName: "test" });
    } catch (err) {
      console.error("Failed to start in-memory mongo:", err);
      throw err;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    // clear collections
    const collections = Object.keys(mongoose.connection.collections);
    for (const name of collections) {
      await mongoose.connection.collections[name].deleteMany({});
    }
  });

  test("getEngagementFunnel normalizes conversion percentages (restaurant: handi)", async () => {
    // Create restaurant 'handi'
    const restaurant = await Restaurant.create({
      ownerId: new mongoose.Types.ObjectId(),
      name: "handi",
      address: "123 Test St",
      city: "Testville",
      phone: "555-0100",
    });

    const rid = restaurant._id;
    const now = new Date();
    const earlier = new Date(now.getTime() - 1000 * 60 * 60);

    // Seed events:
    // session s1: scan, view, add_to_cart
    // session s2: scan, add_to_cart, add_to_cart (multiple adds)
    const events = [
      { sessionId: "s1", eventType: "scan" },
      { sessionId: "s1", eventType: "view" },
      { sessionId: "s1", eventType: "add_to_cart" },

      { sessionId: "s2", eventType: "scan" },
      { sessionId: "s2", eventType: "add_to_cart" },
      { sessionId: "s2", eventType: "add_to_cart" },
    ];

    for (const e of events) {
      await Analytics.create({
        restaurantId: rid,
        sessionId: e.sessionId,
        eventType: e.eventType as any,
        timestamp: earlier,
        deviceType: "Web",
      });
    }

    const res = await AnalyticsService.getEngagementFunnel(
      rid.toString(),
      new Date(earlier.getTime() - 1000),
      new Date(now.getTime() + 1000),
    );

    // Expect normalized percentages: scan->view 50%, view->add 100%, end->end 100%
    expect(res).toBeDefined();
    const summary = res.summary;
    expect(summary.totalScans).toBe(2);
    expect(summary.scanToViewConversion).toBe(50);
    expect(summary.viewToAddConversion).toBe(100);
    expect(summary.endToEndConversion).toBe(100);
  });
});
