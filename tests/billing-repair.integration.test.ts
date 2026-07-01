import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../src/models/User";
import { Payment } from "../src/models/Payment";
import { Subscription } from "../src/models/Subscription";
import { repairBillingState } from "../src/services/billingRepair.service";

jest.setTimeout(600000);

describe("Billing repair integration", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: "6.0.6" } });
    await mongoose.connect(mongo.getUri(), { dbName: "billing-repair-test" });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    const collections = Object.keys(mongoose.connection.collections);
    for (const name of collections) {
      await mongoose.connection.collections[name].deleteMany({});
    }
  });

  test("expires stale active users and revives missing entitlements from paid payments", async () => {
    const expiredUser = await User.create({
      email: "expired@test.com",
      passwordHash: "hash123",
      firstName: "Expired",
      lastName: "User",
      businessName: "Expired Biz",
      role: "owner",
      plan: "pro",
      subscriptionStatus: "active",
      subscriptionPlan: "monthly_inr",
      subscriptionStartDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      subscriptionEndDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paymentGateway: "razorpay",
      emailVerified: true,
      lastLogin: new Date(),
      notifications: { email: true, push: false, analytics: true },
    });

    await Subscription.create({
      userId: expiredUser._id,
      planId: "monthly_inr",
      gateway: "razorpay",
      status: "active",
      autoRenew: false,
      isRecurring: false,
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      metadata: {},
    });

    const reviveUser = await User.create({
      email: "revive@test.com",
      passwordHash: "hash123",
      firstName: "Revive",
      lastName: "User",
      businessName: "Revive Biz",
      role: "owner",
      plan: "free",
      subscriptionStatus: "expired",
      subscriptionPlan: null,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      paymentGateway: null,
      emailVerified: true,
      lastLogin: new Date(),
      notifications: { email: true, push: false, analytics: true },
    });

    await Payment.create({
      userId: reviveUser._id,
      gateway: "payu",
      orderId: "txn_repair_1",
      paymentId: "mihpayid_1",
      planId: "monthly_inr",
      amount: 200000,
      amountDisplay: 2000,
      currency: "INR",
      status: "paid",
      invoiceNumber: "INV-TEST-0001",
      isRecurring: false,
      idempotencyKey: "repair-key-1",
      metadata: { source: "test" },
    });

    const stalePayment = await Payment.create({
      userId: reviveUser._id,
      gateway: "payu",
      orderId: "txn_stale_1",
      paymentId: "",
      planId: "monthly_inr",
      amount: 200000,
      amountDisplay: 2000,
      currency: "INR",
      status: "pending",
      invoiceNumber: "INV-TEST-0002",
      isRecurring: false,
      idempotencyKey: "repair-key-2",
      metadata: { source: "test" },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const result = await repairBillingState(new Date());

    expect(result.expiredUsers).toBe(1);
    expect(result.revivedUsers).toBe(1);
    expect(result.cancelledPendingPayments).toBe(1);

    const expiredUserAfter = await User.findById(expiredUser._id).lean();
    expect(expiredUserAfter?.subscriptionStatus).toBe("expired");
    expect(expiredUserAfter?.plan).toBe("free");

    const reviveUserAfter = await User.findById(reviveUser._id).lean();
    expect(reviveUserAfter?.subscriptionStatus).toBe("active");
    expect(reviveUserAfter?.paymentGateway).toBe("payu");

    const revivedSubscription = await Subscription.findOne({
      userId: reviveUser._id,
      status: "active",
    }).lean();
    expect(revivedSubscription).toBeTruthy();

    const stalePaymentAfter = await Payment.findById(stalePayment._id).lean();
    expect(stalePaymentAfter?.status).toBe("cancelled");
  });
});
