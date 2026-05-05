/**
 * Generate a unique public URL from restaurant name
 * Converts "The Best Pizza Place" -> "the-best-pizza-place"
 */
export function generatePublicUrl(restaurantName: string): string {
  return restaurantName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Remove duplicate hyphens
    .slice(0, 100); // Limit to 100 characters
}

/**
 * Add a numeric suffix to make URL unique
 */
export function addSuffixToUrl(baseUrl: string, suffix: number): string {
  return `${baseUrl}-${suffix}`;
}

/**
 * Generate a short code for QR code (6 characters)
 */
export function generateShortCode(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
