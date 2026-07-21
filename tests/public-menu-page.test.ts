jest.mock("../src/models", () => ({
  QRCode: {
    findOne: jest.fn(),
  },
  Restaurant: {
    findById: jest.fn(),
  },
  QRCodeDevice: {},
  MenuItem: {
    find: jest.fn(),
  },
}));

import { QRCodeService } from "../src/services/qrcode.service";
import { QRCode as QRCodeModel, Restaurant, MenuItem } from "../src/models";

const mockedQRCodeModel = QRCodeModel as jest.Mocked<typeof QRCodeModel>;
const mockedRestaurant = Restaurant as jest.Mocked<typeof Restaurant>;
const mockedMenuItem = MenuItem as jest.Mocked<typeof MenuItem>;

describe("QRCodeService public menu payload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a combined payload for the public menu page", async () => {
    mockedQRCodeModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        restaurantId: "64d1a2b3c4d5e6f708192a3b",
      }),
    } as any);

    mockedRestaurant.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "restaurant-1", name: "Test" }),
    } as any);

    mockedMenuItem.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "item-1", name: "Pizza" }]),
      }),
    } as any);

    const result = await QRCodeService.getPublicMenuPageData("sample-url");

    expect(result).toMatchObject({
      publicUrl: "sample-url",
      restaurantId: "64d1a2b3c4d5e6f708192a3b",
      restaurant: expect.any(Object),
      menuItems: expect.any(Array),
    });
  });
});
