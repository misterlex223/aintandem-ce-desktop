# Lima Integration for macOS Container Runtime

## Overview

Lima (Linux virtual machines) provides native containerd/nerdctl support on macOS, making it the perfect solution for AInTandem Desktop's "User Mode" on macOS.

## Why Lima?

✅ **Advantages:**
- Native containerd + nerdctl support
- Lightweight compared to Docker Desktop
- Automatic file sharing between macOS and VM
- Port forwarding (access containers from macOS)
- Free and open source
- Official recommendation by nerdctl project
- CNCF Incubating project (v1.0 released 2024)

❌ **Disadvantages:**
- Requires downloading ~200MB VM image on first use
- Slightly more complex than native binaries
- VM overhead (though minimal)

## Implementation Strategy

### Phase 1: Lima Manager Service

Create `src/main/services/lima-runtime.ts`:

```typescript
export class LimaRuntimeManager {
  // Download and install Lima binary
  async install(): Promise<void>

  // Start Lima VM with containerd
  async start(): Promise<void>

  // Stop Lima VM
  async stop(): Promise<void>

  // Check if Lima is running
  async isRunning(): Promise<boolean>

  // Get nerdctl path (lima nerdctl wrapper)
  getNerdctlPath(): string

  // Execute nerdctl command via lima
  async execNerdctl(args: string[]): Promise<string>
}
```

### Phase 2: Download Script

Update `scripts/download-bundled-runtime.js`:

```javascript
const LIMA_VERSION = '1.2.1';

const LIMA_URLS = {
  'darwin-arm64': `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-arm64.tar.gz`,
  'darwin-x64': `https://github.com/lima-vm/lima/releases/download/v${LIMA_VERSION}/lima-${LIMA_VERSION}-Darwin-x86_64.tar.gz`
};
```

### Phase 3: Container Adapter

Create `src/main/adapters/lima-adapter.ts`:

```typescript
export class LimaContainerAdapter implements ContainerRuntimeAdapter {
  // Implement all ContainerRuntimeAdapter methods
  // Use 'lima nerdctl' prefix for all commands

  async listContainers(options?: ListOptions): Promise<ContainerInfo[]> {
    const output = await this.limaManager.execNerdctl(['ps', '-a', '--format', 'json'])
    return JSON.parse(output)
  }

  async startContainer(config: ContainerConfig): Promise<string> {
    const args = ['run', '-d', '--name', config.name, ...]
    return await this.limaManager.execNerdctl(args)
  }

  // ... other methods
}
```

### Phase 4: Runtime Detection

Update `src/main/services/container-manager.ts`:

```typescript
async detectAvailableRuntimes() {
  const runtimes = {
    docker: await this.checkDockerAvailable(),
    containerd: await this.checkContainerdAvailable(),
    lima: process.platform === 'darwin' ? await this.checkLimaAvailable() : false,
    current: 'none'
  }

  if (config.preferredRuntime === 'auto') {
    if (runtimes.docker) {
      this.currentAdapter = new DockerAdapter()
      runtimes.current = 'docker'
    } else if (runtimes.lima) {
      this.currentAdapter = new LimaAdapter()
      runtimes.current = 'lima'
    }
  }

  return runtimes
}
```

## Installation Flow (macOS)

### Option 1: Pre-bundled Lima (Recommended)

1. **Build Time:**
   ```bash
   pnpm download-runtime --current-platform
   # Downloads Lima binary to resources/bundled-runtime/darwin-arm64/
   ```

2. **First Launch:**
   - Extract Lima to `~/Library/Application Support/kai-desktop/lima/`
   - Run `limactl start default --tty=false`
   - Lima downloads Ubuntu VM image (~200MB)
   - VM starts with containerd ready

3. **Subsequent Launches:**
   - Check if Lima VM is running
   - Start if stopped: `limactl start default`
   - Ready to use

### Option 2: Auto-download Lima

1. **First Launch:**
   - Detect macOS, no Docker Desktop
   - Download Lima binary from GitHub
   - Extract and install
   - Start Lima VM
   - Show progress to user

2. **Subsequent Launches:**
   - Same as Option 1

## File Structure

```
~/Library/Application Support/kai-desktop/
├── lima/
│   ├── bin/
│   │   ├── limactl          # Lima control binary
│   │   └── lima             # Wrapper for commands
│   ├── vms/
│   │   └── default/         # Default VM instance
│   │       ├── lima.yaml    # VM configuration
│   │       ├── diffdisk     # VM disk
│   │       └── serial.log   # VM logs
│   └── cache/
│       └── download/        # Downloaded VM images
└── config.json
```

## Lima Configuration

Create a custom Lima YAML template optimized for containers:

```yaml
# lima-containerd.yaml
images:
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
    arch: "x86_64"
  - location: "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
    arch: "aarch64"

cpus: 4
memory: "4GiB"
disk: "100GiB"

# Mount macOS home directory
mounts:
  - location: "~"
    writable: true

# Port forwarding (automatic)
portForwards:
  - guestSocket: "/run/containerd/containerd.sock"
    hostSocket: "{{.Dir}}/sock/containerd.sock"

# Provision with containerd and nerdctl
provision:
  - mode: system
    script: |
      #!/bin/bash
      set -eux -o pipefail
      # Install containerd and nerdctl (already included in Lima templates)

# Use containerd as runtime
containerd:
  system: true
  user: false
```

## CLI Commands

```bash
# Install Lima (bundled or download)
await limaManager.install()

# Start VM
await limaManager.start()

# Run nerdctl commands
await limaManager.execNerdctl(['ps', '-a'])
await limaManager.execNerdctl(['run', '-d', 'nginx'])

# Stop VM
await limaManager.stop()

# Access containerd socket
const sock = `${limaDir}/vms/default/sock/containerd.sock`
```

## User Experience

### First Launch (macOS, no Docker)

```
┌─────────────────────────────────────────┐
│  Setting up Container Runtime           │
│                                          │
│  📥 Downloading Lima VM manager...       │
│  Progress: 45% (90MB / 200MB)           │
│                                          │
│  This may take a few minutes...         │
└─────────────────────────────────────────┘
```

### Runtime Mode Selector (macOS)

```
┌─────────────────────────────────────────┐
│  Choose Container Runtime Mode           │
│                                          │
│  ○ Development Mode                      │
│    Uses Docker Desktop                   │
│    ✓ Full Docker compatibility           │
│    ✗ Not installed                       │
│                                          │
│  ● User Mode (Recommended)               │
│    Uses Lima + containerd                │
│    ✓ Lightweight and fast                │
│    ✓ No external dependencies            │
│    ⚠ Downloads ~200MB on first use       │
│                                          │
│  [ Continue ]                            │
└─────────────────────────────────────────┘
```

## Implementation Checklist

- [ ] Create `LimaRuntimeManager` service
- [ ] Update download script for Lima binaries
- [ ] Create `LimaContainerAdapter`
- [ ] Update runtime detection logic
- [ ] Create Lima configuration template
- [ ] Add Lima to RuntimeModeSelector UI
- [ ] Update documentation
- [ ] Test on macOS (Intel and Apple Silicon)
- [ ] Handle VM lifecycle (auto-start on app start)
- [ ] Add VM resource configuration (CPU, memory)

## Platform Support Matrix (Updated)

| Platform | Development Mode | User Mode       |
|----------|------------------|-----------------|
| macOS    | ✅ Docker Desktop | ✅ Lima v1.2.1  |
| Linux    | ✅ Docker Engine  | ✅ nerdctl 2.1.6|
| Windows  | ✅ Docker Desktop | ✅ nerdctl 2.1.6|

## References

- [Lima GitHub](https://github.com/lima-vm/lima)
- [Lima Documentation](https://lima-vm.io/)
- [Lima + nerdctl Guide](https://gist.github.com/toricls/d3dd0bec7d4c6ddbcf2d25f211e8cd7b)
- [CNCF Lima Project](https://www.cncf.io/projects/lima/)

## Next Steps

1. Implement `LimaRuntimeManager`
2. Update download script
3. Create adapter
4. Test on macOS
5. Update UI
