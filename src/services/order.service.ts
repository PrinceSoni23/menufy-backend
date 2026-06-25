import { MenuItem, Order, Restaurant } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "completed"
  | "cancelled";

interface GuestCheckoutItem {
  menuItemId: string;
  quantity: number;
}

interface CreateGuestOrderInput {
  restaurantId: string;
  sessionId: string;
  customerName: string;
  customerPhone: string;
  customerRemark?: string;
  items: GuestCheckoutItem[];
}

const ORDER_STATUS_SET: Set<OrderStatus> = new Set([
  "pending",
  "confirmed",
  "preparing",
  "completed",
  "cancelled",
]);

const buildOrderNumber = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
};

export class OrderService {
  static async createGuestOrder(input: CreateGuestOrderInput): Promise<any> {
    const {
      restaurantId,
      sessionId,
      customerName,
      customerPhone,
      customerRemark,
    } = input;

    const normalizedItems = input.items
      .map(item => ({
        menuItemId: String(item.menuItemId),
        quantity: Number(item.quantity),
      }))
      .filter(
        item =>
          item.menuItemId &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      );

    if (normalizedItems.length === 0) {
      throw new AppError(400, "At least one valid cart item is required");
    }

    const restaurant = await Restaurant.findById(restaurantId).select("_id");
    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    const requestedMenuItemIds = normalizedItems.map(i => i.menuItemId);
    const uniqueMenuItemIds = Array.from(new Set(requestedMenuItemIds));

    const menuItems = await MenuItem.find({
      _id: { $in: uniqueMenuItemIds },
      restaurantId,
      isActive: true,
    })
      .select("_id name price")
      .lean();

    if (menuItems.length !== uniqueMenuItemIds.length) {
      throw new AppError(
        400,
        "One or more cart items are invalid or no longer available",
      );
    }

    const menuItemMap = new Map(
      menuItems.map(item => [String(item._id), item]),
    );

    const lineItems = normalizedItems.map(item => {
      const menuItem = menuItemMap.get(item.menuItemId);
      if (!menuItem) {
        throw new AppError(400, "Invalid cart item detected");
      }

      const unitPrice = Number(menuItem.price || 0);
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));

      return {
        menuItemId: menuItem._id,
        name: String(menuItem.name || "Unnamed Item"),
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      };
    });

    const totalPrice = Number(
      lineItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const totalItems = lineItems.reduce((sum, item) => sum + item.quantity, 0);

    const firstItem = lineItems[0];

    const order = new Order({
      restaurantId,
      sessionId,
      menuItemId: firstItem.menuItemId,
      quantity: firstItem.quantity,
      unitPrice: firstItem.unitPrice,
      totalPrice,
      currency: "INR",
      lineItems,
      totalItems,
      orderNumber: buildOrderNumber(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerRemark: customerRemark?.trim() || "",
      notes: customerRemark?.trim() || "",
      status: "pending",
      source: "guest_menu",
    });

    await order.save();

    logger.info(
      `Guest order created: ${order._id} for restaurant: ${restaurantId}`,
    );

    return order.toObject();
  }

  static async getGuestOrderStatus(
    restaurantId: string,
    sessionId?: string,
    orderId?: string,
  ): Promise<any> {
    const filter: Record<string, unknown> = {
      restaurantId,
    };

    if (orderId) {
      filter._id = orderId;
    } else if (sessionId) {
      filter.sessionId = sessionId;
    }

    const order = await Order.findOne(filter).sort({ createdAt: -1 }).lean();

    return order || null;
  }

  static async getRestaurantOrders(
    ownerId: string,
    restaurantId: string,
    status?: OrderStatus,
  ): Promise<any> {
    const restaurant =
      await Restaurant.findById(restaurantId).select("ownerId _id");
    if (!restaurant) {
      throw new AppError(404, "Restaurant not found");
    }

    if (String(restaurant.ownerId) !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view these orders",
      );
    }

    if (status && !ORDER_STATUS_SET.has(status)) {
      throw new AppError(400, "Invalid order status filter");
    }

    const filter: Record<string, unknown> = { restaurantId };
    if (status) {
      filter.status = status;
    }

    const [orders, counts] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      Order.aggregate([
        { $match: { restaurantId: restaurant._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      completed: 0,
      cancelled: 0,
    };

    counts.forEach((row: any) => {
      statusCounts[String(row._id)] = Number(row.count || 0);
    });

    return {
      orders,
      counts: {
        ...statusCounts,
        active:
          statusCounts.pending +
          statusCounts.confirmed +
          statusCounts.preparing,
      },
    };
  }

  static async updateOrderStatus(
    ownerId: string,
    orderId: string,
    status: OrderStatus,
  ): Promise<any> {
    if (!ORDER_STATUS_SET.has(status)) {
      throw new AppError(400, "Invalid status update");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError(404, "Order not found");
    }

    const restaurant = await Restaurant.findById(order.restaurantId).select(
      "ownerId",
    );
    if (!restaurant || String(restaurant.ownerId) !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to update this order",
      );
    }

    order.status = status;

    const now = new Date();
    if (status === "confirmed" && !order.confirmedAt) {
      order.confirmedAt = now;
    }
    if (status === "preparing" && !order.preparingAt) {
      order.preparingAt = now;
    }
    if (status === "completed") {
      order.completedAt = now;
    }
    if (status === "cancelled") {
      order.cancelledAt = now;
    }

    await order.save();

    logger.info(`Order ${order._id} updated to ${status}`);

    return order.toObject();
  }
}
