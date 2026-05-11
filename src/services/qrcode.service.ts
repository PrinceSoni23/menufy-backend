import QRCode from "qrcode";
import { QRCode as QRCodeModel, Restaurant } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import { generateShortCode } from "../utils/urlGenerator";
import { resolvePublicBaseUrl } from "../utils/uploadHandler";

export class QRCodeService {
  /**
   * Generate QR code for restaurant
   */
  static async generateQRCode(
    restaurantId: string,
    ownerId: string,
    publicUrl: string,
    appUrl?: string,
  ): Promise<any> {
    // Verify ownership
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to generate QR code for this restaurant",
      );
    }

    // Check if QR code already exists
    let qrCode = await QRCodeModel.findOne({ restaurantId });

    const code = generateShortCode();
    // Use resolvePublicBaseUrl() which respects PUBLIC_API_URL env var
    const baseUrl = resolvePublicBaseUrl();
    const fullPublicUrl = `${baseUrl}/menu/${publicUrl}?v=${code}`;

    try {
      // Generate QR code data URL
      const qrDataUrl = await QRCode.toDataURL(fullPublicUrl, {
        type: "image/png",
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      if (qrCode) {
        // Update existing QR code
        qrCode.code = code;
        qrCode.qrDataUrl = qrDataUrl;
        qrCode.publicUrl = publicUrl;
        await qrCode.save();
      } else {
        // Create new QR code
        qrCode = new QRCodeModel({
          restaurantId,
          code,
          qrDataUrl,
          publicUrl,
        });
        await qrCode.save();

        // Update restaurant with QR code reference
        restaurant.qrCodeId = qrCode._id;
        await restaurant.save();
      }

      logger.info(`QR code generated for restaurant: ${restaurantId}`);

      return qrCode.toObject();
    } catch (error) {
      logger.error(`Failed to generate QR code: ${error}`);
      throw new AppError(500, "Failed to generate QR code");
    }
  }

  /**
   * Get QR code for restaurant
   */
  static async getQRCode(restaurantId: string, ownerId: string): Promise<any> {
    // Verify ownership
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view this QR code",
      );
    }

    const qrCode = await QRCodeModel.findOne({ restaurantId });

    if (!qrCode) {
      throw new AppError(404, "QR code not found");
    }

    return qrCode.toObject();
  }

  /**
   * Get QR code analytics
   */
  static async getQRCodeAnalytics(
    restaurantId: string,
    ownerId: string,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(
        403,
        "You do not have permission to view this analytics",
      );
    }

    const qrCode = await QRCodeModel.findOne({ restaurantId });

    if (!qrCode) {
      throw new AppError(404, "QR code not found");
    }

    return {
      restaurantId,
      totalScans: qrCode.totalScans,
      scansToday: qrCode.scansToday,
      lastScannedAt: qrCode.lastScannedAt,
      uniqueDevices: qrCode.uniqueDevices,
      code: qrCode.code,
      publicUrl: qrCode.publicUrl,
    };
  }

  /**
   * Track QR code scan
   */
  static async trackQRCodeScan(code: string, deviceId: string): Promise<any> {
    const qrCode = await QRCodeModel.findOne({ code });

    if (!qrCode) {
      throw new AppError(404, "QR code not found");
    }

    qrCode.totalScans = (qrCode.totalScans || 0) + 1;
    qrCode.scansToday = (qrCode.scansToday || 0) + 1;
    qrCode.lastScannedAt = new Date();

    // This is simplified - in production you'd track unique devices properly
    if (deviceId) {
      qrCode.uniqueDevices = (qrCode.uniqueDevices || 0) + 1;
    }

    await qrCode.save();

    logger.info(`QR code scanned: ${code}`);

    return qrCode.toObject();
  }

  /**
   * Reset daily scan count (run at midnight)
   */
  static async resetDailyScanCount(): Promise<any> {
    const result = await QRCodeModel.updateMany({}, { scansToday: 0 });

    logger.info(`Daily scan count reset for ${result.modifiedCount} QR codes`);

    return result;
  }

  /**
   * Regenerate QR code
   */
  static async regenerateQRCode(
    restaurantId: string,
    ownerId: string,
    appUrl?: string,
  ): Promise<any> {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== ownerId) {
      throw new AppError(403, "You do not have permission");
    }

    const qrCode = await QRCodeModel.findOne({ restaurantId });
    if (!qrCode) {
      throw new AppError(404, "QR code not found");
    }

    const code = generateShortCode();
    // Use resolvePublicBaseUrl() which respects PUBLIC_API_URL env var
    const baseUrl = resolvePublicBaseUrl();
    const fullPublicUrl = `${baseUrl}/menu/${qrCode.publicUrl}?v=${code}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(fullPublicUrl, {
        type: "image/png",
        width: 300,
        margin: 2,
      });

      qrCode.code = code;
      qrCode.qrDataUrl = qrDataUrl;
      await qrCode.save();

      logger.info(`QR code regenerated for restaurant: ${restaurantId}`);

      return qrCode.toObject();
    } catch (error) {
      logger.error(`Failed to regenerate QR code: ${error}`);
      throw new AppError(500, "Failed to regenerate QR code");
    }
  }

  /**
   * Get restaurant by public URL (for public menu display)
   */
  static async getRestaurantByPublicUrl(publicUrl: string): Promise<any> {
    const qrCode = await QRCodeModel.findOne({ publicUrl });

    if (!qrCode) {
      throw new AppError(404, `Menu with URL "${publicUrl}" not found`);
    }

    logger.info(`Retrieved restaurant for public URL: ${publicUrl}`);

    return qrCode.toObject();
  }
}
