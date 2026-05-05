import mongoose from "mongoose";
import logger from "../utils/logger";

const connectDB = async (): Promise<typeof mongoose | null> => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.DATABASE_NAME || "ar-menu";

    if (!mongoUri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    logger.info("Attempting to connect to MongoDB...");

    const conn = await mongoose.connect(mongoUri, {
      dbName: dbName,
      maxPoolSize: 10,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`✓ MongoDB connected successfully`);
    logger.info(`✓ Host: ${conn.connection.host}`);
    logger.info(`✓ Database: ${conn.connection.db?.databaseName}`);
    logger.info(`✓ Connection state: ${conn.connection.readyState}`);

    return conn;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`✗ MongoDB connection failed: ${errorMessage}`);

    // Retry connection after 5 seconds
    logger.info("Retrying MongoDB connection in 5 seconds...");
    return new Promise(resolve => {
      setTimeout(() => {
        connectDB()
          .then(resolve)
          .catch(retryError => {
            logger.error(`✗ MongoDB retry failed: ${retryError}`);
            process.exit(1);
          });
      }, 5000);
    });
  }
};

export default connectDB;
