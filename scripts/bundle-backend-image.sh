#!/bin/bash

# Script to export backend Docker image for bundling with Electron app
# This creates a tarball of the backend image that can be loaded on first launch

set -e

echo "Bundling Kai Backend Docker Image..."

# Configuration
IMAGE_NAME="kai-backend:latest"
OUTPUT_DIR="$(dirname "$0")/../resources"
OUTPUT_FILE="$OUTPUT_DIR/kai-backend-image.tar.gz"

# Create resources directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if image exists
if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
    echo "Error: Image $IMAGE_NAME not found"
    echo "Please build the backend image first:"
    echo "  cd ../backend && docker build -t $IMAGE_NAME ."
    exit 1
fi

# Export image to tar
echo "Exporting image $IMAGE_NAME..."
docker save "$IMAGE_NAME" | gzip > "$OUTPUT_FILE"

# Get file size
SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "✓ Image exported successfully: $OUTPUT_FILE ($SIZE)"

# Create manifest file
cat > "$OUTPUT_DIR/image-manifest.json" <<EOF
{
  "imageName": "$IMAGE_NAME",
  "fileName": "kai-backend-image.tar.gz",
  "exportedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "size": "$SIZE"
}
EOF

echo "✓ Manifest created: $OUTPUT_DIR/image-manifest.json"
echo ""
echo "Image bundle ready for distribution!"
echo "The bundled image will be loaded on first app launch if not already present."
