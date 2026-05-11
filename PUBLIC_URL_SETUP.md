# Public Uploads - Multi-Device & Multi-Environment Setup Guide

## Problem Solved ✅

**Issue:** Images and 3D models disappear when accessing the menu from:

- A different device on the network
- A different browser (Chrome vs Firefox, mobile vs desktop)
- Production environment after uploading on localhost
- Different network connections

**Root Cause:** Uploads were saved with relative/local paths like `/uploads/images/file.jpg` instead of absolute public URLs that work from anywhere.

**Solution:** Use `PUBLIC_API_URL` environment variable to explicitly set the public domain/IP where uploads should be accessible from.

---

## Quick Setup

### 1️⃣ Localhost (Single Machine)

**You want uploads to work:** from the same device + other devices on your WiFi

```bash
# In backend/.env
PUBLIC_API_URL=http://192.168.1.100:5000
```

Replace `192.168.1.100` with your machine's local IP:

```bash
# Find your local IP
# Windows:
ipconfig | findstr "IPv4"

# Mac/Linux:
ifconfig | grep "inet "
```

### 2️⃣ Localhost (Local Testing Only)

**You want uploads to work:** only from `localhost:3000` / `localhost:5000`

```bash
# In backend/.env
PUBLIC_API_URL=http://localhost:5000
```

⚠️ **Note:** Other devices/networks won't see the images with this setting.

### 3️⃣ Production (Domain/URL)

**You want uploads to work:** from your domain name anywhere

```bash
# In backend/.env
PUBLIC_API_URL=https://yourdomain.com
# OR for subdomain:
PUBLIC_API_URL=https://api.yourdomain.com
```

### 4️⃣ Production (IP Address)

**You want uploads to work:** from server IP address

```bash
# In backend/.env
PUBLIC_API_URL=https://192.168.0.50:5000
# OR with domain:
PUBLIC_API_URL=https://api.yourdomain.com
```

---

## Environment Variables Priority

When saving an upload, the system checks variables in this order:

1. **`PUBLIC_API_URL`** ← **USE THIS TO FIX MOST ISSUES** ✅
   - Explicit override, highest priority
   - Set this in .env and all uploads will use it

2. `API_URL` (if not localhost)
   - Fallback if PUBLIC_API_URL not set
   - For production, set both to be safe

3. `RENDER_EXTERNAL_URL`
   - Auto-detected on Render.com

4. Request headers (X-Forwarded-\*)
   - For proxies/load balancers

5. Request origin
   - Falls back to actual request hostname

6. `http://localhost:5000`
   - Final fallback

---

## Testing Your Setup

### Test 1: Check API Configuration

```bash
# Frontend browser - open and check the output
http://localhost:5000/api/upload/verify
```

You'll see:

- Current `PUBLIC_API_URL` being used
- Environment variables
- Example URLs
- CORS configuration

### Test 2: Upload & Verify

1. Upload an image via the dashboard
2. Check the response - note the `imageUrl` returned
3. Open that URL in browser from different device/network
4. Should load the image ✅

### Test 3: Run Test Script

```bash
cd backend

# Test basic connectivity
node scripts/test-public-urls.js

# Test with specific URL
API_URL=http://localhost:5000 node scripts/test-public-urls.js

# Check if specific file is accessible
node scripts/test-public-urls.js --check http://192.168.1.100:5000/uploads/images/abc123.jpg
```

---

## Common Scenarios

### Scenario A: Uploading on Localhost, Access from Mobile

**Setup:**

```
backend/.env:
PUBLIC_API_URL=http://192.168.1.100:5000

frontend/.env:
NEXT_PUBLIC_API_URL=http://192.168.1.100:5000
```

**Test:**

1. Frontend at `http://192.168.1.100:3000`
2. Upload image
3. Image saved with URL: `http://192.168.1.100:5000/uploads/images/abc123.jpg`
4. Mobile accesses `http://192.168.1.100:3000` → image loads ✅

### Scenario B: Production (Domain)

**Setup:**

```
backend/.env:
PUBLIC_API_URL=https://api.yourdomain.com

frontend/.env:
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

**Test:**

1. Upload from `https://yourdomain.com`
2. Image saved with: `https://api.yourdomain.com/uploads/images/abc123.jpg`
3. Access from anywhere on internet → image loads ✅

### Scenario C: Production (Docker/K8s)

**Setup:**

```
backend/.env:
PUBLIC_API_URL=https://api.yourdomain.com

docker-compose.yml:
environment:
  PUBLIC_API_URL: https://api.yourdomain.com
  MONGODB_URI: mongodb+srv://...
```

**Ensure:**

- Uploads volume is mounted: `-v /path/uploads:/app/uploads`
- Nginx/load balancer sets X-Forwarded-\* headers
- HTTPS certificate configured

### Scenario D: Multiple Environments (Dev/Staging/Prod)

**Use environment-specific .env files:**

```bash
# .env.development
PUBLIC_API_URL=http://localhost:5000

# .env.staging
PUBLIC_API_URL=https://staging-api.yourdomain.com

# .env.production
PUBLIC_API_URL=https://api.yourdomain.com
```

**Load correct env:**

```bash
NODE_ENV=production node src/server.ts
```

---

## Troubleshooting

### Images Show on One Device But Not Another

**Solution:**

```bash
# Check what URL is being used
curl http://localhost:5000/api/upload/verify

# Set PUBLIC_API_URL to accessible network IP
PUBLIC_API_URL=http://192.168.1.100:5000
```

### Images Work on Localhost But Not From Mobile

**Root Cause:** Mobile can't reach `localhost:5000`

**Solution:**

```bash
# In backend/.env
PUBLIC_API_URL=http://192.168.1.100:5000  # Use machine's local IP

# In frontend/.env.local
NEXT_PUBLIC_API_URL=http://192.168.1.100:3000
```

### Production Images Show Broken Links

**Cause:** PUBLIC_API_URL not set or incorrect

**Solution:**

```bash
# SSH into production
# Edit .env to set:
PUBLIC_API_URL=https://yourdomain.com

# Restart backend
pm2 restart backend
# or
docker-compose restart backend
```

### CORS Errors When Loading Images

**Solution:** Already fixed - uploads middleware has CORS headers

Verify with:

```bash
curl -i http://localhost:5000/api/upload/verify
# Should see: Access-Control-Allow-Origin: *
```

### Old Uploads Still Using Relative Paths

**Solution:** Run migration to update DB:

```bash
cd backend
MONGODB_URI="..." API_URL="https://yourdomain.com" node scripts/migrate-urls.js
```

---

## Advanced Configuration

### Custom Upload Base Path

If you need uploads in a different path:

```typescript
// backend/src/utils/uploadHandler.ts
export function resolvePublicBaseUrl(req?: Request): string {
  const publicOverride = process.env.PUBLIC_API_URL;
  if (publicOverride) {
    return publicOverride;
  }
  // ... rest of logic
}
```

### Multi-Region Setup

```bash
# Region 1 (US East)
PUBLIC_API_URL=https://us-api.yourdomain.com

# Region 2 (EU)
PUBLIC_API_URL=https://eu-api.yourdomain.com
```

### CDN Integration

```bash
# Store uploads URL with CDN
PUBLIC_API_URL=https://cdn.yourdomain.com
# OR
PUBLIC_API_URL=https://d1234.cloudfront.net
```

---

## Environment Variables Checklist

### Backend (.env)

- [ ] `MONGODB_URI` - Database connection
- [ ] `PUBLIC_API_URL` - **WHERE UPLOADS ARE ACCESSIBLE** ← Critical!
- [ ] `API_URL` - Fallback (optional if PUBLIC_API_URL set)
- [ ] `NODE_ENV` - development/production
- [ ] `JWT_SECRET` - Auth token secret

### Frontend (.env or .env.local)

- [ ] `NEXT_PUBLIC_API_URL` - Points to backend PUBLIC_API_URL

### Docker (.env or docker-compose.yml)

```yaml
environment:
  PUBLIC_API_URL: https://api.yourdomain.com
  MONGODB_URI: ${MONGODB_URI}
  volumes:
    - ./uploads:/app/uploads # Persist uploads
```

---

## How It Works (Technical Details)

### Upload Flow

```
1. User uploads image
   ↓
2. Backend receives file
   ↓
3. System calls resolvePublicBaseUrl(req)
   - Checks PUBLIC_API_URL env var first ✅
   - Falls back to API_URL, request headers, etc.
   ↓
4. Constructs public URL:
   imageUrl = `${publicBaseUrl}/uploads/images/${filename}`
   ↓
5. Saves to database with ABSOLUTE URL
   → imageUrl2D: "https://api.yourdomain.com/uploads/images/abc123.jpg"
   ↓
6. Any device/browser can access via that absolute URL
```

### Key Files Modified

- ✅ `backend/src/utils/uploadHandler.ts` - URL resolution logic
- ✅ `backend/src/controllers/upload.controller.ts` - Save absolute URLs
- ✅ `backend/src/controllers/upload-verify.controller.ts` - Verification endpoint
- ✅ `backend/src/routes/upload.routes.ts` - Verification routes
- ✅ `backend/src/server.ts` - CORS middleware for `/uploads`

---

## Summary

| Situation          | PUBLIC_API_URL               | Works Everywhere? |
| ------------------ | ---------------------------- | ----------------- |
| Local machine only | `http://localhost:5000`      | ❌ No             |
| Local network      | `http://192.168.1.100:5000`  | ✅ Yes (LAN)      |
| Production domain  | `https://yourdomain.com`     | ✅ Yes            |
| With CDN           | `https://cdn.yourdomain.com` | ✅ Yes            |
| Not set            | Uses request origin          | ⚠️ Maybe          |

---

## Next Steps

1. **Set PUBLIC_API_URL in .env** based on your use case above
2. **Restart backend** (`npm run dev` or `docker-compose restart`)
3. **Test** with `/api/upload/verify` endpoint
4. **Upload** a new image
5. **Verify** it's accessible from different device/network

That's it! All uploads will now be publicly accessible from anywhere. 🎉
