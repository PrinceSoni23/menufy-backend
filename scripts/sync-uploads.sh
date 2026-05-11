#!/bin/bash
# Sync uploads between primary and secondary hosts
# Usage: ./sync-uploads.sh <primary-host> <secondary-host> [username]

PRIMARY_HOST="${1:-production-server.com}"
SECONDARY_HOST="${2:-backup-server.com}"
SSH_USER="${3:-deploy}"
UPLOADS_DIR="./uploads"

if [ "$PRIMARY_HOST" = "" ] || [ "$SECONDARY_HOST" = "" ]; then
  echo "Usage: ./sync-uploads.sh <primary-host> <secondary-host> [username]"
  echo "Example: ./sync-uploads.sh prod.example.com backup.example.com deploy"
  exit 1
fi

echo "🔄 Syncing uploads from $PRIMARY_HOST to $SECONDARY_HOST..."
echo "   Using SSH user: $SSH_USER"
echo "   Local uploads dir: $UPLOADS_DIR"
echo ""

# Option 1: Pull uploads from primary to local
echo "1️⃣  Pulling uploads from primary host..."
rsync -avz \
  --delete \
  --checksum \
  "${SSH_USER}@${PRIMARY_HOST}:${UPLOADS_DIR}/" \
  "${UPLOADS_DIR}/"

if [ $? -eq 0 ]; then
  echo "✅ Pull from primary completed"
else
  echo "❌ Pull from primary failed"
  exit 1
fi

# Option 2: Push uploads from local to secondary
echo ""
echo "2️⃣  Pushing uploads to backup host..."
rsync -avz \
  --delete \
  --checksum \
  "${UPLOADS_DIR}/" \
  "${SSH_USER}@${SECONDARY_HOST}:${UPLOADS_DIR}/"

if [ $? -eq 0 ]; then
  echo "✅ Push to backup completed"
else
  echo "❌ Push to backup failed"
  exit 1
fi

echo ""
echo "✅ All uploads synced successfully!"
echo ""
echo "📋 To automate this, add to crontab (sync every hour):"
echo "   0 * * * * cd /path/to/backend && ./sync-uploads.sh $PRIMARY_HOST $SECONDARY_HOST $SSH_USER >> /var/log/uploads-sync.log 2>&1"
