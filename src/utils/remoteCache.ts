import axios from "axios";

interface RemoteCacheEntry {
  data: Buffer;
  contentType: string;
  timestamp: number;
  hits: number;
  size: number;
}

interface RemoteCacheResult {
  entry: RemoteCacheEntry | null;
  cacheHit: boolean;
}

class RemoteCache {
  private cache = new Map<string, RemoteCacheEntry>();
  private currentSize = 0;
  private readonly maxSize =
    Number(process.env.REMOTE_CACHE_MAX_MB || "1024") * 1024 * 1024; // MB -> bytes
  private readonly ttl = Number(
    process.env.REMOTE_CACHE_TTL_MS || String(24 * 60 * 60 * 1000),
  ); // default 24h

  public async get(url: string): Promise<RemoteCacheResult> {
    const cached = this.cache.get(url);
    if (cached) {
      // Validate TTL
      if (Date.now() - cached.timestamp < this.ttl) {
        cached.hits++;
        return { entry: cached, cacheHit: true };
      }
      // expired
      this.currentSize -= cached.size;
      this.cache.delete(url);
    }

    // Fetch remote
    try {
      const resp = await axios.get(url, { responseType: "arraybuffer" });
      const buf = Buffer.from(resp.data);
      const contentType =
        resp.headers["content-type"] || "application/octet-stream";

      // Evict if needed
      if (buf.length + this.currentSize > this.maxSize) {
        this.evict(buf.length);
      }

      const entry: RemoteCacheEntry = {
        data: buf,
        contentType,
        timestamp: Date.now(),
        hits: 1,
        size: buf.length,
      };

      this.cache.set(url, entry);
      this.currentSize += buf.length;
      return { entry, cacheHit: false };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[RemoteCache] Failed to fetch ${url}:`, errorMessage);
      return { entry: null, cacheHit: false };
    }
  }

  public invalidate(url: string) {
    const e = this.cache.get(url);
    if (e) {
      this.currentSize -= e.size;
      this.cache.delete(url);
    }
  }

  public stats() {
    let totalHits = 0;
    let totalSize = 0;
    this.cache.forEach(e => {
      totalHits += e.hits;
      totalSize += e.size;
    });
    return {
      entries: this.cache.size,
      totalSize,
      totalHits,
      maxSize: this.maxSize,
    };
  }

  private evict(spaceNeeded: number) {
    const entries = Array.from(this.cache.entries()).map(([k, v]) => ({
      k,
      v,
    }));
    // sort by hits asc then oldest
    entries.sort(
      (a, b) => a.v.hits - b.v.hits || a.v.timestamp - b.v.timestamp,
    );
    let freed = 0;
    for (const entry of entries) {
      if (freed >= spaceNeeded) break;
      this.cache.delete(entry.k);
      freed += entry.v.size;
      this.currentSize -= entry.v.size;
    }
  }
}

export const remoteCache = new RemoteCache();
