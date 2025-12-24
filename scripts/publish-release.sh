#!/bin/bash

# Script to publish distribution files to GitHub using gh release
# Usage: ./publish-release.sh [tag] [release_title] [release_notes_file]
# If no arguments provided, will try to detect from package.json

set -e  # Exit on any error

# Function to print messages
print_status() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to get version from package.json if not provided
get_version_from_package() {
    if [ -f "package.json" ]; then
        node -p "require('./package.json').version" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Function to get app name from package.json if not provided
get_app_name_from_package() {
    if [ -f "package.json" ]; then
        node -p "require('./package.json').productName || require('./package.json').name" 2>/dev/null || echo "AInTandem Desktop"
    else
        echo "AInTandem Desktop"
    fi
}

# Get command line arguments or set defaults
TAG=${1:-"v$(get_version_from_package)"}
RELEASE_TITLE=${2:-"Release $(get_app_name_from_package) $(get_version_from_package)"}
RELEASE_NOTES_FILE=${3:-"CHANGELOG.md"}

print_status "Preparing to publish release: $TAG"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: gh CLI is not installed. Please install it from https://cli.github.com/"
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: dist directory does not exist"
    exit 1
fi

# Check if release already exists
if gh release view "$TAG" &> /dev/null; then
    print_status "Release $TAG already exists. Updating..."
    RELEASE_EXISTS=1
else
    print_status "Creating new release $TAG"
    RELEASE_EXISTS=0
fi

# Create temporary release notes file if it doesn't exist
TEMP_NOTES_FILE=""
if [ ! -f "$RELEASE_NOTES_FILE" ]; then
    print_status "Creating temporary release notes"
    TEMP_NOTES_FILE=$(mktemp)
    RELEASE_NOTES_FILE="$TEMP_NOTES_FILE"
    echo "# Release $TAG" > "$RELEASE_NOTES_FILE"
    echo "" >> "$RELEASE_NOTES_FILE"
    echo "Automated release for version $TAG" >> "$RELEASE_NOTES_FILE"
fi

# Create or update the release
print_status "Creating/updating GitHub release: $TAG"
if [ "$RELEASE_EXISTS" -eq 1 ]; then
    gh release edit "$TAG" \
        --title "$RELEASE_TITLE" \
        --notes-file "$RELEASE_NOTES_FILE"
else
    gh release create "$TAG" \
        --title "$RELEASE_TITLE" \
        --notes-file "$RELEASE_NOTES_FILE" \
        --draft=false
fi

# Find and upload distribution files
print_status "Looking for distribution files in dist/ directory..."

# Array to hold all files to upload
files_to_upload=()

# Find all relevant distribution files (only in dist directory, not subdirectories)
while IFS= read -r -d '' file; do
    files_to_upload+=("$file")
    print_status "Found distribution file: $file"
done < <(find dist -maxdepth 1 -type f \( -name "*.dmg" -o -name "*.AppImage" -o -name "*.blockmap" -o -name "*.exe" -o -name "*.zip" -o -name "*.yml" -o -name "*.yaml" \) -print0)

if [ ${#files_to_upload[@]} -eq 0 ]; then
    print_status "No distribution files found matching the criteria"
    exit 0
fi

print_status "Uploading ${#files_to_upload[@]} distribution files to release: $TAG"

# Upload each file
for file in "${files_to_upload[@]}"; do
    print_status "Uploading $file..."

    # Delete the asset if it already exists
    filename=$(basename "$file")

    # Get release information to find existing assets
    release_info=$(gh api "repos/$(gh repo view --json nameWithOwner -q '.nameWithOwner')/releases/tags/$TAG" 2>/dev/null) || true
    if [ -n "$release_info" ] && [ "$release_info" != "null" ]; then
        # Get asset ID by name and delete it
        asset_id=$(echo "$release_info" | jq -r ".assets[] | select(.name == \"$filename\") | .id" 2>/dev/null) || true
        if [ -n "$asset_id" ] && [ "$asset_id" != "null" ] && [ "$asset_id" != "" ]; then
            print_status "Deleting existing asset: $filename (ID: $asset_id)"
            # Use the gh api to delete the specific asset by ID
            if gh api "repos/$(gh repo view --json nameWithOwner -q '.nameWithOwner')/releases/assets/$asset_id" -X DELETE 2>/dev/null; then
                print_status "Successfully deleted existing asset: $filename"
                # Wait for deletion to process
                sleep 2
            else
                print_status "Could not delete existing asset: $filename (may not exist yet)"
            fi
        else
            print_status "No existing asset found with name: $filename"
        fi
    else
        print_status "Could not retrieve release information to check for existing assets"
    fi

    # Retry the upload with a maximum of 3 attempts
    max_attempts=3
    attempt=1

    while [ $attempt -le $max_attempts ]; do
        if gh release upload "$TAG" "$file" --clobber; then
            print_status "Successfully uploaded $file"
            break
        else
            print_status "Failed to upload $file (attempt $attempt/$max_attempts), retrying in 3 seconds..."
            sleep 3
            attempt=$((attempt + 1))
        fi
    done

    # If all attempts failed, exit with error
    if [ $attempt -gt $max_attempts ]; then
        print_status "Failed to upload $file after $max_attempts attempts"
        exit 1
    fi
done

print_status "Successfully published release: $TAG"

# Clean up temporary file if we created one
if [ -n "$TEMP_NOTES_FILE" ] && [ -f "$TEMP_NOTES_FILE" ]; then
    rm "$TEMP_NOTES_FILE"
fi

print_status "Release publishing completed!"