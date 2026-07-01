import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { AppError } from "../middleware/errorHandler";
import { OrderService, OrderStatus } from "../services/order.service";
import { validateObjectId } from "../utils/validation";

const createGuestOrderSchema = Joi.object({
  restaurantId: Joi.string().required(),
  sessionId: Joi.string().min(3).max(200).required(),
  customerName: Joi.string().min(2).max(120).required(),
  customerPhone: Joi.string()
    .regex(/^[0-9+\-()\s]{8,20}$/)
    .required(),
  customerRemark: Joi.string().allow("").max(300).optional(),
  customerCookingRequest: Joi.string().allow("").max(500).optional(),
  items: Joi.array()
    .items(
      Joi.object({
        menuItemId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).max(25).required(),
      }),
    )
    .min(1)
    .required(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "confirmed", "preparing", "completed", "cancelled")
    .required(),
});

export class OrderController {
  static async createGuestOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { error, value } = createGuestOrderSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message).join(", ");
        throw new AppError(400, messages);
      }

      validateObjectId(value.restaurantId);
      value.items.forEach((item: { menuItemId: string }) => {
        validateObjectId(item.menuItemId);
      });

      const order = await OrderService.createGuestOrder(value);

      res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getGuestOrderStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { restaurantId, sessionId, orderId } = req.query;

      if (typeof restaurantId !== "string") {
        throw new AppError(400, "restaurantId is required");
      }

      validateObjectId(restaurantId);

      if (typeof orderId === "string" && orderId.trim()) {
        validateObjectId(orderId);
      }

      if (typeof sessionId === "string" && sessionId.trim()) {
        // sessionId is optional and only used when orderId is not available
      }

      const order = await OrderService.getGuestOrderStatus(
        restaurantId,
        typeof sessionId === "string" && sessionId.trim()
          ? sessionId
          : undefined,
        typeof orderId === "string" ? orderId : undefined,
      );

      res.status(200).json({
        success: true,
        message: "Guest order status retrieved successfully",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRestaurantOrders(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const { restaurantId } = req.params;
      const status = req.query.status as OrderStatus | undefined;

      validateObjectId(restaurantId);

      const data = await OrderService.getRestaurantOrders(
        req.user.userId,
        restaurantId,
        status,
      );

      res.status(200).json({
        success: true,
        message: "Orders retrieved successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateOrderStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new AppError(401, "Authentication required");
      }

      const { id } = req.params;
      validateObjectId(id);

      const { error, value } = updateOrderStatusSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const messages = error.details.map(d => d.message).join(", ");
        throw new AppError(400, messages);
      }

      const order = await OrderService.updateOrderStatus(
        req.user.userId,
        id,
        value.status,
      );

      res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
}
