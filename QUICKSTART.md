# Kai Desktop - Quick Start Guide

## Prerequisites

1. **Node.js 18+** and **pnpm 10.15.1**
   ```bash
   node --version  # Should be v18 or higher
   pnpm --version  # Should be 10.15.1
   ```

2. **Docker Desktop** (for testing the app)
   - Download from https://www.docker.com/products/docker-desktop
   - Make sure Docker is running before starting the app

## Installation

```bash
# Navigate to kai-desktop directory
cd kai-desktop

# Install dependencies
pnpm install
```

## Development

```bash
# Start the app in development mode
pnpm dev
```

This will:
- Start the Electron app with hot reload
- Open DevTools automatically
- Connect to Docker Desktop on your machine

## First Launch Experience

1. **Welcome Screen**
   - Shows detected runtime (Docker Desktop)
   - Click "Next" to continue

2. **Base Directory Setup**
   - Enter where you want Kai to store projects
   - Example: `/Users/yourname/KaiBase`
   - Click "Next"

3. **Security Configuration**
   - Set Neo4j password
   - Set Code Server password
   - Click "Next"

4. **Cloud Frontend URL**
   - Enter your cloud-deployed frontend URL
   - Example: `https://kai-frontend.example.com`
   - Click "Finish"

5. **Dashboard**
   - See all Docker containers on your system
   - Status badges show running/stopped state

## Testing Container Operations

Open the DevTools console (automatically opened in dev mode) and try:

```javascript
// List all containers
await window.kai.container.list()

// Get system info
await window.kai.runtime.getSystemInfo()

// List images
await window.kai.image.list()

// Pull an image (with progress)
const unsubscribe = window.kai.image.onPullProgress((data) => {
  console.log(`Pulling ${data.name}:`, data.progress)
})
await window.kai.image.pull('nginx:alpine')
unsubscribe()

// Create and start a test container
const containerId = await window.kai.container.start({
  name: 'test-nginx',
  image: 'nginx:alpine',
  ports: { '80': '8080' }
})

// Inspect the container
await window.kai.container.inspect(containerId)

// Stop the container
await window.kai.container.stop(containerId)

// Remove the container
await window.kai.container.remove(containerId)
```

## Building for Production

```bash
# Build the app
pnpm build

# Create distributable for your platform
pnpm dist

# Or build for specific platforms
pnpm dist:mac     # macOS DMG
pnpm dist:win     # Windows NSIS installer
pnpm dist:linux   # Linux AppImage
```

Build artifacts will be in the `release/` directory.

## Project Structure

```
kai-desktop/
├── src/
│   ├── main/              # Electron main process (Node.js)
│   │   ├── index.ts       # App entry point, IPC handlers
│   │   └── services/      # Container runtime services
│   ├── preload/           # IPC bridge (secure context)
│   │   └── index.ts       # Exposes window.kai API
│   └── renderer/          # UI (React)
│       ├── App.tsx        # Main app component
│       └── pages/         # UI pages
└── package.json           # Scripts and dependencies
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Preview production build
- `pnpm pack` - Create unpacked build
- `pnpm dist` - Create distributable packages
- `pnpm dist:mac` - Build for macOS
- `pnpm dist:win` - Build for Windows
- `pnpm dist:linux` - Build for Linux

## Troubleshooting

### "No container runtime available" error

**Cause**: Docker Desktop is not running or not installed

**Solution**:
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Start Docker Desktop
3. Wait for it to fully start (green icon in system tray)
4. Restart Kai Desktop

### Build fails with "electron not found"

**Cause**: Dependencies not installed properly

**Solution**:
```bash
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### TypeScript errors in IDE

**Cause**: IDE not picking up TypeScript configuration

**Solution**:
1. Restart your IDE
2. Make sure TypeScript language server is running
3. Check that `tsconfig.json` is in the project root

## What's Implemented (Phase 1)

✅ Electron + TypeScript + Vite + React setup
✅ Docker Desktop integration (dockerode)
✅ Complete container runtime interface
✅ IPC bridge with type-safe API
✅ Setup wizard UI (4 steps)
✅ Basic dashboard with container list
✅ Multi-platform build configuration

## What's Coming Next (Phase 2)

⏳ Persistent configuration storage
⏳ Advanced settings panel
⏳ Config validation
⏳ "Reset to Defaults" functionality

See `README.md` for the complete roadmap.

## Need Help?

- Check `README.md` for detailed documentation
- See `../docs/electron-app-migration-plan.md` for the complete plan
- See `../docs/electron-app-implementation-status.md` for current status
