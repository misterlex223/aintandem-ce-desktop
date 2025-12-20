# Platform Support for AInTandem Desktop

## Runtime Modes by Platform

### macOS (Darwin)

**User Mode (Default)** ✅ SUPPORTED
- Uses Lima v1.2.1 (Linux VM with containerd + nerdctl)
- Bundled runtime, auto-downloads on first use (~200MB)
- No Docker Desktop required
- Recommended for all macOS users

**Development Mode (Optional)** ✅ SUPPORTED
- Uses Docker Desktop
- Full container management capabilities
- For developers who prefer Docker Desktop

**Rationale**: Lima provides a lightweight Linux VM with containerd + nerdctl, offering a bundled runtime experience without requiring Docker Desktop.

### Linux

**User Mode (Default)** ✅ SUPPORTED
- Bundled nerdctl 2.1.6 + containerd
- Auto-download on first use (~50-100MB)
- No admin privileges required
- Lightweight and fast
- Recommended for end users

**Development Mode (Optional)** ✅ SUPPORTED
- Uses Docker Desktop or Docker Engine
- Full container management capabilities
- For developers who prefer Docker

### Windows

**User Mode (Default)** ✅ SUPPORTED
- Bundled nerdctl 2.1.6 + containerd
- Auto-download on first use (~50-100MB)
- No admin privileges required
- Requires WSL2
- Recommended for end users

**Development Mode (Optional)** ✅ SUPPORTED
- Uses Docker Desktop
- Full container management capabilities
- For developers who prefer Docker

## Recommendations by Platform

### macOS Users
**Default (Recommended):**
1. Use User Mode (Lima runtime)
2. No Docker Desktop required
3. Bundled, lightweight solution

**Optional (Developers):**
1. Install Docker Desktop
2. Use Development Mode for advanced features

### Linux Users
**Default (Recommended):**
- Use User Mode (bundled containerd)
- No Docker installation required
- Lightweight and standalone

**Optional (Developers):**
- Install Docker Desktop/Engine for advanced features
- Use Development Mode for best tooling support

### Windows Users
**Default (Recommended):**
- Use User Mode (bundled containerd)
- Requires WSL2 to be enabled
- No Docker Desktop needed

**Optional (Developers):**
- Install Docker Desktop with WSL2
- Use Development Mode for best experience

## Bundled Runtime Availability

The bundled runtime is available for all platforms:
- ✅ macOS (Lima v1.2.1 - Linux VM with containerd + nerdctl)
- ✅ Linux (nerdctl 2.1.6 + containerd, AMD64/ARM64)
- ✅ Windows (nerdctl 2.1.6 + containerd, AMD64, requires WSL2)

## Runtime Priority Order

AInTandem Desktop prioritizes bundled runtimes over Docker Desktop:

1. **User Mode (Default)** - Bundled runtime (Lima on macOS, containerd on Linux/Windows)
2. **Development Mode (Optional)** - Docker Desktop (for developers)

Docker Desktop is no longer prioritized because the bundled runtime is the default choice for end users.

## Summary

| Platform | User Mode (Default) | Development Mode (Optional) |
|----------|---------------------|----------------------------|
| macOS    | ✅ Lima v1.2.1      | ✅ Docker Desktop          |
| Linux    | ✅ nerdctl 2.1.6    | ✅ Docker Engine           |
| Windows  | ✅ nerdctl 2.1.6    | ✅ Docker Desktop          |

**Note**: AInTandem Desktop automatically detects available runtimes and defaults to User Mode (bundled runtime). Development Mode is optional for developers who prefer Docker Desktop.
