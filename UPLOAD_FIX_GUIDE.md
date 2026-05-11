# Upload Files - Absolute URL & Multi-Device Fix

## Problem Solved

Images and 3D models disappeared when accessing the app from a different device or browser because:

- Files were stored at relative paths like `/uploads/images/file.jpg`
- Different devices/hosts couldn't resolve that relative path
- Solution: **Store absolute public URLs** in the database (e.g., `https://yourdomain.com/uploads/images/file.jpg`)

---

## Changes Made

### 1. ✅ Upload Handler Patched

**File:** `backend/src/controllers/upload.controller.ts`

**What changed:**

- Both 2D image and 3D model uploads now save **absolute public URLs** to the database
- Instead of: `imageUrl2D: "/uploads/images/abc123.jpg"`
- Now saves: `imageUrl2D: "https://yourdomain.com/uploads/images/abc123.jpg"`

**Impact:** Any new uploads will automatically work across all devices/browsers

---

## Quick Start

### Option 1: Local Filesystem (Single Server)

Best for: Development, single VM, or small deployments

**Setup:**

1. Uploads stay in `backend/uploads/` directory (already configured)
2. Backend serves files via `GET /uploads/...*` route (already configured)
3. Run migration to update existing DB entries:

```bash
cd backend
MONGODB_URI="your-connection-string" API_URL="https://yourdomain.com" node scripts/migrate-urls.js
```

**Persist uploads:**

- If using Docker/K8s, mount a volume at `backend/uploads/`
- If using a single VM, uploads persist automatically

**Verify DB entries:**

```bash
MONGODB_URI="your-connection-string" node scripts/verify-db-urls.js
```

---

### Option 2: Rsync Between Multiple Hosts

Best for: Multiple servers that need to share uploads

**Setup:**

1. Configure SSH key-based auth between servers
2. Run sync script (cron job):

```bash
# Edit script with your server details
nano backend/scripts/sync-uploads.sh

# Make executable
chmod +x backend/scripts/sync-uploads.sh

# Run manually
./sync-uploads.sh prod.example.com backup.example.com deploy

# Or add to crontab (sync every hour)
0 * * * * cd /path/to/backend && ./sync-uploads.sh prod.example.com backup.example.com deploy
```

---

### Option 3: MinIO (Self-Hosted Object Storage)

Best for: Production, high traffic, or multi-instance deployments

MinIO is:

- **S3-compatible** (works like AWS S3)
- **Self-hosted** (no cloud provider needed)
- **Scalable** (handles large files efficiently)
- **Docker-friendly** (one-line setup)

**Quick Start:**

```bash
# Setup MinIO with Docker
chmod +x backend/scripts/setup-minio.sh
./setup-minio.sh

# Access at: http://localhost:9001
# Login: minioadmin / minioadmin
```

**Backend Integration:**

```bash
cd backend
npm install aws-sdk

# Set environment variables (.env)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=uploads
API_URL=http://localhost:5000

# Test integration
node scripts/minio-integration.js
```

**Code integration example:**

```typescript
import { uploadToMinIO } from "./scripts/minio-integration";

// In your upload controller
const { url } = await uploadToMinIO(
  req.file.buffer,
  req.file.originalname,
  "images",
);

await MenuItem.findByIdAndUpdate(menuItemId, {
  imageUrl2D: url, // Absolute URL saved to DB
});
```

---

## Migration Guide

### Update Existing DB Entries

If you have old uploads with relative paths, run the migration:

```bash
cd backend

# Method 1: Using .env file
# Add MONGODB_URI and API_URL to .env, then:
npm run migrate-urls

# Method 2: Direct command
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/db" \
API_URL="https://yourdomain.com" \
node scripts/migrate-urls.js
```

**What it does:**

- Finds all items with relative URLs (e.g., `/uploads/images/abc.jpg`)
- Converts them to absolute URLs (e.g., `https://yourdomain.com/uploads/images/abc.jpg`)
- Logs each update
- Verifies all changes succeeded

**Example output:**

```
📊 Found:
   - 15 items with relative imageUrl2D
   - 8 items with relative model3DUrl

🔄 Updating imageUrl2D paths...
   ✓ Pizza Margherita: /uploads/images/abc123.jpg → https://api.menuar.com/uploads/images/abc123.jpg
   ✓ Pasta Carbonara: /uploads/images/def456.jpg → https://api.menuar.com/uploads/images/def456.jpg
   ...

✅ Successfully updated 23 entries
```

---

## Verification

### Check DB Format

```bash
node scripts/verify-db-urls.js
```

Expected output:

```
✅ Found 5 sample menu items:

[1] Pizza Margherita
    ID: 507f1f77bcf86cd799439011
    imageUrl2D: https://yourdomain.com/uploads/images/abc123.jpg
    model3DUrl: https://yourdomain.com/uploads/3d-models/model.glb
    Format: imageUrl2D is ✓ ABSOLUTE, model3DUrl is ✓ ABSOLUTE

✅ All imageUrl2D entries are now using absolute public URLs!
```

### Test Across Devices

1. Upload image/model on Device A
2. Go to same menu on Device B
3. Images should load ✅

---

## Architecture Comparison

| Aspect        | Filesystem  | Rsync            | MinIO              |
| ------------- | ----------- | ---------------- | ------------------ |
| Setup         | Easy        | Medium           | Easy (Docker)      |
| Scalability   | 1 server    | Multiple servers | Highly scalable    |
| Performance   | Fast        | Decent           | Excellent          |
| Cost          | Free        | Free             | Free (self-hosted) |
| Backups       | Manual      | Scripted         | Built-in           |
| Multi-region  | ❌          | ✅               | ✅                 |
| Direct CDN    | ❌          | ⚠️ Complex       | ✅                 |
| Storage limit | Server disk | Server disk      | Configurable       |

---

## Environment Variables (.env)

### For Filesystem

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
API_URL=https://yourdomain.com
# or for local dev:
API_URL=http://localhost:5000
```

### For MinIO

```env
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=uploads
API_URL=http://localhost:5000
```

---

## Troubleshooting

### Images still missing after migration?

```bash
# 1. Check if uploads directory exists and has files
ls -la backend/uploads/images/

# 2. Verify backend is serving the /uploads route
curl http://localhost:5000/uploads/images/test.jpg

# 3. Check DB entry format
node scripts/verify-db-urls.js

# 4. Re-run migration
MONGODB_URI="..." API_URL="..." node scripts/migrate-urls.js
```

### MinIO not starting?

```bash
# Check if Docker is running
docker ps | grep minio

# View logs
docker logs minio-ar-menu

# Restart
docker restart minio-ar-menu
```

### Images work on one device but not another?

- Ensure API_URL environment variable matches your actual domain
- Check browser console for 404 errors (shows actual URL being requested)
- Verify `resolvePublicBaseUrl()` is returning correct base URL

---

## Files Added/Modified

### Created (New Scripts)

- ✅ `backend/scripts/verify-db-urls.js` - Check DB URL format
- ✅ `backend/scripts/migrate-urls.js` - Update old URLs to absolute
- ✅ `backend/scripts/sync-uploads.sh` - Rsync between servers
- ✅ `backend/scripts/setup-minio.sh` - Setup MinIO with Docker
- ✅ `backend/scripts/minio-integration.js` - MinIO code examples

### Modified

- ✅ `backend/src/controllers/upload.controller.ts` - Save absolute URLs in DB

---

## Next Steps

1. **Immediate**: Run migration to update existing DB entries

   ```bash
   MONGODB_URI="..." API_URL="..." node scripts/migrate-urls.js
   ```

2. **Verify**: Check DB entries are updated

   ```bash
   node scripts/verify-db-urls.js
   ```

3. **Test**: Upload a new image/model and verify it loads on another device

4. **For Production**:
   - If single server: ensure uploads volume persists (Docker mount or VM disk)
   - If multiple servers: setup MinIO or rsync sync
   - Set correct API_URL environment variable for your domain

---

## Support

If images/models still don't appear:

1. Check browser DevTools → Network tab for actual URL being requested
2. Test URL directly in browser (should return 200 + image)
3. Run `verify-db-urls.js` to confirm DB has absolute URLs
4. Check backend logs for any /uploads route errors
