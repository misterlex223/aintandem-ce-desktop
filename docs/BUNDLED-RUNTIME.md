# Bundled Container Runtime

Kai Desktop can include a bundled containerd runtime in distribution packages, making it fully standalone without requiring Docker Desktop.

## Overview

The bundled runtime system supports two modes:

1. **On-Demand Download** (Default): Runtime is downloaded on first use (~50-100MB)
2. **Pre-Bundled** (Optional): Runtime is included in the installer (~100-150MB larger installer)

## Build Scripts

### Download Runtime for Current Platform

```bash
pnpm download-runtime --current-platform
```

Downloads and extracts containerd runtime for your current platform only.

### Download Runtime for All Platforms

```bash
pnpm download-runtime
```

Downloads runtime for all supported platforms (macOS ARM64/x64, Linux ARM64/x64, Windows x64).

### Build Distribution with Bundled Runtime

```bash
# For current platform only
pnpm dist:bundled

# For all platforms (requires downloading all runtimes first)
pnpm dist:bundled:all
```

## Supported Platforms

**IMPORTANT**: nerdctl does NOT provide native macOS binaries. macOS uses Lima instead.

- **macOS**: ✅ Lima v1.2.1 (Linux VM with containerd + nerdctl)
- **Linux**: ✅ nerdctl v2.1.6 (ARM64, x64)
- **Windows**: ✅ nerdctl v2.1.6 (x64)

## Runtime Components

### macOS (Lima)
- **limactl**: Lima VM manager (~29MB)
- **lima**: Wrapper for running commands in VM
- **nerdctl.lima**: Shortcut for `lima nerdctl`
- VM includes: Ubuntu + containerd + nerdctl + runc + CNI plugins

### Linux/Windows (nerdctl-full)
- **containerd**: Container runtime daemon
- **nerdctl**: Docker-compatible CLI
- **runc**: OCI runtime
- **CNI plugins**: Container networking
- **containerd-shim-runc-v2**: Container shim

## Directory Structure

### Pre-Bundled (in app resources)
```
resources/
└── bundled-runtime/
    ├── darwin-arm64/
    │   └── bin/
    │       ├── nerdctl
    │       ├── containerd
    │       ├── runc
    │       └── ...
    ├── darwin-x64/
    ├── linux-arm64/
    ├── linux-x64/
    └── win32-x64/
```

### Runtime Installation (user data)
```
~/Library/Application Support/kai-desktop/bundled-runtime/  (macOS)
~/.config/kai-desktop/bundled-runtime/                      (Linux)
%APPDATA%/kai-desktop/bundled-runtime/                      (Windows)

├── bin/              # Extracted binaries
├── data/             # Container runtime data
│   ├── root/         # Persistent data
│   ├── state/        # Execution state
│   └── containerd.sock
└── containerd-config.toml
```

## Build Process

### With Pre-Bundled Runtime

1. Download runtime binaries:
   ```bash
   pnpm download-runtime --current-platform
   ```

2. Build application:
   ```bash
   pnpm build
   ```

3. Create distribution:
   ```bash
   pnpm dist
   ```

The runtime will be automatically included via `extraResources` in electron-builder.

### Without Pre-Bundled Runtime

Just build and distribute normally:
```bash
pnpm build && pnpm dist
```

The runtime will be downloaded automatically on first launch (requires internet connection).

## Runtime Management

### Initialization Flow

1. Check for Docker Desktop (developer mode)
2. Check for system-installed containerd/nerdctl
3. Check for pre-bundled runtime (if included in distribution)
4. Download and install runtime (if not found)
5. Start containerd daemon
6. Ready to use

### User Data Location

The bundled runtime is installed to the user's application data directory, not the system. This means:
- No admin/root privileges required
- Clean uninstall (removed with app data)
- Per-user isolation

## Configuration

### Update Runtime Version

Edit `scripts/download-bundled-runtime.js`:

```javascript
const NERDCTL_VERSION = '1.7.2';  // Change this
```

And `src/main/services/bundled-runtime.ts`:

```typescript
private readonly DOWNLOAD_URLS = {
  darwin: {
    arm64: 'https://github.com/containerd/nerdctl/releases/download/v1.7.2/...'
    // Update URLs
  }
}
```

### Skip Bundled Runtime

To build without bundled runtime even if downloaded:

```bash
# Delete downloaded runtimes
rm -rf resources/bundled-runtime

# Build normally
pnpm dist
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Download Bundled Runtime
  run: pnpm download-runtime --current-platform

- name: Build and Package
  run: pnpm dist
```

### Multi-Platform Build

```yaml
strategy:
  matrix:
    os: [macos-latest, ubuntu-latest, windows-latest]

steps:
  - name: Download Runtime
    run: pnpm download-runtime --current-platform

  - name: Build
    run: pnpm dist
```

## Size Considerations

### Without Bundled Runtime
- Installer size: ~50-80MB
- First launch: Downloads ~50-100MB
- Total: ~100-180MB

### With Bundled Runtime
- Installer size: ~150-200MB
- First launch: Instant (no download)
- Total: ~150-200MB

## Troubleshooting

### Runtime Download Fails

The app will show an error message. User can:
1. Install Docker Desktop manually
2. Install nerdctl manually
3. Retry (app will attempt download again)

### Pre-Bundled Runtime Not Found

Check:
```bash
# Verify runtime exists
ls resources/bundled-runtime/*/bin/nerdctl

# Verify it's included in build
ls dist/mac/Kai\ Desktop.app/Contents/Resources/bundled-runtime/
```

### Permission Issues (macOS/Linux)

Binaries must be executable:
```bash
chmod +x resources/bundled-runtime/darwin-arm64/bin/*
```

This is handled automatically by the build script.

## Future Enhancements

- [ ] Auto-update bundled runtime
- [ ] Download progress UI in renderer
- [ ] Runtime version management
- [ ] Uninstall option in settings
- [ ] Platform-specific optimizations
