import { Request, Response, NextFunction } from "express";
import { ConversionService } from "../services/conversion.service";
import { MenuService } from "../services/menu.service";
import {
  uploadImage,
  deleteImage,
  resolvePublicBaseUrl,
} from "../utils/uploadHandler";
import { AppError } from "../middleware/errorHandler";
import { MenuItem, Restaurant } from "../models";
import logger from "../utils/logger";
import { validateObjectId } from "../utils/validation";

export class UploadController {
  /**
   * POST /api/upload/menu-item/:restaurantId/:menuItemId
   * Upload 2D image for a menu item (no auto-conversion)
   */
  static async uploadMenuItemImage(
    req: Request & { file?: Express.Multer.File },
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new AppError(401, "Authentication required");
      if (!req.file) throw new AppError(400, "No image file provided");

      const { menuItemId, restaurantId } = req.params;

      // Validate ObjectId formats
      validateObjectId(restaurantId);
      validateObjectId(menuItemId);

      // CRITICAL FIX: Backend file size validation (don't rely on multer alone)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max
      const MIN_FILE_SIZE = 1024; // 1KB min

      if (req.file.size > MAX_FILE_SIZE) {
        deleteImage(req.file.filename);
        throw new AppError(
          413,
          `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        );
      }

      if (req.file.size < MIN_FILE_SIZE) {
        deleteImage(req.file.filename);
        throw new AppError(400, "File size is too small");
      }

      // CRITICAL FIX: Backend MIME type validation
      const ALLOWED_MIME_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        deleteImage(req.file.filename);
        throw new AppError(
          400,
          `File type ${req.file.mimetype} is not allowed. Only JPEG, PNG, WebP, and GIF are supported.`,
        );
      }

      // CRITICAL FIX: Validate file extension matches MIME type
      const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      const fileExt = req.file.originalname
        .substring(req.file.originalname.lastIndexOf("."))
        .toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        deleteImage(req.file.filename);
        throw new AppError(400, `File extension ${fileExt} is not allowed`);
      }

      // Verify ownership
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        deleteImage(req.file.filename);
        throw new AppError(
          403,
          "You do not have permission to upload images for this restaurant",
        );
      }

      // Verify menu item exists
      const menuItem = await MenuItem.findById(menuItemId);
      if (!menuItem) {
        deleteImage(req.file.filename);
        throw new AppError(404, "Menu item not found");
      }

      // Upload image
      const uploadedFile = uploadImage(req.file);
      const imageUrl = `${getPublicBaseUrl(req)}/uploads/images/${uploadedFile.filename}`;

      logger.info(
        `Image uploaded for menu item: ${menuItemId} - ${uploadedFile.filename}`,
      );

      // Update menu item with 2D image
      await MenuItem.findByIdAndUpdate(menuItemId, {
        imageUrl2D: imageUrl,
      });

      res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        data: {
          imageUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/3d-model/:restaurantId/:menuItemId
   * Upload 3D model for a menu item
   */
  static async upload3DModel(
    req: Request & { file?: Express.Multer.File },
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { menuItemId, restaurantId } = req.params;

      // CRITICAL DEBUG LOGGING
      logger.info(
        `[3D UPLOAD] Request received - restaurantId: ${restaurantId}, menuItemId: ${menuItemId}`,
      );
      logger.info(
        `[3D UPLOAD] req.user: ${req.user ? "EXISTS" : "MISSING"}, req.file: ${req.file ? `EXISTS (${req.file.originalname})` : "MISSING"}`,
      );
      logger.info(
        `[3D UPLOAD] Headers: ${JSON.stringify({
          contentType: req.get("content-type"),
          authorization: req.get("authorization") ? "SET" : "MISSING",
        })}`,
      );

      if (!req.user) {
        logger.warn("[3D UPLOAD] Authentication check failed");
        throw new AppError(401, "Authentication required");
      }
      if (!req.file) {
        logger.warn("[3D UPLOAD] File missing in request");
        throw new AppError(400, "No 3D model file provided");
      }

      // Validate ObjectId formats
      validateObjectId(restaurantId);
      validateObjectId(menuItemId);

      // File size validation
      const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB max for 3D models
      const MIN_FILE_SIZE = 1024; // 1KB min

      if (req.file.size > MAX_FILE_SIZE) {
        deleteImage(req.file.filename);
        throw new AppError(
          413,
          `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        );
      }

      if (req.file.size < MIN_FILE_SIZE) {
        deleteImage(req.file.filename);
        throw new AppError(400, "File size is too small");
      }

      // Validate 3D model file types
      const ALLOWED_3D_TYPES = [
        "model/gltf-binary",
        "model/gltf+json",
        "model/obj",
        "application/octet-stream", // Sometimes .glb comes as this
      ];
      const ALLOWED_3D_EXTENSIONS = [".glb", ".gltf", ".obj"];

      const fileExt = req.file.originalname
        .substring(req.file.originalname.lastIndexOf("."))
        .toLowerCase();

      if (!ALLOWED_3D_EXTENSIONS.includes(fileExt)) {
        deleteImage(req.file.filename);
        throw new AppError(
          400,
          `File type ${fileExt} is not allowed. Only .glb, .gltf, and .obj are supported.`,
        );
      }

      // Verify ownership
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant || restaurant.ownerId.toString() !== req.user.userId) {
        deleteImage(req.file.filename);
        throw new AppError(
          403,
          "You do not have permission to upload files for this restaurant",
        );
      }

      // Verify menu item exists
      const menuItem = await MenuItem.findById(menuItemId);
      if (!menuItem) {
        deleteImage(req.file.filename);
        throw new AppError(404, "Menu item not found");
      }

      // Upload 3D model
      const uploadedFile = uploadImage(req.file);
      const model3DUrl = `${resolvePublicBaseUrl(req)}/uploads/images/${uploadedFile.filename}`;

      logger.info(
        `[3D UPLOAD] File processed - filename: ${uploadedFile.filename}, URL: ${model3DUrl}`,
      );

      // Update menu item with 3D model
      logger.info(
        `[3D UPLOAD] Updating MenuItem ${menuItemId} with model3DUrl: ${model3DUrl}`,
      );
      const updatedMenuItem = await MenuItem.findByIdAndUpdate(
        menuItemId,
        {
          model3DUrl,
        },
        { new: true },
      );

      logger.info(
        `[3D UPLOAD] MenuItem update result:`,
        updatedMenuItem
          ? `SUCCESS - ${updatedMenuItem._id}`
          : `FAILED - returned null`,
      );

      res.status(201).json({
        success: true,
        message: "3D model uploaded successfully",
        data: {
          model3DUrl,
          menuItem: updatedMenuItem,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/upload/conversion-status/:jobId
   * DEPRECATED: Conversion feature removed. 3D models are now uploaded directly.
   */
  static async getConversionStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    res.status(410).json({
      success: false,
      message:
        "3D conversion feature has been removed. Please upload 3D models directly.",
    });
  }

  /**
   * POST /api/upload/cancel-conversion/:jobId
   * DEPRECATED: Conversion feature removed
   */
  static async cancelConversion(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    res.status(410).json({
      success: false,
      message: "3D conversion feature has been removed.",
    });
  }

  /**
   * POST /api/upload/retry-conversion/:menuItemId
   * DEPRECATED: Conversion feature removed
   */
  static async retryConversion(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    res.status(410).json({
      success: false,
      message: "3D conversion feature has been removed.",
    });
  }

  /**
   * POST /api/webhooks/conversion-complete
   * DEPRECATED: Conversion feature removed
   */
  static async conversionWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void | Response> {
    return res.status(410).json({
      success: false,
      message: "3D conversion feature has been removed.",
    });
  }
}
