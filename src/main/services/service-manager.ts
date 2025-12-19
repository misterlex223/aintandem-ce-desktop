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
 * Service Manager - Orchestrates Kai services
 */
export class ServiceManager {
  private runtime: IContainerRuntime
  private services: Record<string, ServiceDefinition>
  private autoRestartEnabled: boolean = true
  private restartAttempts: Map<string, number> = new Map()
  private maxRestartAttempts: number = 3
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(runtime: IContainerRuntime) {
    this.runtime = runtime
    this.services = getServiceDefinitions()
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

    // Start new container
    console.log(`Starting service: ${serviceName}`)
    const containerConfig = service.containerConfig(config)
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
