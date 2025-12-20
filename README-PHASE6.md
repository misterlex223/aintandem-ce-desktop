# Phase 6: Embedded Containerd Runtime - Implementation Guide

## Overview

Phase 6 adds support for containerd as an alternative container runtime to Docker Desktop, enabling end-users to run AInTandem without requiring Docker Desktop installation.

## Features Implemented

### 1. Containerd Adapter (ContainerdAdapter)

**File**: `src/main/services/containerd-adapter.ts`

Full implementation of `IContainerRuntime` interface using `nerdctl` CLI:
- Container lifecycle (start, stop, remove, restart, pause/unpause)
- Image management (pull, list, remove, exists check)
- Network operations (create, list, remove, connect/disconnect)
- Volume management (create, list, remove)
- Stats and health monitoring
- System operations (info, prune)

**Requirements**:
- `nerdctl` must be installed on the system
- Containerd service must be running
- Uses `kai` namespace for isolation

### 2. Enhanced Runtime Detection

**File**: `src/main/services/container-manager.ts`

**New Features**:
- `detectAvailableRuntimes()` - Detects both Docker and containerd availability
- `switchRuntime(type)` - Hot-switch between Docker and containerd
- Auto-detection priority: Docker Desktop → Containerd
- Clear error messages with installation links

**Detection Logic**:
```typescript
// Tries Docker first (developer mode)
if (preferredRuntime === 'docker' || preferredRuntime === 'auto') {
  // Try Docker Desktop
}

// Falls back to containerd (end-user mode)
if (preferredRuntime === 'containerd' || preferredRuntime === 'auto') {
  // Try containerd via nerdctl
}
```

### 3. Runtime Switcher UI

**File**: `src/renderer/pages/Settings.tsx`

**New Components**:
- Runtime Status Display showing:
  - Current active runtime
  - Docker Desktop availability
  - Containerd (nerdctl) availability
- Switch buttons for each available runtime
- Real-time status updates
- User-friendly error messages with installation instructions

**Features**:
- Visual indicators (green/red badges)
- One-click runtime switching
- Automatic service restart after switch
- Installation guidance when no runtime detected

### 4. Image Bundling System

**Script**: `scripts/bundle-backend-image.sh`

Exports Docker image for distribution:
```bash
./scripts/bundle-backend-image.sh
```

**Output**:
- `resources/kai-backend-image.tar.gz` - Compressed image tarball
- `resources/image-manifest.json` - Metadata (name, size, timestamp)

**Usage**:
1. Build backend image: `cd backend && docker build -t kai-backend:latest .`
2. Run bundle script: `cd kai-desktop && ./scripts/bundle-backend-image.sh`
3. Bundled image included in installer via `extraResources`

### 5. First-Launch Image Loading

**File**: `src/main/services/image-loader.ts`

**ImageLoader Service**:
- Loads bundled images on first app launch
- Checks if image already exists (skip if present)
- Supports both Docker and containerd
- Progress callback for UI feedback
- Non-fatal errors (continues startup if fails)

**Flow**:
1. App starts → Initialize container runtime
2. Check for bundled images in resources
3. Verify image doesn't already exist
4. Load image using `docker load` or `nerdctl load`
5. Continue normal startup

### 6. IPC API Additions

**New Runtime APIs**:
- `runtime:detectAvailable` - Get available runtimes
- `runtime:switch` - Switch active runtime

**Preload API**:
```typescript
window.kai.runtime.detectAvailable() // → { docker: boolean, containerd: boolean, current: string }
window.kai.runtime.switch(type) // → new runtime type
```

## Installation & Setup

### For Developers (Docker Desktop)

1. Install Docker Desktop
2. Run AInTandem Desktop - auto-detects Docker

### For End-Users (Containerd)

**macOS**:
```bash
brew install nerdctl
brew install containerd
sudo brew services start containerd
```

**Linux (Ubuntu/Debian)**:
```bash
# Install containerd
sudo apt-get update
sudo apt-get install -y containerd

# Install nerdctl
curl -LO https://github.com/containerd/nerdctl/releases/latest/download/nerdctl-full-linux-amd64.tar.gz
sudo tar Cxzvvf /usr/local nerdctl-full-linux-amd64.tar.gz

# Start containerd
sudo systemctl enable --now containerd
```

**Windows**:
- Install Rancher Desktop (includes containerd + nerdctl)
- Or follow nerdctl Windows installation guide

### Runtime Preferences

Set preferred runtime in Settings → General → Preferred Runtime:
- **Auto-detect** (default): Tries Docker first, then containerd
- **Docker Desktop**: Forces Docker Desktop only
- **Containerd**: Forces containerd only

## Building & Distribution

### Development Build

```bash
cd kai-desktop
pnpm install
pnpm build
pnpm dev
```

### Production Build with Bundled Image

```bash
# 1. Build backend image
cd backend
docker build -t kai-backend:latest .

# 2. Bundle image for distribution
cd ../kai-desktop
./scripts/bundle-backend-image.sh

# 3. Build Electron app
pnpm build

# 4. Create distributable
pnpm dist        # All platforms
pnpm dist:mac    # macOS only
pnpm dist:win    # Windows only
pnpm dist:linux  # Linux only
```

**Note**: Bundled image adds ~200-500 MB to installer size.

### Installer Configuration

**package.json** - `extraResources`:
```json
"extraResources": [
  {
    "from": "resources",
    "to": "resources",
    "filter": ["**/*"]
  }
]
```

Bundled images are copied to:
- **Development**: `kai-desktop/resources/`
- **Production**: `app.asar.unpacked/resources/` or `Contents/Resources/resources/`

## Testing

### Test Runtime Detection

```bash
# With Docker Desktop running
pnpm dev
# Check Settings → Runtime Status → Should show Docker available

# With Docker stopped and nerdctl installed
pnpm dev
# Check Settings → Runtime Status → Should show Containerd available
```

### Test Runtime Switching

1. Start app with Docker Desktop running
2. Open Settings → General → Runtime Status
3. If both runtimes available, click "Switch to Containerd"
4. App switches runtime and restarts services
5. Verify services work with new runtime

### Test Image Loading

```bash
# 1. Bundle image
./scripts/bundle-backend-image.sh

# 2. Remove existing image
docker rmi kai-backend:latest

# 3. Start app
pnpm dev

# 4. Check console logs
# Should see: "[Image Loader] Loading bundled image..."
# Should see: "[Image Loader] ✓ Image kai-backend:latest loaded successfully"
```

## Architecture Decisions

### Why nerdctl instead of containerd API?

- **Simplicity**: nerdctl provides Docker-compatible CLI, easier to integrate
- **Stability**: Well-tested, production-ready tool
- **Compatibility**: Works across all platforms (macOS, Windows, Linux)
- **Alternative**: Direct containerd API requires complex gRPC integration

### Why not bundle containerd binaries?

- **Size**: Containerd binaries add 50-100 MB per platform
- **Permissions**: Requires root/admin for installation and service management
- **Maintenance**: System-wide containerd better managed by OS package managers
- **Security**: Using system containerd ensures security updates

### Image Bundling Trade-offs

**Pros**:
- Faster first launch (no image download)
- Offline installation support
- Guaranteed image availability

**Cons**:
- Larger installer size (~200-500 MB for backend)
- Updates require new installer
- Potential version mismatches

**Decision**: Bundle only backend image, download others on demand

## Troubleshooting

### nerdctl not found

**Error**: `nerdctl not found. Please install nerdctl to use containerd runtime.`

**Solution**:
- Install nerdctl following instructions above
- Ensure nerdctl is in PATH
- Verify: `nerdctl --version`

### containerd not running

**Error**: `Failed to initialize container runtime`

**Solution**:
- Check containerd status: `sudo systemctl status containerd`
- Start containerd: `sudo systemctl start containerd`
- macOS: `sudo brew services start containerd`

### Image loading fails

**Error**: `Failed to load bundled image`

**Solutions**:
- Verify image file exists: `ls resources/kai-backend-image.tar.gz`
- Check file permissions
- Try manual load: `docker load < resources/kai-backend-image.tar.gz`
- Check available disk space

### Runtime switch fails

**Error**: `Failed to switch runtime`

**Solutions**:
- Stop all services before switching
- Ensure target runtime is available
- Check runtime is properly installed
- Restart app if needed

## Known Limitations

1. **No Bundled Binaries**: Containerd and nerdctl must be pre-installed
2. **Manual Installation**: Users must install containerd manually
3. **Platform Differences**: nerdctl behavior varies slightly across platforms
4. **Image Compatibility**: Some Docker-specific features may not work with containerd
5. **Windows Support**: Containerd on Windows requires WSL2 or Rancher Desktop

## Future Enhancements

### Phase 7 (Future):
- Auto-install nerdctl on first launch
- Bundled containerd binaries for true standalone operation
- System tray integration
- Advanced networking features
- Multi-runtime orchestration (run some containers on Docker, others on containerd)

## Links

- **nerdctl**: https://github.com/containerd/nerdctl
- **containerd**: https://containerd.io/
- **Rancher Desktop**: https://rancherdesktop.io/ (Windows/macOS containerd)
- **Docker Desktop**: https://www.docker.com/products/docker-desktop
