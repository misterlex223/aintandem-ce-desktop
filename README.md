# AInTandem Desktop

A desktop application for managing Docker containers and AInTandem services with a clean, modern interface.

## Features

- **Service Management**: Start, stop, and monitor AInTandem services (Backend)
- **Container Management**: Full Docker/containerd container lifecycle management
- **Health Monitoring**: Real-time service health tracking with dependency visualization
- **Auto-Recovery**: Automatic restart of essential services on failure
- **Log Viewer**: Real-time log streaming with search, filtering, and download capabilities
- **System Tray**: Quick access to services and status from the menu bar
- **Multiple Runtimes**: Support for both Docker and containerd

## Installation

### Prerequisites

**Choose ONE of the following container runtimes:**

- **Docker Desktop** (Recommended for most users)
  - macOS: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Verify: `docker --version`

- **Containerd** (Advanced users, bundled with app)
  - Bundled binaries included
  - Automatic runtime detection
  - No additional installation required

### Installing AInTandem Desktop

1. Download the latest release for your platform
2. Install the application:
   - **macOS**: Open the `.dmg` file and drag to Applications
   - **Windows**: Run the `.exe` installer
   - **Linux**: Install the `.AppImage` or `.deb` package

3. Launch AInTandem Desktop from your Applications folder or Start menu

## Getting Started

### First Launch

On first launch, AInTandem will:

1. **Detect your container runtime** (Docker or containerd)
2. **Initialize required infrastructure**:
   - Create `aintandem-net` network
   - Create required volumes (aintandem-data)
3. **Load bundled images** (if using containerd)
4. **Start health monitoring** for essential services

### Runtime Configuration

AInTandem automatically detects and uses available container runtimes:

- **Docker**: If Docker Desktop is running, it will be used by default
- **Containerd**: Falls back to bundled containerd if Docker is not available
- **Manual Selection**: Configure runtime in Settings (⚙️ button)

## Using AInTandem

### Main Dashboard

The dashboard has three main tabs:

#### 1. Services Tab

Manage Kai services with high-level controls:

- **View Service Status**: Running, Stopped, Starting, Error states
- **Start/Stop Services**: Individual or bulk operations
- **Monitor Resources**: Real-time CPU and memory usage
- **View Logs**: Click "View Logs" to see container output
- **Essential Services**: Marked with orange "Essential" badge

**Quick Actions:**
- `Start All` - Start all services in dependency order
- `Stop All` - Stop all running services

**Service Cards Show:**
- Service name and description
- Current status with color coding
- Health check status (✓ healthy, ✗ unhealthy, ⟳ starting)
- Resource usage (CPU %, Memory MB)
- Container ID (first 12 characters)

#### 2. Health Dashboard

Visualize service health and dependencies:

- **Overview Stats**: Total services, running count, stopped count, errors
- **Dependency Graph**: Visual representation of service dependencies
  - Color-coded by status (green=running, gray=stopped, red=error)
  - Shows which services depend on others
- **Health Status Table**: Detailed view of all services
  - Status badges
  - Health indicators
  - Essential/Optional classification
  - Dependency counts

#### 3. Containers Tab

Low-level container management:

- **List All Containers**: View all containers (running and stopped)
- **Container Details**: Image, ID, state
- **Container Actions**:
  - Start/Restart stopped containers
  - Stop running containers
  - Remove containers (with confirmation)

### Log Viewer

Access detailed container logs:

1. Go to Services tab
2. Click "View Logs" on a running service
3. Log viewer features:
   - **Real-time streaming**: Auto-refreshes every 2 seconds
   - **Search**: Filter logs by keyword
   - **Line limits**: 100, 500, 1000, or All lines
   - **Timestamps**: Toggle timestamp display
   - **Actions**:
     - Refresh logs manually
     - Download logs to file
     - Copy logs to clipboard

### System Tray

Quick access from your menu bar:

1. **AInTandem icon** appears in system tray when app is running
2. **Right-click** (or click) to open menu:
   - Service status indicators
   - Quick Start/Stop actions
   - Show/Hide main window
   - Quit application

**Tray Icon Indicators:**
- Updates every 30 seconds
- Shows count of running/total services
- Click to toggle window visibility

### Settings

Configure application settings:

1. Click ⚙️ Settings button in top-right
2. Configure:
   - Container runtime (Docker/containerd)
   - Auto-start services on launch
   - Health monitoring intervals
   - Notification preferences

## Service Architecture

### Essential Services

These services are critical and will auto-restart on failure:

- **AInTandem Backend**: Core API server (port 9900)
  - REST API for all operations
  - Container orchestration
  - Service management


### Service Dependencies

```
No service dependencies
```

Services start in dependency order automatically.

## Auto-Recovery System

AInTandem Desktop includes intelligent auto-restart capabilities:

### How It Works

1. **Health Monitoring**: Checks essential services every 15 seconds
2. **Failure Detection**: Detects stopped or error states
3. **Auto-Restart**: Attempts to restart failed services
4. **Retry Logic**:
   - Maximum 3 restart attempts per service
   - Resets counter on successful start
   - Logs warnings after max attempts reached

### What Gets Auto-Restarted

- ✅ Essential services (Backend)
- ❌ Optional services (manual restart required)
- ❌ User-stopped services (respects manual actions)

### Monitoring Auto-Restart

Check Console logs for auto-restart activity:
```
Auto-restarting essential service: Kai Backend (attempt 1/3)
```

## Performance Optimization

AInTandem is optimized for minimal resource usage:

- **Polling Intervals**: 10-second refresh rate (reduced from 5s)
- **Health Monitoring**: 15-second checks (essential services only)
- **Tray Updates**: 30-second menu refresh
- **Log Streaming**: 2-second refresh (only when log viewer is open)

## Troubleshooting

### Services Won't Start

**Problem**: Service shows "Error" status

**Solutions**:
1. Check logs for error details (View Logs button)
2. Verify container runtime is running:
   - Docker: Check Docker Desktop is running
   - Containerd: Check system permissions
3. Restart service manually
4. Check port conflicts (9900, 6333, 7474, 7687)
5. Verify network and volumes exist

### Container Runtime Issues

**Problem**: "No container runtime available"

**Solutions**:
1. **If using Docker**:
   - Start Docker Desktop
   - Verify with `docker ps`
   - Restart AInTandem
2. **If using containerd**:
   - Check bundled binaries in app resources
   - Verify system permissions
   - Run as administrator (Windows) or with sudo (Linux)

### Auto-Restart Not Working

**Problem**: Essential services stay stopped

**Possible Causes**:
1. Max restart attempts reached (3 attempts)
2. Auto-restart disabled in Settings
3. Dependency service is down
4. Persistent error condition

**Solutions**:
1. Check health monitoring is enabled (Settings)
2. View logs to identify root cause
3. Manually fix underlying issue
4. Restart service manually to reset attempt counter

### High CPU/Memory Usage

**Problem**: Application using too many resources

**Solutions**:
1. Close log viewer when not needed
2. Reduce number of running services
3. Check for runaway containers
4. Restart application to clear state

### Log Viewer Not Updating

**Problem**: Logs are frozen or outdated

**Solutions**:
1. Click Refresh button manually
2. Close and reopen log viewer
3. Check service is actually running
4. Verify container is producing logs

## Building from Source

### Development Setup

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Package application
pnpm package
```

### Project Structure

```
kai-desktop/
├── src/
│   ├── main/           # Electron main process
│   │   ├── services/   # Container runtime, service manager
│   │   └── index.ts    # Main entry point
│   └── renderer/       # React UI
│       ├── pages/      # Main pages
│       └── components/ # Reusable components
├── resources/          # Bundled images, binaries
├── scripts/            # Build scripts
└── package.json        # Dependencies and scripts
```

### Key Technologies

- **Electron**: Desktop application framework
- **React**: UI framework
- **Vite**: Build tool and dev server
- **TypeScript**: Type-safe JavaScript
- **Docker API**: Container management
- **Nerdctl**: Containerd CLI wrapper

## Advanced Usage

### Custom Container Runtime Path

Configure runtime binary paths in Settings:

- **Docker**: `/usr/local/bin/docker`
- **Containerd**: Bundled in app resources
- **Custom**: Point to your own installation

### Debug Mode

Enable debug logging:

1. Open Settings
2. Enable "Debug Mode"
3. Check console output for detailed logs
4. Log file location: `~/Library/Logs/aintandem/` (macOS)

### Network Configuration

AInTandem services use the `aintandem-net` Docker network:

- **Driver**: Bridge
- **Attachable**: Yes
- **Subnet**: Auto-assigned by Docker
- **Services**: Backend

### Volume Management

Persistent data stored in Docker volumes:

- `aintandem-data`: Backend data storage

**Backup volumes**:
```bash
docker run --rm -v aintandem-data:/data -v $(pwd):/backup alpine tar czf /backup/aintandem-data-backup.tar.gz /data
```

## Support

- **Documentation**: See `docs/` directory
- **Issues**: Report bugs on GitHub
- **Logs**: Check application logs for troubleshooting
- **Community**: Join our discussion forums

## License

See LICENSE file for details.

## Version History

- **v1.0.0**: Initial release with Docker support
- **v1.1.0**: Added containerd support and runtime detection
- **v1.2.0**: Advanced features (log viewer, system tray, health dashboard)
- **v1.3.0**: Auto-recovery and performance optimization
