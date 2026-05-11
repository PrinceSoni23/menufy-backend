/**
 * MinIO Integration Example
 * Shows how to upload/retrieve files from MinIO instead of local filesystem
 *
 * Installation:
 *   npm install aws-sdk dotenv
 *
 * Environment variables (.env):
 *   MINIO_ENDPOINT=localhost:9000
 *   MINIO_ACCESS_KEY=minioadmin
 *   MINIO_SECRET_KEY=minioadmin
 *   MINIO_USE_SSL=false
 *   MINIO_BUCKET_NAME=uploads
 *   API_URL=http://localhost:5000
 */

const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

// Configure MinIO as S3-compatible service
const minioClient = new AWS.S3({
  endpoint: process.env.MINIO_ENDPOINT || "localhost:9000",
  accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  useSSL: process.env.MINIO_USE_SSL === "true",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || "uploads";
const API_URL = process.env.API_URL || "http://localhost:5000";

/**
 * Upload file to MinIO
 * @param {Buffer|Stream} fileBuffer - File content
 * @param {string} originalFilename - Original filename
 * @param {string} folder - Subfolder (images, 3d-models)
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadToMinIO(fileBuffer, originalFilename, folder = "images") {
  const uniqueName = `${uuidv4()}${path.extname(originalFilename)}`;
  const key = `${folder}/${uniqueName}`;

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: getMimeType(originalFilename),
    // Make file publicly readable (for restaurant menus)
    ACL: "public-read",
    // Cache for 7 days
    CacheControl: "public, max-age=604800",
  };

  try {
    const result = await minioClient.upload(params).promise();
    const publicUrl = `${API_URL}/minio/${key}`;
    console.log(`✅ Uploaded to MinIO: ${key}`);
    return {
      url: publicUrl,
      key: key,
      eTag: result.ETag,
    };
  } catch (error) {
    console.error(`❌ MinIO upload failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get signed download URL (expires in 7 days)
 * Useful for private files or temporary access
 */
async function getSignedUrl(key, expiresIn = 604800) {
  // expiresIn in seconds (604800 = 7 days)
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: Math.ceil(expiresIn / 1000),
  };

  try {
    const url = await minioClient.getSignedUrl("getObject", params);
    return url;
  } catch (error) {
    console.error(`❌ Failed to generate signed URL: ${error.message}`);
    throw error;
  }
}

/**
 * Delete file from MinIO
 */
async function deleteFromMinIO(key) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  try {
    await minioClient.deleteObject(params).promise();
    console.log(`✅ Deleted from MinIO: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ MinIO delete failed: ${error.message}`);
    return false;
  }
}

/**
 * List files in a folder
 */
async function listFiles(prefix = "images/", maxKeys = 100) {
  const params = {
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  };

  try {
    const result = await minioClient.listObjectsV2(params).promise();
    return result.Contents || [];
  } catch (error) {
    console.error(`❌ MinIO list failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "model/obj",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Create bucket if it doesn't exist
 */
async function ensureBucketExists() {
  try {
    await minioClient.headBucket({ Bucket: BUCKET_NAME }).promise();
    console.log(`✅ Bucket exists: ${BUCKET_NAME}`);
  } catch (error) {
    if (error.code === "NoSuchBucket") {
      console.log(`📦 Creating bucket: ${BUCKET_NAME}`);
      await minioClient.createBucket({ Bucket: BUCKET_NAME }).promise();
      console.log(`✅ Bucket created: ${BUCKET_NAME}`);
    } else {
      throw error;
    }
  }
}

// Example usage (for testing)
if (require.main === module) {
  (async () => {
    try {
      // Ensure bucket exists
      await ensureBucketExists();

      // Example: Upload a file
      const testFile = Buffer.from("test image data");
      const uploadResult = await uploadToMinIO(testFile, "test.jpg", "images");
      console.log(`Uploaded: ${uploadResult.url}`);

      // Example: List files
      const files = await listFiles("images/", 10);
      console.log(`Found ${files.length} files in images/`);
      files.forEach(file => {
        console.log(`  - ${file.Key} (${file.Size} bytes)`);
      });

      // Example: Get signed URL (valid for 1 hour)
      if (files.length > 0) {
        const signedUrl = await getSignedUrl(files[0].Key, 3600);
        console.log(`Signed URL (1 hour): ${signedUrl}`);
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  })();
}

module.exports = {
  uploadToMinIO,
  getSignedUrl,
  deleteFromMinIO,
  listFiles,
  ensureBucketExists,
  minioClient,
};
