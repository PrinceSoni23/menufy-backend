#!/bin/bash
# Setup MinIO (self-hosted object storage) for file uploads
# MinIO is S3-compatible and can be run locally without cloud dependencies
# This script sets up MinIO with Docker

set -e

MINIO_VERSION="latest"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
MINIO_DATA_DIR="${MINIO_DATA_DIR:-./minio-data}"
BUCKET_NAME="${BUCKET_NAME:-uploads}"

echo "🚀 MinIO Self-Hosted Object Storage Setup"
echo "=============================================="
echo ""
echo "Config:"
echo "  - Version: $MINIO_VERSION"
echo "  - API Port: $MINIO_PORT"
echo "  - Console Port: $MINIO_CONSOLE_PORT"
echo "  - Root User: $MINIO_ROOT_USER"
echo "  - Data Dir: $MINIO_DATA_DIR"
echo "  - Bucket: $BUCKET_NAME"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker first."
  echo "   Visit: https://docs.docker.com/get-docker/"
  exit 1
fi

# Create data directory
mkdir -p "$MINIO_DATA_DIR"

# Stop and remove existing MinIO container (if any)
echo "🛑 Stopping any existing MinIO container..."
docker stop minio-ar-menu 2>/dev/null || true
docker rm minio-ar-menu 2>/dev/null || true

# Start MinIO container
echo "🔄 Starting MinIO container..."
docker run -d \
  --name minio-ar-menu \
  -p "$MINIO_PORT:9000" \
  -p "$MINIO_CONSOLE_PORT:9001" \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  -v "$MINIO_DATA_DIR:/data" \
  minio/minio:"$MINIO_VERSION" \
  server /data

echo "✅ MinIO container started successfully"
echo ""
echo "🎯 Access Points:"
echo "   - API: http://localhost:$MINIO_PORT"
echo "   - Console: http://localhost:$MINIO_CONSOLE_PORT"
echo "   - Username: $MINIO_ROOT_USER"
echo "   - Password: $MINIO_ROOT_PASSWORD"
echo ""
echo "Wait 5 seconds for MinIO to be ready..."
sleep 5

# Install MinIO CLI (mc) if not already present
if ! command -v mc &> /dev/null; then
  echo "📦 Installing MinIO CLI (mc)..."
  docker cp minio-ar-menu:/usr/bin/mc ./mc || echo "⚠️  Could not copy mc binary"
fi

echo ""
echo "✅ MinIO is ready!"
echo ""
echo "📝 Next steps:"
echo "1. Open http://localhost:$MINIO_CONSOLE_PORT in your browser"
echo "2. Login with:"
echo "     Username: $MINIO_ROOT_USER"
echo "     Password: $MINIO_ROOT_PASSWORD"
echo "3. Create bucket '$BUCKET_NAME' via console"
echo "4. Generate access keys for your app"
echo ""
echo "📋 Backend Integration:"
echo "   Install: npm install aws-sdk"
echo "   See: minio-integration.js for example code"
echo ""
echo "🔐 Important:"
echo "   - Change MINIO_ROOT_PASSWORD in production!"
echo "   - Setup HTTPS/TLS for production"
echo "   - Use signed URLs for secure file access"
echo "   - Set bucket policies for public/private access"
