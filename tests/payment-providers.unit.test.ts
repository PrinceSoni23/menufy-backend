import crypto from "crypto";
import { RazorpayProvider } from "../src/services/payment/providers/RazorpayProvider";
import { PayUProvider } from "../src/services/payment/providers/PayUProvider";
import { PayPalProvider } from "../src/services/payment/providers/PayPalProvider";

describe("Payment provider verification guards", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret";
    process.env.PAYU_MERCHANT_KEY = "payu_key";
    process.env.PAYU_MERCHANT_SALT = "payu_salt";
    process.env.PAYPAL_CLIENT_ID = "paypal_client";
    process.env.PAYPAL_CLIENT_SECRET = "paypal_secret";
    process.env.PAYPAL_WEBHOOK_ID = "paypal_webhook";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("razorpay verifyPayment rejects mismatched order id", async () => {
    const provider = new RazorpayProvider();
    const signature = crypto
      .createHmac("sha256", "rzp_secret")
      .update("order_1|payment_1")
      .digest("hex");

    Object.defineProperty(provider as object, "client", {
      value: {
        payments: {
          fetch: jest.fn().mockResolvedValue({
            amount: 200000,
            currency: "INR",
            status: "captured",
            order_id: "different_order",
          }),
        },
      },
    });

    const result = await provider.verifyPayment({
      orderId: "order_1",
      paymentId: "payment_1",
      signature,
    });

    expect(result.verified).toBe(false);
  });

  test("payu verifyPayment rejects fallback success for mismatched txnid", async () => {
    const provider = new PayUProvider();
    jest.spyOn(crypto, "createHash");

    const params = {
      status: "success",
      txnid: "other_txn",
      amount: "2000.00",
      productinfo: "Monthly Plan",
      firstname: "User",
      email: "user@test.com",
      udf1: "user1",
      udf2: "monthly_inr",
    } as Record<string, string>;

    const reverseHash = crypto
      .createHash("sha512")
      .update(
        [
          "payu_salt",
          params.status,
          "",
          "",
          "",
          params.udf2,
          params.udf1,
          params.email,
          params.firstname,
          params.productinfo,
          params.amount,
          params.txnid,
          "payu_key",
        ].join("|"),
      )
      .digest("hex");

    const axios = require("axios");
    jest.spyOn(axios, "post").mockRejectedValue(new Error("network down"));

    const result = await provider.verifyPayment({
      orderId: "expected_txn",
      paymentId: "mihpayid_1",
      metadata: {
        ...params,
        hash: reverseHash,
      },
    });

    expect(result.verified).toBe(false);
  });

  test("paypal verifyPayment rejects mismatched reference id", async () => {
    const provider = new PayPalProvider();

    Object.defineProperty(provider as object, "getAccessToken", {
      value: jest.fn().mockResolvedValue("token"),
    });
    Object.defineProperty(provider as object, "httpClient", {
      value: {
        post: jest.fn().mockResolvedValue({
          data: {
            id: "order_1",
            status: "COMPLETED",
            purchase_units: [
              {
                reference_id: "different_ref",
                payments: {
                  captures: [
                    {
                      id: "capture_1",
                      amount: { value: "20.00", currency_code: "USD" },
                    },
                  ],
                },
              },
            ],
          },
        }),
      },
    });

    const result = await provider.verifyPayment({
      orderId: "order_1",
      paymentId: "capture_1",
      metadata: { idempotencyKey: "expected_ref" },
    });

    expect(result.verified).toBe(false);
  });
});
