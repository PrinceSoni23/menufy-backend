import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler";

/**
 * Validates if a string is a valid MongoDB ObjectID
 * @param id - The ID to validate
 * @throws AppError with 400 status if invalid
 * @returns true if valid
 */
export function validateObjectId(id: string | undefined): boolean {
  if (!id) {
    throw new AppError(400, "ID is required");
  }

  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(400, `Invalid ID format: ${id}`);
  }

  return true;
}

/**
 * Validates multiple IDs at once
 * @param ids - Object with id properties
 * @throws AppError with 400 status if any invalid
 */
export function validateObjectIds(ids: { [key: string]: string }): boolean {
  for (const [key, id] of Object.entries(ids)) {
    if (!id) {
      throw new AppError(400, `${key} is required`);
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(400, `Invalid ${key} format: ${id}`);
    }
  }

  return true;
}

/**
 * Input normalization utility - prevents search/cache abuse
 * @param input - Raw user input
 * @returns Normalized string
 */
export function normalizeInput(input: string): string {
  // Trim whitespace
  let normalized = input.trim();

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ");

  // Lowercase
  normalized = normalized.toLowerCase();

  // Remove special characters and HTML entities
  normalized = normalized.replace(/&[a-z]+;/gi, "");

  // Remove zero-width characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Max length enforcement (200 chars)
  normalized = normalized.substring(0, 200);

  return normalized;
}
