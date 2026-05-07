import fs from "fs";
import path from "path";

/**
 * File Cache Service
 * Caches frequently accessed files (like 3D models) in server memory
 * to reduce disk I/O and improve response times for multiple users
 */

interface CacheEntry {
  data: Buffer;
  timestamp: number;
  hits: number;
  fileSize: number;
  mtime: number; // modification time for invalidation
}

class FileCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 500 * 1024 * 1024; // 500MB max cache
  private currentCacheSize = 0;
  private readonly ttl = 1 * 60 * 60 * 1000; // 1 hour default TTL

  /**
   * Get a file from cache or disk
   * @param filePath - Full path to the file
   * @returns Buffer with file content, or null if error
   */
  public getFile(filePath: string): Buffer | null {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.cache.delete(filePath);
        return null;
      }

      // Get current file modification time
      const stats = fs.statSync(filePath);
      const currentMtime = stats.mtimeMs;

      // Check cache and validate
      const cached = this.cache.get(filePath);
      if (cached) {
        // Invalidate if file was modified since caching
        if (cached.mtime !== currentMtime) {
          this.cache.delete(filePath);
          this.currentCacheSize -= cached.fileSize;
        } else if (Date.now() - cached.timestamp < this.ttl) {
          // Cache hit and still valid
          cached.hits++;
          return cached.data;
        } else {
          // Cache expired
          this.cache.delete(filePath);
          this.currentCacheSize -= cached.fileSize;
        }
      }

      // Cache miss - read from disk
      const data = fs.readFileSync(filePath);

      // Only cache files we have room for
      if (data.length + this.currentCacheSize > this.maxCacheSize) {
        // Evict least used entries until we have space
        this.evictLRU(data.length);
      }

      // Store in cache
      this.cache.set(filePath, {
        data,
        timestamp: Date.now(),
        hits: 1,
        fileSize: data.length,
        mtime: currentMtime,
      });

      this.currentCacheSize += data.length;

      return data;
    } catch (error) {
      console.error(`[FileCache] Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Manually invalidate a cached file
   */
  public invalidate(filePath: string): void {
    const cached = this.cache.get(filePath);
    if (cached) {
      this.currentCacheSize -= cached.fileSize;
      this.cache.delete(filePath);
    }
  }

  /**
   * Clear entire cache
   */
  public clear(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    let totalHits = 0;
    let totalSize = 0;

    this.cache.forEach(entry => {
      totalHits += entry.hits;
      totalSize += entry.fileSize;
    });

    return {
      cachedFiles: this.cache.size,
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxCacheSize / 1024 / 1024).toFixed(0),
      totalHits,
      hitRate:
        this.cache.size > 0 ? (totalHits / this.cache.size).toFixed(2) : "0",
    };
  }

  /**
   * Evict least recently used entries to make space
   */
  private evictLRU(spaceNeeded: number): void {
    const entries = Array.from(this.cache.entries())
      .map(([path, entry]) => ({
        path,
        ...entry,
      }))
      .sort((a, b) => a.hits - b.hits || a.timestamp - b.timestamp);

    let freedSpace = 0;
    for (const entry of entries) {
      if (freedSpace >= spaceNeeded) break;

      this.cache.delete(entry.path);
      freedSpace += entry.fileSize;
      this.currentCacheSize -= entry.fileSize;

      console.log(
        `[FileCache] Evicted ${path.basename(entry.path)} to make space`,
      );
    }
  }
}

// Export singleton instance
export const fileCache = new FileCache();
