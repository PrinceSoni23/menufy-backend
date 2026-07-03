import nodemailer from "nodemailer";
import logger from "../utils/logger";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class MailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    try {
      // Support multiple email providers
      if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10),
          secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        logger.info("Mail service initialized with SMTP");
      } else if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
        // Gmail configuration
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASSWORD,
          },
        });
        logger.info("Mail service initialized with Gmail");
      } else if (process.env.SENDGRID_API_KEY) {
        // SendGrid configuration
        this.transporter = nodemailer.createTransport({
          host: "smtp.sendgrid.net",
          port: 587,
          auth: {
            user: "apikey",
            pass: process.env.SENDGRID_API_KEY,
          },
        });
        logger.info("Mail service initialized with SendGrid");
      } else {
        logger.warn(
          "Email service not configured. Set SMTP_HOST/SMTP_PORT or GMAIL_USER/GMAIL_PASSWORD or SENDGRID_API_KEY",
        );
      }
    } catch (error) {
      logger.error("Failed to initialize mail service:", error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      logger.warn(
        "Email service not configured. Cannot send email to:",
        options.to,
      );
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from:
          process.env.MAIL_FROM ||
          process.env.GMAIL_USER ||
          "noreply@menufy.com",
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info(`Email sent to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    otp: string,
    userName: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${userName},</p>
        <p>You requested to reset your password. Use the OTP below to proceed:</p>
        
        <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; letter-spacing: 5px; font-size: 32px; margin: 0;">${otp}</h1>
          <p style="color: #666; margin: 10px 0 0 0;">This OTP expires in 15 minutes</p>
        </div>
        
        <p><strong>Security Note:</strong></p>
        <ul>
          <li>Never share this OTP with anyone</li>
          <li>We will never ask for your OTP via phone or email (except this message)</li>
          <li>If you didn't request this, please ignore this email</li>
        </ul>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
          <br/>© 2024 Menufy. All rights reserved.
        </p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: "Password Reset OTP - Menufy",
      html,
      text: `Your password reset OTP is: ${otp}. This expires in 15 minutes.`,
    });
  }

  async sendPasswordResetLinkEmail(
    email: string,
    resetLink: string,
    userName: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${userName},</p>
        <p>You requested to reset your password. Click the link below to proceed:</p>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666;">Or copy this link: <br/><code style="background-color: #f0f0f0; padding: 5px 10px; border-radius: 3px; word-break: break-all;">${resetLink}</code></p>
        
        <p><strong>Security Note:</strong></p>
        <ul>
          <li>This link expires in 1 hour</li>
          <li>Never share this link with anyone</li>
          <li>If you didn't request this, please ignore this email</li>
        </ul>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
          <br/>© 2024 Menufy. All rights reserved.
        </p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: "Password Reset Link - Menufy",
      html,
      text: `Click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
    });
  }
}

export default new MailService();
