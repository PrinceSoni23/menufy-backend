import { OrderService } from "../src/services/order.service";

const mockRestaurantFindById = jest.fn();
const mockMenuItemFind = jest.fn();
const mockOrderSave = jest.fn();
const mockOrderToObject = jest.fn();

jest.mock("../src/models", () => ({
  Restaurant: {
    findById: (...args: unknown[]) => mockRestaurantFindById(...args),
  },
  MenuItem: {
    find: (...args: unknown[]) => mockMenuItemFind(...args),
  },
  Order: jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: mockOrderSave,
    toObject: mockOrderToObject,
  })),
}));

describe("OrderService cooking requests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRestaurantFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: "restaurant-1" }),
    });

    mockMenuItemFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "item-1",
            name: "Paneer Tikka",
            price: 120,
          },
        ]),
      }),
    });

    mockOrderSave.mockResolvedValue(undefined);
    mockOrderToObject.mockImplementation(function (this: any) {
      return this;
    });
  });

  it("persists a cooking request on a guest order", async () => {
    const result = await OrderService.createGuestOrder({
      restaurantId: "restaurant-1",
      sessionId: "session-1",
      customerName: "Asha",
      customerPhone: "9876543210",
      customerCookingRequest: "Extra spicy and dairy-free",
      items: [{ menuItemId: "item-1", quantity: 2 }],
    } as any);

    expect(result.customerCookingRequest).toBe("Extra spicy and dairy-free");
  });
});
