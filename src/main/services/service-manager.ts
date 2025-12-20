import { BrowserWindow, ipcMain } from 'electron'
import { IContainerRuntime, ContainerInfo } from './container-runtime.interface'
import { getConfigStoreSync } from '../config/config-store'
import { getServiceDefinitions, getRequiredVolumes, getRequiredNetwork, ServiceDefinition } from './service-definitions'

/**
 * Service status
 */
export interface ServiceStatus {
  name: string
  displayName: string
  description: string
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown'
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'
  containerId?: string
  error?: string
  essential: boolean
}

/**
 * Service event for UI communication
 */
export interface ServiceEvent {
  serviceName: string
  eventType: string
  data: any
}

/**
 * Service Manager - Orchestrates Kai services
 */
export class ServiceManager {
  private runtime: IContainerRuntime
  private services: Record<string, ServiceDefinition>
  private autoRestartEnabled: boolean = true
  private restartAttempts: Map<string, number> = new Map()
  private maxRestartAttempts: number = 3
  private healthCheckInterval: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private registeredWindows: Set<BrowserWindow> = new Set()

  constructor(runtime: IContainerRuntime) {
    this.runtime = runtime
    this.services = getServiceDefinitions()
  }

  /**
   * Set the main window reference to emit events to UI
   */
  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  /**
   * Register a window to receive service events
   */
  registerWindow(window: BrowserWindow): void {
    this.registeredWindows.add(window)
  }

  /**
   * Unregister a window from receiving service events
   */
  unregisterWindow(window: BrowserWindow): void {
    this.registeredWindows.delete(window)
  }

  /**
   * Emit service events to be forwarded to the UI
   */
  private emitServiceEvent(serviceName: string, eventType: string, data: any): void {
    // Send to main window if available
    if (this.mainWindow) {
      this.mainWindow.webContents.send('service-event', {
        serviceName,
        eventType,
        data
      })
    }

    // Send to all registered windows
    for (const window of this.registeredWindows) {
      if (!window.isDestroyed()) {
        window.webContents.send('service-event', {
          serviceName,
          eventType,
          data
        })
      }
    }
  }

  /**
   * Emit the current list of services to the UI
   */
  private emitServicesUpdate(): void {
    // Send to main window if available
    if (this.mainWindow) {
      this.mainWindow.webContents.send('services-updated', this.getServicesStatus())
    }

    // Send to all registered windows
    for (const window of this.registeredWindows) {
      if (!window.isDestroyed()) {
        window.webContents.send('services-updated', this.getServicesStatus())
      }
    }
  }

  /**
   * Request permission from user to download an image
   */
  private async requestImageDownloadPermission(imageName: string, serviceName: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Emit an event to ask the UI for permission
      const requestId = `${serviceName}-${Date.now()}`

      // Listen for the user's response
      const listener = (event: import('electron').IpcMainEvent, responseId: string, allowed: boolean) => {
        if (responseId === requestId) {
          ipcMain.removeListener('image-download-permission-response', listener)
          resolve(allowed)
        }
      }

      ipcMain.on('image-download-permission-response', listener)

      // Emit the permission request to the UI
      // Send to main window if available
      if (this.mainWindow) {
        this.mainWindow.webContents.send('image-download-permission-request', {
          id: requestId,
          serviceName,
          imageName,
          size: 'unknown' // In a real implementation, we might want to fetch the actual image size
        })
      }

      // Send to all registered windows
      for (const window of this.registeredWindows) {
        if (!window.isDestroyed()) {
          window.webContents.send('image-download-permission-request', {
            id: requestId,
            serviceName,
            imageName,
            size: 'unknown'
          })
        }
      }

      // Set a timeout to resolve with false if no response is received within 30 seconds
      setTimeout(() => {
        ipcMain.removeListener('image-download-permission-response', listener)
        console.log(`Timeout waiting for permission to download ${imageName}`)
        resolve(false)
      }, 30000) // 30 second timeout
    })
  }

  /**
   * Initialize infrastructure (network, volumes)
   */
  async initialize(): Promise<void> {
    const _config = getConfigStoreSync().getConfig()

    // Create network if it doesn't exist
    const networks = await this.runtime.listNetworks()
    const networkExists = networks.some(n => n.name === getRequiredNetwork())

    if (!networkExists) {
      console.log(`Creating network: ${getRequiredNetwork()}`)
      await this.runtime.createNetwork(getRequiredNetwork(), {
        driver: 'bridge',
        attachable: true
      })
    }

    // Create volumes if they don't exist
    const volumes = await this.runtime.listVolumes()
    const existingVolumeNames = volumes.map(v => v.name)

    for (const volumeName of getRequiredVolumes()) {
      if (!existingVolumeNames.includes(volumeName)) {
        console.log(`Creating volume: ${volumeName}`)
        await this.runtime.createVolume(volumeName)
      }
    }

    console.log('Service infrastructure initialized')
  }

  /**
   * Get status of all services
   */
  async getServicesStatus(): Promise<ServiceStatus[]> {
    const statuses: ServiceStatus[] = []

    for (const [_key, service] of Object.entries(this.services)) {
      try {
        const containers = await this.runtime.listContainers({
          all: true,
          filters: { name: [service.containerConfig(getConfigStoreSync().getConfig()).name] }
        })

        if (containers.length > 0) {
          const container = containers[0]
          statuses.push({
            name: service.name,
            displayName: service.displayName,
            description: service.description,
            status: this.mapContainerState(container.state),
            health: container.health,
            containerId: container.id,
            essential: service.essential || false
          })
        } else {
          statuses.push({
            name: service.name,
            displayName: service.displayName,
            description: service.description,
            status: 'stopped',
            essential: service.essential || false
          })
        }
      } catch (error) {
        statuses.push({
          name: service.name,
          displayName: service.displayName,
          description: service.description,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          essential: service.essential || false
        })
      }
    }

    return statuses
  }

  /**
   * Start a specific service
   */
  async startService(serviceName: string): Promise<void> {
    const service = this.services[serviceName]
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }

    const config = getConfigStoreSync().getConfig()

    // Start dependencies first
    if (service.dependsOn) {
      for (const dep of service.dependsOn) {
        const depStatus = await this.getServiceStatus(dep)
        if (depStatus.status !== 'running') {
          console.log(`Starting dependency: ${dep}`)
          await this.startService(dep)
        }
      }
    }

    // Check if already running
    const status = await this.getServiceStatus(serviceName)
    if (status.status === 'running') {
      console.log(`Service already running: ${serviceName}`)
      return
    }

    // Remove existing container if stopped
    if (status.containerId) {
      console.log(`Removing existing container: ${serviceName}`)
      await this.runtime.removeContainer(status.containerId, true)
    }

    // Get container configuration
    const containerConfig = service.containerConfig(config)

    // Check if image exists, and pull if not
    const imageExists = await this.runtime.imageExists(containerConfig.image)
    if (!imageExists) {
      console.log(`Image ${containerConfig.image} not found, pulling...`)

      // Request permission to download the image
      const allowed = await this.requestImageDownloadPermission(containerConfig.image, serviceName)
      if (!allowed) {
        throw new Error(`User declined permission to download image ${containerConfig.image}`)
      }

      // Notify about image pulling start
      this.emitServiceEvent(serviceName, 'image-pulling', {
        message: `Pulling image ${containerConfig.image}`,
        image: containerConfig.image,
        progress: 0
      })

      try {
        await this.runtime.pullImage(containerConfig.image, (progress) => {
          console.log(`[Image Pull] ${containerConfig.image}: ${progress.status} (${progress.progress}%)`)

          // Forward pulling progress to UI
          this.emitServiceEvent(serviceName, 'image-pulling-progress', {
            message: `Pulling image ${containerConfig.image}: ${progress.status}`,
            image: containerConfig.image,
            progress: progress.progress,
            status: progress.status,
            current: progress.current,
            total: progress.total
          })
        })

        console.log(`✓ Image ${containerConfig.image} pulled successfully`)
        this.emitServiceEvent(serviceName, 'image-pulled', {
          message: `Image ${containerConfig.image} pulled successfully`,
          image: containerConfig.image
        })
      } catch (error) {
        console.error(`Failed to pull image ${containerConfig.image}:`, error)
        this.emitServiceEvent(serviceName, 'image-pull-error', {
          message: `Failed to pull image ${containerConfig.image}: ${error}`,
          image: containerConfig.image,
          error: error instanceof Error ? error.message : String(error)
        })
        throw new Error(`Failed to pull required image ${containerConfig.image}: ${error}`)
      }
    }

    // Start new container
    console.log(`Starting service: ${serviceName}`)
    await this.runtime.startContainer(containerConfig)

    // Wait for health check if applicable
    if (containerConfig.healthcheck) {
      await this.waitForHealthy(serviceName, 60000) // 60 second timeout
    }
  }

  /**
   * Stop a specific service
   */
  async stopService(serviceName: string): Promise<void> {
    const status = await this.getServiceStatus(serviceName)

    if (!status.containerId) {
      console.log(`Service not running: ${serviceName}`)
      return
    }

    console.log(`Stopping service: ${serviceName}`)
    await this.runtime.stopContainer(status.containerId, 10)
  }

  /**
   * Restart a specific service
   */
  async restartService(serviceName: string): Promise<void> {
    await this.stopService(serviceName)
    await this.startService(serviceName)
  }

  /**
   * Start all services
   */
  async startAll(): Promise<void> {
    // Start in dependency order
    const startOrder = this.getStartOrder()

    for (const serviceName of startOrder) {
      try {
        await this.startService(serviceName)
      } catch (error) {
        console.error(`Failed to start ${serviceName}:`, error)
        throw error
      }
    }
  }

  /**
   * Check if the flexy-sandbox image is available and download if needed
   */
  async checkAndDownloadFlexySandboxImage(): Promise<void> {
    const imageName = 'ghcr.io/misterlex223/flexy-sandbox:latest';

    console.log(`Checking for image: ${imageName}`);

    // Check if the image already exists
    const imageExists = await this.runtime.imageExists(imageName);

    if (!imageExists) {
      console.log(`Image ${imageName} not found, requesting permission to download...`);

      // Request permission to download the image
      const allowed = await this.requestImageDownloadPermission(imageName, 'flexy-sandbox');
      if (!allowed) {
        console.log(`User declined permission to download image ${imageName}`);
        return;
      }

      // Notify about image pulling start
      this.emitServiceEvent('flexy-sandbox', 'image-pulling', {
        message: `Pulling image ${imageName}`,
        image: imageName,
        progress: 0
      });

      try {
        // Track different phases of the pull process
        const pullProgress = {
          downloading: { progress: 0, status: 'Waiting' },
          verifying: { progress: 0, status: 'Waiting' },
          extracting: { progress: 0, status: 'Waiting' }
        };

        await this.runtime.pullImage(imageName, (progress) => {
          console.log(`[Image Pull] ${imageName}: ${progress.status} (${progress.progress || 'N/A'}%)`);

          // Determine the phase based on the progress status
          let phase = 'downloading';
          if (progress.status && typeof progress.status === 'string') {
            if (progress.status.toLowerCase().includes('verifying')) {
              phase = 'verifying';
            } else if (progress.status.toLowerCase().includes('extracting')) {
              phase = 'extracting';
            } else if (progress.status.toLowerCase().includes('download') ||
                      progress.status.toLowerCase().includes('pulling')) {
              phase = 'downloading';
            }
          }

          // Update progress for the specific phase
          if (progress.progress !== undefined) {
            pullProgress[phase as keyof typeof pullProgress].progress = progress.progress;
          }
          pullProgress[phase as keyof typeof pullProgress].status = progress.status;

          // Forward pulling progress to UI with phase information
          this.emitServiceEvent('flexy-sandbox', 'image-pulling-progress', {
            message: `Pulling image ${imageName}: ${progress.status}`,
            image: imageName,
            progress: progress.progress,
            status: progress.status,
            current: progress.current,
            total: progress.total,
            phase: phase,
            allPhases: pullProgress
          });
        });

        console.log(`✓ Image ${imageName} pulled successfully`);
        this.emitServiceEvent('flexy-sandbox', 'image-pulled', {
          message: `Image ${imageName} pulled successfully`,
          image: imageName
        });
      } catch (error) {
        console.error(`Failed to pull image ${imageName}:`, error);
        this.emitServiceEvent('flexy-sandbox', 'image-pull-error', {
          message: `Failed to pull image ${imageName}: ${error}`,
          image: imageName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      console.log(`Image ${imageName} already exists`);
    }
  }

  /**
   * Stop all services
   */
  async stopAll(): Promise<void> {
    const statuses = await this.getServicesStatus()

    // Stop in reverse order
    const runningServices = statuses
      .filter(s => s.status === 'running' && s.containerId)
      .reverse()

    for (const service of runningServices) {
      try {
        await this.stopService(service.name)
      } catch (error) {
        console.error(`Failed to stop ${service.name}:`, error)
      }
    }
  }

  /**
   * Get status of a single service
   */
  async getServiceStatus(serviceName: string): Promise<ServiceStatus> {
    const service = this.services[serviceName]
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }

    try {
      const containers = await this.runtime.listContainers({
        all: true,
        filters: { name: [service.containerConfig(getConfigStoreSync().getConfig()).name] }
      })

      if (containers.length > 0) {
        const container = containers[0]
        return {
          name: service.name,
          displayName: service.displayName,
          description: service.description,
          status: this.mapContainerState(container.state),
          health: container.health,
          containerId: container.id,
          essential: service.essential || false
        }
      }

      return {
        name: service.name,
        displayName: service.displayName,
        description: service.description,
        status: 'stopped',
        essential: service.essential || false
      }
    } catch (error) {
      return {
        name: service.name,
        displayName: service.displayName,
        description: service.description,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        essential: service.essential || false
      }
    }
  }

  /**
   * Check if all essential services are running
   */
  async areAllEssentialServicesRunning(): Promise<boolean> {
    try {
      const services = await this.getServicesStatus();

      // Check if all essential services are running
      const allEssentialRunning = services.every(
        (service) => !service.essential || service.status === 'running'
      );

      return allEssentialRunning;
    } catch (error) {
      console.error('Error checking essential services status:', error);
      return false;
    }
  }

  /**
   * Wait for a service to become healthy
   */
  private async waitForHealthy(serviceName: string, timeout: number): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const status = await this.getServiceStatus(serviceName)

      if (status.health === 'healthy' || status.health === 'none') {
        return
      }

      if (status.status === 'error' || status.status === 'stopped') {
        throw new Error(`Service ${serviceName} failed to start: ${status.error}`)
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    throw new Error(`Service ${serviceName} health check timeout`)
  }

  /**
   * Get service start order based on dependencies
   */
  private getStartOrder(): string[] {
    const order: string[] = []
    const visited = new Set<string>()

    const visit = (name: string) => {
      if (visited.has(name)) return
      visited.add(name)

      const service = this.services[name]
      if (service.dependsOn) {
        for (const dep of service.dependsOn) {
          visit(dep)
        }
      }

      order.push(name)
    }

    for (const name of Object.keys(this.services)) {
      visit(name)
    }

    return order
  }

  /**
   * Map container state to service status
   */
  private mapContainerState(state: ContainerInfo['state']): ServiceStatus['status'] {
    switch (state) {
      case 'running':
        return 'running'
      case 'restarting':
        return 'starting'
      case 'removing':
        return 'stopping'
      case 'exited':
      case 'stopped':
      case 'dead':
        return 'stopped'
      default:
        return 'unknown'
    }
  }

  /**
   * Enable/disable auto-restart
   */
  setAutoRestart(enabled: boolean): void {
    this.autoRestartEnabled = enabled
    if (enabled) {
      this.startHealthMonitoring()
    } else {
      this.stopHealthMonitoring()
    }
  }

  /**
   * Get auto-restart status
   */
  isAutoRestartEnabled(): boolean {
    return this.autoRestartEnabled
  }

  /**
   * Start health monitoring and auto-restart
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return // Already running
    }

    console.log('Starting health monitoring with auto-restart')
    this.healthCheckInterval = setInterval(async () => {
      if (!this.autoRestartEnabled) return

      try {
        const services = await this.getServicesStatus()

        for (const service of services) {
          // Check if essential service has stopped or is in error state
          if (service.essential && (service.status === 'stopped' || service.status === 'error')) {
            const attempts = this.restartAttempts.get(service.name) || 0

            if (attempts < this.maxRestartAttempts) {
              console.log(`Auto-restarting essential service: ${service.displayName} (attempt ${attempts + 1}/${this.maxRestartAttempts})`)
              this.restartAttempts.set(service.name, attempts + 1)

              try {
                await this.startService(service.name)
                // Reset attempts on successful start
                this.restartAttempts.set(service.name, 0)
              } catch (error) {
                console.error(`Failed to auto-restart ${service.displayName}:`, error)
              }
            } else {
              console.error(`Max restart attempts reached for ${service.displayName}`)
            }
          } else if (service.status === 'running') {
            // Reset restart attempts for running services
            this.restartAttempts.set(service.name, 0)
          }
        }

        for (const service of services) {
          // Check if essential service has stopped or is in error state
          if (service.essential && (service.status === 'stopped' || service.status === 'error')) {
            const attempts = this.restartAttempts.get(service.name) || 0

            if (attempts < this.maxRestartAttempts) {
              console.log(`Auto-restarting essential service: ${service.displayName} (attempt ${attempts + 1}/${this.maxRestartAttempts})`)
              this.restartAttempts.set(service.name, attempts + 1)

              try {
                await this.startService(service.name)
                // Reset attempts on successful start
                this.restartAttempts.set(service.name, 0)
              } catch (error) {
                console.error(`Failed to auto-restart ${service.displayName}:`, error)
              }
            } else {
              console.error(`Max restart attempts reached for ${service.displayName}`)
            }
          } else if (service.status === 'running') {
            // Reset restart attempts for running services
            this.restartAttempts.set(service.name, 0)
          }
        }
      } catch (error) {
        console.error('Health monitoring error:', error)
      }
    }, 15000) // Check every 15 seconds
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
      console.log('Stopped health monitoring')
    }
  }

  /**
   * Reset restart attempts for a service
   */
  resetRestartAttempts(serviceName: string): void {
    this.restartAttempts.set(serviceName, 0)
  }

  /**
   * Get restart attempts for a service
   */
  getRestartAttempts(serviceName: string): number {
    return this.restartAttempts.get(serviceName) || 0
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup(): Promise<void> {
    this.stopHealthMonitoring()
    this.restartAttempts.clear()
  }
}

// Singleton instance
let serviceManagerInstance: ServiceManager | null = null

/**
 * Get global service manager instance
 */
export function getServiceManager(runtime: IContainerRuntime): ServiceManager {
  if (!serviceManagerInstance) {
    serviceManagerInstance = new ServiceManager(runtime)
  }
  return serviceManagerInstance
}
