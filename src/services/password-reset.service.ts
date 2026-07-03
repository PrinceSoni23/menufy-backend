import crypto from "crypto";
import bcryptjs from "bcryptjs";
import User from "../models/User";
import PasswordReset from "../models/PasswordReset";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import mailService from "./mail.service";

export class PasswordResetService {
  /**
   * Generate a 6-digit OTP
   */
  static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate a random reset token (for link-based reset, optional)
   */
  static generateResetToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Hash OTP for storage
   */
  static async hashOTP(otp: string): Promise<string> {
    const salt = await bcryptjs.genSalt(10);
    return await bcryptjs.hash(otp, salt);
  }

  /**
   * Compare OTP with hash
   */
  static async compareOTP(otp: string, hash: string): Promise<boolean> {
    return await bcryptjs.compare(otp, hash);
  }

  /**
   * Request password reset - generates OTP and sends email
   */
  static async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Find user by email
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        // Don't reveal if email exists for security
        return {
          success: true,
          message:
            "If an account exists with this email, a password reset OTP will be sent shortly.",
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      const hashedOTP = await this.hashOTP(otp);
      const resetToken = this.generateResetToken();

      // Create OTP record (replace any existing one)
      await PasswordReset.updateOne(
        { email: normalizedEmail, isUsed: false },
        {
          $set: {
            userId: user._id,
            email: normalizedEmail,
            otp: hashedOTP,
            otpExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            resetToken,
            resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            isUsed: false,
          },
        },
        { upsert: true },
      );

      // Send OTP via email
      const emailSent = await mailService.sendPasswordResetEmail(
        normalizedEmail,
        otp,
        user.firstName,
      );

      if (!emailSent) {
        logger.warn(`Failed to send password reset OTP to ${normalizedEmail}`);
        // Still return success to avoid email enumeration
      }

      logger.info(
        `Password reset requested for user: ${normalizedEmail}, OTP: ${otp}`,
      );

      return {
        success: true,
        message:
          "If an account exists with this email, a password reset OTP will be sent shortly.",
      };
    } catch (error) {
      logger.error("Error in requestPasswordReset:", error);
      throw new AppError(500, "Failed to process password reset request");
    }
  }

  /**
   * Verify OTP and return reset token
   */
  static async verifyOTP(
    email: string,
    otp: string,
  ): Promise<{
    success: boolean;
    resetToken: string;
    message: string;
  }> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Find the most recent unused OTP record
      const resetRecord = await PasswordReset.findOne({
        email: normalizedEmail,
        isUsed: false,
      }).sort({ createdAt: -1 });

      if (!resetRecord) {
        throw new AppError(
          400,
          "No password reset request found for this email",
        );
      }

      // Check if OTP has expired
      if (new Date() > resetRecord.otpExpiry) {
        // Mark as used so it can't be reused
        resetRecord.isUsed = true;
        await resetRecord.save();
        throw new AppError(400, "OTP has expired. Please request a new one.");
      }

      // Verify OTP
      const isValid = await this.compareOTP(otp, resetRecord.otp);
      if (!isValid) {
        logger.warn(`Invalid OTP attempt for: ${normalizedEmail}`);
        throw new AppError(400, "Invalid OTP. Please try again.");
      }

      logger.info(`OTP verified for: ${normalizedEmail}`);

      return {
        success: true,
        resetToken: resetRecord.resetToken,
        message: "OTP verified successfully. You can now reset your password.",
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error("Error in verifyOTP:", error);
      throw new AppError(500, "Failed to verify OTP");
    }
  }

  /**
   * Reset password with valid reset token
   */
  static async resetPassword(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Validate password strength
      if (newPassword.length < 8) {
        throw new AppError(400, "Password must be at least 8 characters long");
      }

      // Find and verify reset token
      const resetRecord = await PasswordReset.findOne({
        email: normalizedEmail,
        resetToken,
        isUsed: false,
      });

      if (!resetRecord) {
        throw new AppError(
          400,
          "Invalid reset token. Please request a new password reset.",
        );
      }

      // Check if reset token has expired
      if (new Date() > resetRecord.resetTokenExpiry) {
        // Mark as used so it can't be reused
        resetRecord.isUsed = true;
        await resetRecord.save();
        throw new AppError(
          400,
          "Reset token has expired. Please request a new password reset.",
        );
      }

      // Find user and update password
      const user = await User.findById(resetRecord.userId);
      if (!user) {
        throw new AppError(404, "User not found");
      }

      // Hash new password
      const passwordHash = await bcryptjs.hash(newPassword, 10);

      // Update user password
      user.passwordHash = passwordHash;
      await user.save();

      // Mark reset token as used
      resetRecord.isUsed = true;
      await resetRecord.save();

      logger.info(`Password reset successful for: ${normalizedEmail}`);

      return {
        success: true,
        message:
          "Password reset successfully. You can now log in with your new password.",
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error("Error in resetPassword:", error);
      throw new AppError(500, "Failed to reset password");
    }
  }

  /**
   * Clean up expired password reset records (can be run as a scheduled job)
   */
  static async cleanupExpiredRecords(): Promise<number> {
    try {
      const result = await PasswordReset.deleteMany({
        otpExpiry: { $lt: new Date() },
      });

      logger.info(
        `Cleaned up ${result.deletedCount} expired password reset records`,
      );
      return result.deletedCount;
    } catch (error) {
      logger.error("Error cleaning up expired records:", error);
      return 0;
    }
  }
}
