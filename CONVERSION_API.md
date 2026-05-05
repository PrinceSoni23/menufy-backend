# 2D-to-3D Image Conversion API Documentation

## Overview

The image upload and conversion system enables restaurant owners to upload 2D images of dishes, which are automatically converted to interactive 3D models using Tripo AI technology.

## Features

- **Automatic Conversion**: Upload a 2D image and automatically convert it to a 3D model
- **Real-time Status Tracking**: Monitor conversion progress and status
- **Webhook Support**: Receive instant notifications when conversions complete
- **Retry Capability**: Retry failed conversions without re-uploading
- **Cancellation**: Cancel pending conversions at any time
- **Image Validation**: Automatic validation of image format and file size (Max 10MB, JPEG/PNG/WebP/GIF)

## Architecture

### Components

1. **Upload Handler** (`uploadHandler.ts`):
   - Multer middleware for file upload handling
   - Disk storage with unique filename generation
   - Image validation (format, size)
   - File management utilities

2. **Conversion Service** (`conversion.service.ts`):
   - Tripo AI API integration
   - Job submission and status tracking
   - Automatic polling with retry logic
   - Background batch processing

3. **Upload Controller** (`upload.controller.ts`):
   - HTTP request handling
   - Ownership verification
   - Error management
   - Webhook endpoint for Tripo AI callbacks

4. **Conversion Scheduler** (`conversionScheduler.ts`):
   - Background job runner
   - Periodic polling of pending conversions
   - Error recovery and logging

## API Endpoints

### 1. Upload and Start Conversion

**Endpoint**: `POST /api/upload/menu-item/:restaurantId/:menuItemId`

**Authentication**: Required (JWT token)

**Request**:

```
Content-Type: multipart/form-data

Parameters:
- restaurantId: Restaurant ID (path parameter)
- menuItemId: Menu Item ID (path parameter)
- image: Image file (form field, max 10MB)

Supported formats: JPEG, PNG, WebP, GIF
```

**Response**:

```json
{
  "success": true,
  "message": "Image uploaded and 3D conversion started",
  "data": {
    "imageUrl": "/uploads/images/uuid.jpg",
    "conversion": {
      "jobId": "tripo-job-id",
      "menuItemId": "menu-item-id",
      "status": "pending"
    },
    "conversionJobId": "tripo-job-id"
  }
}
```

**Error Responses**:

- `400`: No image provided or invalid format
- `401`: Authentication required
- `403`: You don't have permission to upload for this restaurant
- `404`: Menu item not found
- `413`: File size exceeds 10MB

---

### 2. Get Conversion Status

**Endpoint**: `GET /api/upload/conversion-status/:jobId`

**Authentication**: Required (JWT token)

**Parameters**:

- jobId: Conversion job ID (path parameter)

**Response**:

```json
{
  "success": true,
  "message": "Conversion status retrieved",
  "data": {
    "status": {
      "jobId": "tripo-job-id",
      "tripoJobId": "tripo-job-id",
      "menuItemId": "menu-item-id",
      "tripoStatus": "processing",
      "progress": 45,
      "modelUrl": null,
      "generatedAt": null,
      "error": null
    }
  }
}
```

**Status Values**:

- `pending`: Waiting to be processed
- `processing`: Currently converting
- `succeeded`: Conversion complete, model available
- `failed`: Conversion failed
- `cancelled`: User cancelled the conversion

---

### 3. Cancel Conversion

**Endpoint**: `POST /api/upload/cancel-conversion/:jobId`

**Authentication**: Required (JWT token)

**Parameters**:

- jobId: Conversion job ID (path parameter)

**Response**:

```json
{
  "success": true,
  "message": "Conversion cancelled",
  "data": {
    "jobId": "tripo-job-id",
    "status": "cancelled"
  }
}
```

---

### 4. Retry Conversion

**Endpoint**: `POST /api/upload/retry-conversion/:menuItemId`

**Authentication**: Required (JWT token)

**Parameters**:

- menuItemId: Menu Item ID (path parameter)

**Response**:

```json
{
  "success": true,
  "message": "Conversion retry started",
  "data": {
    "conversion": {
      "jobId": "new-tripo-job-id",
      "menuItemId": "menu-item-id",
      "status": "pending"
    }
  }
}
```

**Error Responses**:

- `400`: No image available for conversion
- `404`: Menu item not found
- `500`: Failed to start conversion retry

---

### 5. Webhook - Conversion Complete

**Endpoint**: `POST /api/upload/conversion-complete`

**Authentication**: None (Called by Tripo AI)

**Request Body**:

```json
{
  "job_id": "tripo-job-id",
  "status": "succeeded",
  "data": {
    "model_url": "https://tripo.s3.amazonaws.com/models/...",
    "preview_url": "https://tripo.s3.amazonaws.com/previews/..."
  }
}
```

**Response**:

```json
{
  "success": true,
  "message": "Conversion updated"
}
```

---

## Database Schema

### ConversionJob Model

```typescript
{
  _id: ObjectId
  menuItemId: ObjectId (ref: MenuItem)
  tripoJobId: string
  imageUrl: string
  tripoStatus: string ('pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled')
  progress: number (0-100)
  modelUrl?: string
  modelPreviewUrl?: string
  generatedAt?: Date
  error?: string
  createdAt: Date
  updatedAt: Date
}
```

### MenuItem Schema Updates

```typescript
{
  // ... existing fields
  imageUrl2D?: string         // 2D image URL (uploaded by user)
  modelUrl?: string           // 3D model URL (from Tripo AI)
  modelPreviewUrl?: string    // 3D model preview
  status: 'pending' | 'converting' | 'ready' | 'failed'
  conversionProgress: number  // 0-100
}
```

---

## Configuration

### Environment Variables

Add these to `.env.local`:

```env
# Tripo AI Configuration
TRIPO_API_KEY=your_tripo_api_key_here
TRIPO_API_BASE_URL=https://api.tripo3d.com

# Conversion Polling
CONVERSION_POLL_INTERVAL_MS=30000  # Check pending conversions every 30 seconds
```

### Getting Tripo AI API Key

1. Visit [https://www.tripo3d.com](https://www.tripo3d.com)
2. Sign up for a free account
3. Navigate to API settings
4. Copy your API key
5. Add it to `.env.local`

**Free Tier**: 100 conversions per month

---

## Usage Example

### Client-side (JavaScript/React)

```javascript
// Upload image and start conversion
const uploadImage = async (restaurantId, menuItemId, imageFile, token) => {
  const formData = new FormData();
  formData.append("image", imageFile);

  try {
    const response = await fetch(
      `/api/upload/menu-item/${restaurantId}/${menuItemId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const result = await response.json();
    const jobId = result.data.conversionJobId;
    console.log("Conversion started:", jobId);

    // Poll for status
    checkConversionStatus(jobId, token);
  } catch (error) {
    console.error("Upload error:", error);
  }
};

// Check conversion status
const checkConversionStatus = async (jobId, token) => {
  try {
    const response = await fetch(`/api/upload/conversion-status/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();
    const { status } = result.data;

    console.log("Conversion status:", status.tripoStatus);
    console.log("Progress:", status.progress);

    if (status.tripoStatus === "succeeded") {
      console.log("3D Model ready:", status.modelUrl);
      // Display the model or update UI
    } else if (status.tripoStatus === "failed") {
      console.error("Conversion failed:", status.error);
    } else {
      // Check again in 5 seconds
      setTimeout(() => checkConversionStatus(jobId, token), 5000);
    }
  } catch (error) {
    console.error("Status check error:", error);
  }
};
```

### Server-side Integration

The conversion scheduler automatically:

1. Polls pending conversions every 30 seconds
2. Checks job status with Tripo AI API
3. Updates the database on status changes
4. Updates MenuItem model with final results

No manual polling is required - the server handles it all automatically!

---

## Error Handling

### Common Issues & Solutions

**Issue**: Upload returns 400 "No image file provided"

- **Solution**: Ensure form field is named `image` and contains the file

**Issue**: Upload returns 403 "No permission"

- **Solution**: Verify you own the restaurant (ownerId matches user ID)

**Issue**: Conversion status shows "processing" indefinitely

- **Solution**: Check Tripo AI API key is correct and has remaining quota
- **Solution**: Wait - conversions can take 2-5 minutes

**Issue**: Webhook not receiving updates

- **Solution**: Configure webhook URL in Tripo AI dashboard
- **Solution**: Ensure webhook endpoint is publicly accessible

**Issue**: "Only image files are allowed" error

- **Solution**: Use JPEG, PNG, WebP, or GIF format
- **Solution**: Ensure file is not corrupted

---

## Monitoring & Debugging

### Check Server Logs

```bash
tail -f logs/server.log | grep -i conversion
```

### Conversion Scheduler Logs

- `Starting conversion scheduler (polling every 30000ms)` - Scheduler started
- `Checking pending conversions` - Poll executed
- `Conversion completed successfully` - 3D model ready
- `Conversion failed` - Error occurred

### Database Queries

```javascript
// Find all pending conversions
db.conversionjobs.find({ tripoStatus: "pending" });

// Find conversions for a specific menu item
db.conversionjobs.find({ menuItemId: ObjectId("...") });

// Check conversion history
db.conversionjobs.find({}).sort({ createdAt: -1 }).limit(10);
```

---

## Performance Notes

- **Upload**: 100-500ms (includes image validation)
- **Initial Job Submission**: 500-1500ms (Tripo AI API call)
- **Conversion**: 2-10 minutes (depends on image complexity)
- **Polling**: 30-second intervals (configurable)
- **Storage**: ~2-5MB per uploaded image

---

## Security Considerations

1. **Ownership Verification**: Always verified server-side before conversion
2. **File Validation**: Strict MIME type and size checks
3. **JWT Authentication**: All endpoints require valid token (except webhooks)
4. **Rate Limiting**: Global rate limiting applied to all endpoints
5. **Webhook Security**: Validate webhook origin from Tripo AI

---

## Future Enhancements

- [ ] Batch image upload (multiple dishes at once)
- [ ] Image preprocessing (auto-crop, background removal)
- [ ] Advanced 3D model customization
- [ ] Model versioning and history
- [ ] Conversion analytics dashboard
- [ ] Cost tracking per conversion
- [ ] AWS S3 integration for robust storage
- [ ] CloudFront CDN for model delivery

---

## Support

For issues or questions:

1. Check the logs: `logs/server.log`
2. Review Tripo AI API documentation: https://docs.tripo3d.com
3. Check MongoDB ConversionJob documents
4. Verify `.env.local` configuration
