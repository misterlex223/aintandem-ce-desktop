#!/usr/bin/env node
/**
 * Download bundled containerd runtime for distribution
 * This script downloads nerdctl-full packages for all supported platforms
 * and prepares them for inclusion in electron-builder packages
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// nerdctl does NOT support macOS natively - use Lima instead
const NERDCTL_VERSION = '2.1.6';
const LIMA_VERSION = '1.2.1';

// nerdctl downloads for Linux/Windows
const NERDCTL_URLS = {
  'linux-arm64': `https://github.com/containerd/nerdctl/releases/download/v${NERDCTL_VERSION}/nerdctl-full-${NERDCTL_VERSION}-linux-arm64.tar.gz`,
  'linux-x64': `https://github.com/containerd/nerdctl/releases/download/v${NERDCTL_VERSION}/nerdctl-full-${NERDCTL_VERSION}-linux-amd64.tar.gz`,
  'win32-x64': `https://github.com/containerd/nerdctl/releases/download/v${NERDCTL_VERSION}/nerdctl-full-${NERDCTL_VERSION}-windows-amd64.tar.gz`
};

// Lima downloads for macOS (provides containerd + nerdctl in Linux VM)
const LIMA_URLS = {
  'darwin-arm64': `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-arm64.tar.gz`,
  'darwin-x64': `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-x86_64.tar.gz`
};

// Combine all download URLs
const DOWNLOAD_URLS = {
  ...NERDCTL_URLS,
  ...LIMA_URLS
};

const resourcesDir = path.join(__dirname, '..', 'resources', 'bundled-runtime');

/**
 * Download file with progress
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url}...`);

    const file = fs.createWriteStream(dest);

    const request = (urlStr) => {
      https.get(urlStr, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          console.log(`Following redirect to ${redirectUrl}`);
          request(redirectUrl);
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);
            if (percent > lastPercent && percent % 10 === 0) {
              console.log(`  Progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
              lastPercent = percent;
            }
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`  Downloaded: ${dest}`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

/**
 * Extract tar.gz file
 */
function extractTarGz(tarPath, destDir) {
  console.log(`Extracting ${path.basename(tarPath)} to ${destDir}...`);

  // Create destination directory
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Extract using tar command
  try {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { stdio: 'inherit' });
    console.log(`  Extracted successfully`);
  } catch (error) {
    throw new Error(`Failed to extract ${tarPath}: ${error.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let platforms = Object.keys(DOWNLOAD_URLS);

  if (args.includes('--current-platform')) {
    // Only download for current platform
    const currentPlatform = process.platform;
    const currentArch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platformKey = `${currentPlatform}-${currentArch}`;

    if (DOWNLOAD_URLS[platformKey]) {
      platforms = [platformKey];
      console.log(`Downloading only for current platform: ${platformKey}`);
    } else {
      console.warn(`No bundled runtime available for ${platformKey}`);
      return;
    }
  } else {
    console.log('Downloading for all platforms...');
  }

  // Create resources directory
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // Download and extract for each platform
  for (const platformKey of platforms) {
    const url = DOWNLOAD_URLS[platformKey];
    const tarFileName = path.basename(url);
    const tarPath = path.join(resourcesDir, tarFileName);
    const extractDir = path.join(resourcesDir, platformKey);

    console.log(`\n=== Processing ${platformKey} ===`);

    // Skip if already extracted
    if (fs.existsSync(extractDir) && fs.readdirSync(extractDir).length > 0) {
      console.log(`  Already extracted, skipping...`);
      continue;
    }

    try {
      // Download if not exists
      if (!fs.existsSync(tarPath)) {
        await downloadFile(url, tarPath);
      } else {
        console.log(`  Archive already exists, skipping download`);
      }

      // Extract
      extractTarGz(tarPath, extractDir);

      // Clean up tar file to save space (optional)
      if (args.includes('--clean')) {
        fs.unlinkSync(tarPath);
        console.log(`  Cleaned up ${tarFileName}`);
      }
    } catch (error) {
      console.error(`Failed to process ${platformKey}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✅ All bundled runtimes prepared successfully!');
  console.log(`📂 Location: ${resourcesDir}`);
  console.log(`\nRuntimes downloaded:`);
  for (const platform of platforms) {
    const runtimeType = LIMA_URLS[platform] ? 'Lima' : 'nerdctl';
    const version = LIMA_URLS[platform] ? LIMA_VERSION : NERDCTL_VERSION;
    console.log(`  - ${platform}: ${runtimeType} v${version}`);
  }
  console.log(`\nTo include in distribution, these will be packaged with electron-builder.`);
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
