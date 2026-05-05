import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models";
import { AppError } from "../middleware/errorHandler";
import logger from "../utils/logger";
import { IUser } from "../types";

interface IAuthPayload {
  userId: string;
  email: string;
  role: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcryptjs.genSalt(10);
    return await bcryptjs.hash(password, salt);
  }

  static async comparePassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return await bcryptjs.compare(password, hash);
  }

  // CRITICAL FIX: Require environment variables instead of hardcoded fallbacks
  static getJWTSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error("JWT_SECRET environment variable is not set");
      throw new AppError(500, "JWT configuration error - server misconfigured");
    }
    return secret;
  }

  static getJWTRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      logger.error("JWT_REFRESH_SECRET environment variable is not set");
      throw new AppError(500, "JWT configuration error - server misconfigured");
    }
    return secret;
  }

  static generateAccessToken(payload: IAuthPayload): string {
    const secret = this.getJWTSecret();
    const expiry = process.env.JWT_EXPIRY || "15m";
    return jwt.sign(payload, secret, { expiresIn: expiry } as any);
  }

  static generateRefreshToken(payload: IAuthPayload): string {
    const secret = this.getJWTRefreshSecret();
    const expiry = process.env.JWT_REFRESH_EXPIRY || "7d";
    return jwt.sign(payload, secret, { expiresIn: expiry } as any);
  }

  static verifyAccessToken(token: string): IAuthPayload {
    try {
      const secret = this.getJWTSecret();
      const decoded = jwt.verify(token, secret);
      return decoded as IAuthPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "Token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, "Invalid token");
      }
      throw error;
    }
  }

  static verifyRefreshToken(token: string): IAuthPayload {
    try {
      const secret = this.getJWTRefreshSecret();
      const decoded = jwt.verify(token, secret);
      return decoded as IAuthPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "Refresh token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, "Invalid refresh token");
      }
      throw error;
    }
  }

  static async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName: string;
  }) {
    const email = data.email.toLowerCase().trim();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError(409, "Email already registered");
    }

    const passwordHash = await this.hashPassword(data.password);

    const user = new User({
      email,
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      businessName: data.businessName.trim(),
      role: "owner",
      plan: "free",
      subscriptionStatus: "active",
      emailVerified: false,
      lastLogin: new Date(),
      notifications: { email: true, push: true, analytics: true },
    });

    await user.save();

    const payload: IAuthPayload = {
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    logger.info(`New user registered: ${email}`);

    return {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        role: user.role,
        plan: user.plan,
      },
      accessToken,
      refreshToken,
    };
  }

  static async login(data: { email: string; password: string }) {
    const email = data.email.toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    const isPasswordValid = await this.comparePassword(
      data.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new AppError(401, "Invalid email or password");
    }

    user.lastLogin = new Date();
    await user.save();

    const payload: IAuthPayload = {
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    logger.info(`User logged in: ${email}`);

    return {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        role: user.role,
        plan: user.plan,
      },
      accessToken,
      refreshToken,
    };
  }

  static async refreshAccessToken(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);

    const user = await User.findById(payload.userId);
    if (!user) {
      throw new AppError(401, "User not found");
    }

    const newPayload: IAuthPayload = {
      userId: user._id!.toString(),
      email: user.email,
      role: user.role,
    };

    const newAccessToken = this.generateAccessToken(newPayload);

    return {
      accessToken: newAccessToken,
      refreshToken,
    };
  }

  static async getUserProfile(
    userId: string,
  ): Promise<Partial<IUser> & { _id?: string }> {
    const user = await User.findById(userId).select(
      "email firstName lastName businessName role plan subscriptionStatus -passwordHash",
    );

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return {
      _id: user._id?.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      businessName: user.businessName,
      role: user.role,
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
    };
  }
}
