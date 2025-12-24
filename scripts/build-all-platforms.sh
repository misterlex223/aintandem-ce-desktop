#!/bin/bash

# Script to build AInTandem Desktop for all platforms
# This script follows the build sequence:
# 1. Create electronuserland container
# 2. Execute pnpm install --force && pnpm build && pnpm dist --linux --win
# 3. Stop electronuserland container
# 4. Execute pnpm install --force && pnpm dist --mac
# 5. Publish with pnpm release

set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting AInTandem Desktop build process..."

# Step 1 & 2: Build Linux & Windows in electronuserland container
echo "Building Linux & Windows distributions in electronuserland container..."
docker run --rm -ti \
 --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
 --env ELECTRON_CACHE="/root/.cache/electron" \
 --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
 -v ${PWD}:/project \
 -v ${PWD##*/}-node-modules:/project/node_modules \
 -v ~/.cache/electron:/root/.cache/electron \
 -v ~/.cache/electron-builder:/root/.cache/electron-builder \
 electronuserland/builder:wine \
 bash -c "cd /project && pnpm install --force && pnpm build && pnpm dist --linux --win"

echo "Linux & Windows build completed."

# Step 4: Build Mac distribution
echo "Building Mac distribution..."
pnpm install --force && pnpm dist:mac

echo "Mac build completed."

# Step 5: Publish
echo "Publishing releases..."
pnpm release

echo "Build and publish process completed successfully!"