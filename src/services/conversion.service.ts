import axios from "axios";
import { ConversionJob, MenuItem } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { TRIPO_CONFIG } from "../config/constants";

const TRIPO_CLIENT_ID = process.env.TRIPO_CLIENT_ID;
const TRIPO_CLIENT_SECRET = process.env.TRIPO_CLIENT_SECRET;
const TRIPO_API_BASE = TRIPO_CONFIG.API_BASE;

let accessToken: string | null = null;
let tokenExpiration: number = 0;

if (!TRIPO_CLIENT_ID || !TRIPO_CLIENT_SECRET) {
  logger.warn(
    "TRIPO_CLIENT_ID or TRIPO_CLIENT_SECRET not set. 3D conversion will be skipped.",
  );
} else {
  logger.info(
    `[ConversionService Init] Loaded Tripo credentials - ID starts with: ${TRIPO_CLIENT_ID?.substring(0, 10)}... | Secret starts with: ${TRIPO_CLIENT_SECRET?.substring(0, 10)}...`,
  );
}

export class ConversionService {
  /**
   * Get Bearer token from Tripo AI
   * The TRIPO_CLIENT_SECRET IS the Bearer token, no separate auth needed!
   */
  static getAccessToken(): string {
    if (!TRIPO_CLIENT_SECRET) {
      throw new AppError(500, "Tripo AI credentials not configured");
    }
    return TRIPO_CLIENT_SECRET;
  }

  private static getLocalImagePath(imagePath: string): string {
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      const apiUrl = (process.env.API_URL || "http://localhost:5000").replace(
        /\/$/,
        "",
      );
      const uploadsPrefix = `${apiUrl}/uploads/images/`;

      if (!imagePath.startsWith(uploadsPrefix)) {
        throw new AppError(
          400,
          "Conversion requires a locally uploaded image. Please re-upload the file from your dashboard.",
        );
      }

      const filename = imagePath.substring(uploadsPrefix.length);
      return path.resolve(__dirname, "../../uploads/images", filename);
    }

    return path.resolve(imagePath);
  }

  /**
   * Upload image to Tripo's upload endpoint to get an image_token
   */
  static async uploadImageToTripo(imagePath: string): Promise<string> {
    const token = this.getAccessToken();
    const localImagePath = this.getLocalImagePath(imagePath);

    if (!fs.existsSync(localImagePath)) {
      throw new AppError(
        500,
        `Image file not found on disk for conversion: ${localImagePath}`,
      );
    }

    const ext =
      path.extname(localImagePath).substring(1).toLowerCase() || "jpg";
    const form = new FormData();
    form.append("file", fs.createReadStream(localImagePath), {
      filename: path.basename(localImagePath),
      contentType: this.getMimeType(ext),
    });

    try {
      logger.info(
        `[Tripo API] Uploading image to: ${TRIPO_API_BASE}/openapi/upload/sts`,
      );

      const headers: Record<string, string> = {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      };

      if (TRIPO_CLIENT_ID) {
        headers["X-Client-Id"] = TRIPO_CLIENT_ID;
      }

      const response = await axios.post(
        `${TRIPO_API_BASE}/openapi/upload/sts`,
        form,
        {
          headers,
          timeout: TRIPO_CONFIG.TIMEOUT,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      if (
        !response.data ||
        !response.data.data ||
        !response.data.data.image_token
      ) {
        logger.error(
          `[Tripo API] Invalid upload response:`,
          JSON.stringify(response.data),
        );
        throw new AppError(500, "Invalid response from Tripo upload service");
      }

      const imageToken = response.data.data.image_token;
      logger.info(
        `[Tripo API] Image uploaded successfully. Token: ${imageToken}`,
      );
      return imageToken;
    } catch (error: any) {
      logger.error(`[Tripo API] Upload failed: ${error.message}`);
      if (error.response) {
        logger.error(
          `[Tripo API] Upload error response:`,
          JSON.stringify(error.response.data),
        );
      }
      throw error;
    }
  }

  /**
   * Submit image for 3D conversion to Tripo AI
   */
  static async submitForConversion(
    menuItemId: string,
    imagePath: string,
  ): Promise<any> {
    if (!TRIPO_CLIENT_ID || !TRIPO_CLIENT_SECRET) {
      logger.error(
        "Tripo AI credentials are missing or invalid. Cannot start conversion.",
      );
      throw new AppError(500, "Tripo AI credentials are not configured");
    }

    try {
      // Get Bearer token (CLIENT_SECRET is the token)
      const token = this.getAccessToken();

      // Get file extension
      const localImagePath = this.getLocalImagePath(imagePath);
      const ext =
        path.extname(localImagePath).substring(1).toLowerCase() || "jpg";
      const fileType = ext === "jpeg" ? "jpg" : ext; // Normalize jpeg to jpg

      logger.info(`[Tripo API] Converting menu item: ${menuItemId}`);

      // STEP 1: Upload image to Tripo to get image_token
      logger.info(`[Tripo API] Step 1: Uploading image to Tripo...`);
      const imageToken = await this.uploadImageToTripo(localImagePath);
      logger.info(
        `[Tripo API] Step 1 SUCCESS: Got image_token = ${imageToken}`,
      );

      // STEP 2: Submit conversion task with the image_token
      logger.info(`[Tripo API] Step 2: Submitting conversion task...`);
      const requestPayload = {
        type: "image_to_model",
        file: {
          type: fileType,
          file_token: imageToken,
        },
        model_version: "v2.5-20250123",
      };

      const taskHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (TRIPO_CLIENT_ID) {
        taskHeaders["X-Client-Id"] = TRIPO_CLIENT_ID;
      }

      logger.info(
        `[Tripo API] Sending request to: ${TRIPO_API_BASE}/openapi/task`,
      );
      logger.info(
        `[Tripo API] Request payload:`,
        JSON.stringify(requestPayload),
      );

      const response = await axios.post(
        `${TRIPO_API_BASE}/openapi/task`,
        requestPayload,
        {
          headers: taskHeaders,
          timeout: TRIPO_CONFIG.TIMEOUT,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      logger.info(
        `[Tripo API] Step 2 SUCCESS: Response status ${response.status}`,
      );
      logger.info(`[Tripo API] Response data:`, JSON.stringify(response.data));

      if (!response.data || !response.data.data) {
        logger.error(
          `[Tripo API Error] Invalid response structure:`,
          JSON.stringify(response.data),
        );
        throw new AppError(500, "Invalid response from 3D conversion service");
      }

      // Extract task_id from response (not job_id)
      const taskId = response.data.data.task_id;

      if (!taskId) {
        logger.error(
          `[Tripo API Error] No task_id in response:`,
          JSON.stringify(response.data),
        );
        throw new AppError(500, "No task ID returned from conversion service");
      }

      // Save conversion job
      const conversionJob = new ConversionJob({
        menuItemId,
        imageUrl: imagePath,
        tripoJobId: taskId,
        tripoStatus: "pending",
        retries: 0,
        maxRetries: 5,
      });

      await conversionJob.save();

      // Update menu item status
      await MenuItem.findByIdAndUpdate(menuItemId, {
        status: "converting",
        conversionJobId: taskId,
        conversionProgress: 10,
      });

      logger.info(
        `✅ [Tripo API] Conversion submitted: Task ID ${taskId} for menu item ${menuItemId}`,
      );

      return {
        jobId: taskId,
        menuItemId,
        status: "converting",
      };
    } catch (error: any) {
      logger.error(`❌ Failed to submit for conversion: ${error.message}`);

      if (error.response) {
        logger.error(`[Tripo API Error] HTTP Status: ${error.response.status}`);
        logger.error(
          `[Tripo API Error] Status Text: ${error.response.statusText}`,
        );

        // Log all response properties at different levels
        try {
          const responseData = error.response.data;
          logger.error(
            `[Tripo API Error] Response data type: ${typeof responseData}`,
          );
          logger.error(
            `[Tripo API Error] Response data is buffer: ${Buffer.isBuffer(responseData)}`,
          );
          logger.error(
            `[Tripo API Error] Response data is string: ${typeof responseData === "string"}`,
          );

          if (typeof responseData === "string") {
            logger.error(
              `[Tripo API Error] Response text: ${responseData.substring(0, 500)}`,
            );
          } else if (Buffer.isBuffer(responseData)) {
            logger.error(
              `[Tripo API Error] Response buffer: ${responseData.toString("utf8").substring(0, 500)}`,
            );
          } else if (responseData) {
            logger.error(
              `[Tripo API Error] Response JSON: ${JSON.stringify(responseData).substring(0, 500)}`,
            );
          } else {
            logger.error(`[Tripo API Error] Response data is null/undefined`);
          }
        } catch (parseErr) {
          logger.error(
            `[Tripo API Error] Failed to parse response:`,
            parseErr instanceof Error ? parseErr.message : String(parseErr),
          );
        }

        // Log headers
        try {
          if (error.response.headers) {
            logger.error(
              `[Tripo API Error] Response Headers: ${JSON.stringify(error.response.headers).substring(0, 500)}`,
            );
            logger.error(
              `[Tripo API Error] Content-Type: ${error.response.headers["content-type"] || "(not set)"}`,
            );
          }
        } catch (headerErr) {
          logger.error(
            `[Tripo API Error] Failed to log headers:`,
            headerErr instanceof Error ? headerErr.message : String(headerErr),
          );
        }

        // Log request config
        try {
          if (error.config) {
            logger.error(`[Tripo API Error] Request URL: ${error.config.url}`);
            logger.error(
              `[Tripo API Error] Request method: ${error.config.method}`,
            );
            if (error.config.data) {
              const dataStr =
                typeof error.config.data === "string"
                  ? error.config.data
                  : JSON.stringify(error.config.data);
              logger.error(
                `[Tripo API Error] Request data length: ${dataStr.length} chars`,
              );
              logger.error(
                `[Tripo API Error] Request data (first 300 chars): ${dataStr.substring(0, 300)}`,
              );
            }
          }
        } catch (configErr) {
          logger.error(
            `[Tripo API Error] Failed to log config:`,
            configErr instanceof Error ? configErr.message : String(configErr),
          );
        }
      } else if (error.request && !error.response) {
        logger.error(
          `[Tripo API Error] Request made but no response received:`,
          error.message,
        );
      } else {
        logger.error(
          `[Tripo API Error] Error details:`,
          error.stack || error.toString(),
        );
      }

      // Don't set status to failed - leave as pending so user can retry
      // The upload controller will handle the error response

      throw new AppError(500, "Failed to submit image for 3D conversion");
    }
  }

  /**
   * Check conversion status
   */
  static async checkConversionStatus(jobId: string): Promise<any> {
    if (!TRIPO_CLIENT_ID || !TRIPO_CLIENT_SECRET) {
      logger.warn(
        "Skipping status check - Tripo AI credentials not configured",
      );
      return null;
    }

    try {
      // Get Bearer token (CLIENT_SECRET is the token)
      const token = this.getAccessToken();

      logger.info(`[Tripo API] Checking conversion status: ${jobId}`);

      const taskHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (TRIPO_CLIENT_ID) {
        taskHeaders["X-Client-Id"] = TRIPO_CLIENT_ID;
      }

      const response = await axios.get(
        `${TRIPO_API_BASE}/openapi/task/${jobId}`,
        {
          headers: taskHeaders,
          timeout: TRIPO_CONFIG.TIMEOUT,
        },
      );

      logger.info(
        `[Tripo API] Status response:`,
        JSON.stringify(response.data),
      );

      if (!response.data || !response.data.data) {
        throw new AppError(500, "Invalid response from 3D conversion service");
      }

      const taskData = response.data.data;
      const status = taskData.status; // 'waiting', 'processing', 'succeeded', 'failed'

      logger.info(`[Tripo API] Job ${jobId} status: ${status}`);

      // Get conversion job from DB
      const conversionJob = await ConversionJob.findOne({ tripoJobId: jobId });

      if (!conversionJob) {
        throw new AppError(404, "Conversion job not found");
      }

      // Update conversion job
      conversionJob.tripoStatus = status;

      if (status === "succeeded" && taskData.data) {
        const modelUrl = taskData.data.model_url;
        const previewUrl = taskData.data.preview_url;

        conversionJob.modelUrl = modelUrl;
        conversionJob.generatedAt = new Date();

        await conversionJob.save();

        // Update menu item
        await MenuItem.findByIdAndUpdate(conversionJob.menuItemId, {
          status: "ready",
          modelUrl,
          modelPreviewUrl: previewUrl,
          conversionProgress: 100,
        });

        logger.info(`Conversion completed successfully: ${jobId}`);

        return {
          jobId,
          status: "completed",
          modelUrl,
          previewUrl,
        };
      } else if (status === "failed") {
        conversionJob.error = taskData.error || "Unknown error";
        await conversionJob.save();

        // Update menu item
        await MenuItem.findByIdAndUpdate(conversionJob.menuItemId, {
          status: "failed",
          conversionProgress: 0,
        });

        logger.error(`Conversion failed: ${jobId} - ${conversionJob.error}`);

        return {
          jobId,
          status: "failed",
          error: conversionJob.error,
        };
      } else {
        // Still processing
        const progress = status === "processing" ? 50 : 20;
        conversionJob.retries = 0;
        await conversionJob.save();

        await MenuItem.findByIdAndUpdate(conversionJob.menuItemId, {
          conversionProgress: progress,
        });

        return {
          jobId,
          status,
          progress,
        };
      }
    } catch (error) {
      logger.error(`Failed to check conversion status: ${error}`);

      // Increment retry counter
      const conversionJob = await ConversionJob.findOne({ tripoJobId: jobId });
      if (conversionJob) {
        conversionJob.retries += 1;

        if (conversionJob.retries >= conversionJob.maxRetries) {
          conversionJob.tripoStatus = "failed";
          conversionJob.error = `Failed after ${conversionJob.maxRetries} retries`;
          await conversionJob.save();

          await MenuItem.findByIdAndUpdate(conversionJob.menuItemId, {
            status: "failed",
          });

          logger.error(`Max retries exceeded for job ${jobId}`);
        } else {
          await conversionJob.save();
        }
      }

      throw error;
    }
  }

  /**
   * Get MIME type from file extension
   */
  private static getMimeType(ext: string): string {
    const mimeTypes: { [key: string]: string } = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
    };

    return mimeTypes[ext.toLowerCase()] || "image/jpeg";
  }

  /**
   * Process pending conversions (polling job)
   */
  static async processPendingConversions(): Promise<void> {
    try {
      const pendingJobs = await ConversionJob.find({
        tripoStatus: { $in: ["pending", "waiting", "processing"] },
        retries: { $lt: 5 },
      });

      logger.info(`Processing ${pendingJobs.length} pending conversion jobs`);

      for (const job of pendingJobs) {
        try {
          await this.checkConversionStatus(job.tripoJobId);
        } catch (error) {
          logger.error(`Error processing job ${job.tripoJobId}: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to process pending conversions: ${error}`);
    }
  }

  /**
   * Cancel conversion job
   */
  static async cancelConversion(jobId: string): Promise<any> {
    try {
      const conversionJob = await ConversionJob.findOne({ tripoJobId: jobId });

      if (!conversionJob) {
        throw new AppError(404, "Conversion job not found");
      }

      conversionJob.tripoStatus = "failed";
      conversionJob.error = "Cancelled by user";
      await conversionJob.save();

      await MenuItem.findByIdAndUpdate(conversionJob.menuItemId, {
        status: "failed",
        conversionProgress: 0,
      });

      logger.info(`Conversion cancelled: ${jobId}`);

      return { message: "Conversion cancelled" };
    } catch (error) {
      logger.error(`Failed to cancel conversion: ${error}`);
      throw error;
    }
  }
}
