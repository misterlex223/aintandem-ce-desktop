# AInTandem Desktop First-Time Launch Setup Process

## Overview

This document provides a comprehensive overview of the AInTandem Desktop application's first-time launch setup process. It covers all components involved in configuring the application for new users, from initial configuration storage to the final dashboard view.

## Setup Process Flow

The first-time launch process follows this sequence:

1. Application startup and configuration check
2. Runtime detection and selection
3. Configuration collection via Setup Wizard
4. Runtime download and setup (if needed)
5. Service initialization and startup
6. Transition to main dashboard

## Component Analysis

### 1. Configuration Store and Initialization

**Files:**
- `src/main/config/config-store.ts`
- `src/main/config/config.types.ts`

**Key Functions:**
- Manages persistent application settings using electron-store
- Tracks setup completion status via `setupCompleted` flag
- Stores user preferences including runtime choice and base directory
- Defines configuration schema with validation

**Configuration Structure:**
```typescript
interface KaiConfig {
  setupCompleted: boolean
  setupVersion: string
  preferredRuntime: 'auto' | 'docker' | 'containerd' | 'lima'
  baseDirectory: string
  services: {
    orchestrator: { port: number, nodeEnv: 'development' | 'production' }
    codeServer: { password: string, port: number }
  }
}
```

### 2. Container Runtime Detection and Setup

**Files:**
- `src/main/services/container-manager.ts`
- `src/main/services/docker-adapter.ts`
- `src/main/services/containerd-adapter.ts`
- `src/main/services/lima-adapter.ts`
- `src/main/services/lima-runtime.ts`

**Runtime Detection Priority:**
- On macOS: Lima (Linux VM with containerd + nerdctl) is preferred
- On Linux/Windows: Bundled containerd runtime
- Docker Desktop as fallback for development users

**Platform-Specific Logic:**
- macOS: Uses Lima VM to provide containerd support (since native containerd not available)
- Linux/Windows: Direct containerd/nerdctl integration
- All platforms: Auto-detection with manual override option

### 3. Service Definitions and Auto-Recovery

**Files:**
- `src/main/services/service-definitions.ts`
- `src/main/services/service-manager.ts`

**Service Definitions:**
- Backend: Core API server
- Code Server: VS Code web IDE

**Auto-Recovery Features:**
- Health monitoring for all services
- Automatic restart of failed essential services
- Maximum restart attempt limits
- Dependency-aware startup ordering

### 4. Bundled Runtime Download and Setup

**Files:**
- `scripts/download-bundled-runtime.js`
- `src/main/services/bundled-runtime.ts`
- `src/renderer/components/RuntimeSetupStep.tsx`

**Download Process:**
- On-demand download on first use (~200MB for macOS Lima, ~50-100MB for Linux/Windows containerd)
- Platform-specific binary management
- Installation to user data directory
- Progress reporting to UI

**Runtime Components:**
- macOS: Lima VM with containerd, nerdctl, runc, and CNI plugins
- Linux/Windows: containerd, nerdctl, runc, CNI plugins

### 5. Setup Wizard and UI Flow

**Files:**
- `src/renderer/App.tsx`
- `src/renderer/pages/SetupWizard.tsx`
- `src/renderer/components/RuntimeSetupStep.tsx`
- `src/renderer/components/RuntimeModeSelector.tsx`

**UI Flow:**
1. Check if setup is completed
2. If not, present Setup Wizard
3. Collect configuration settings (directories, passwords)
4. Select and set up runtime
5. Validate configuration
6. Save settings
7. Transition to dashboard

**Configuration Collection:**
- Base directory path (default: ~/AiTBase)
- Code-server password
- Cloud frontend URL (optional)

## First-Time Launch Experience

### Initial Application Start

When users first launch AInTandem Desktop:

1. The application checks if setup has been completed by examining the configuration store
2. If `setupCompleted` is false, the Setup Wizard is displayed
3. If `setupCompleted` is true, the main dashboard is shown

### Runtime Selection

The application attempts to auto-detect available container runtimes:

- On macOS: Prioritizes Lima VM (for user mode) or Docker Desktop (for development mode)
- On Linux/Windows: Prioritizes bundled containerd or Docker

Users can manually select their preferred runtime through the Runtime Mode Selector.

### Configuration Collection

The Setup Wizard collects:

- Base directory for project storage (with intelligent defaults)
- Service passwords for code-server
- Validation of user inputs before proceeding

### Runtime Setup

Depending on the selected runtime:

- If using bundled runtime, downloads and extracts appropriate binaries
- Initializes the container runtime environment
- Provides real-time progress feedback to the user

### Service Initialization

After successful setup:

- Creates necessary Docker networks and volumes
- Starts essential services in dependency order
- Begins health monitoring
- Enables auto-recovery for services

## Best Practices and Recommendations

### For End Users
- Use User Mode with bundled runtime (default) for easiest setup
- Allow the application's first-time setup process to complete without interruption
- Use the recommended base directory unless you have specific requirements

### For Developers
- Development Mode with Docker Desktop provides the most features
- Ensure Docker Desktop is running before starting AInTandem Desktop in development mode
- Consider the larger download size when using bundled runtime

## Troubleshooting Common Issues

### Runtime Download Fails
- Ensure internet connection is available during first launch
- Check firewall settings that might block downloads
- Verify user has write permissions to application data directory

### Setup Configuration Validation
- Verify directory paths are accessible and writable
- Ensure passwords meet any complexity requirements
- Confirm ports are not in use by other applications

### Service Startup Issues
- Check if required ports are already in use
- Verify container runtime has sufficient resources
- Review service logs for specific error details