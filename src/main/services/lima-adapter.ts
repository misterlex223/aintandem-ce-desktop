import type {
  IContainerRuntime,
  ContainerConfig,
  ContainerInfo,
  ImageInfo,
  NetworkInfo,
  VolumeInfo
} from './container-runtime.interface'
import { LimaRuntimeManager } from './lima-runtime'

/**
 * Lima Container Adapter
 * Provides container operations via Lima (nerdctl in Linux VM)
 */
export class LimaAdapter implements IContainerRuntime {
  private limaManager: LimaRuntimeManager

  constructor() {
    this.limaManager = new LimaRuntimeManager()
  }

  /**
   * Initialize Lima runtime
   */
  async initialize(): Promise<void> {
    await this.limaManager.initialize()

    // Ensure VM is running (with timeout)
    if (!(await this.limaManager.isRunning())) {
      console.log('[DEBUG] LimaAdapter - VM not running, starting with 30s timeout...')

      // Start VM with timeout (first run can take a while to download image)
      const timeout = 30000 // 30 seconds
      const startPromise = this.limaManager.start((msg) => {
        console.log('[Lima Start]', msg)
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Lima VM start timeout (30s) - VM may still be starting in background')), timeout)
      )

      try {
        await Promise.race([startPromise, timeoutPromise])
        console.log('[DEBUG] LimaAdapter - VM started successfully')
      } catch (error: any) {
        if (error.message.includes('timeout')) {
          console.warn('[DEBUG] LimaAdapter - VM start timeout, continuing anyway (VM starting in background)')
          // Don't throw - let the VM continue starting in background
        } else {
          throw error
        }
      }
    } else {
      console.log('[DEBUG] LimaAdapter - VM already running')
    }
  }

  /**
   * Check if Lima is available (either installed OR pre-bundled)
   */
  async isAvailable(): Promise<boolean> {
    try {
      console.log('[DEBUG] LimaAdapter.isAvailable() - checking if Lima is installed...')
      const isInstalled = await this.limaManager.isInstalled()
      console.log('[DEBUG] LimaAdapter.isAvailable() - isInstalled result:', isInstalled)

      if (isInstalled) {
        return true
      }

      // Also check if pre-bundled Lima is available
      console.log('[DEBUG] LimaAdapter.isAvailable() - checking for pre-bundled Lima...')
      const hasPreBundled = await this.limaManager.hasPreBundled()
      console.log('[DEBUG] LimaAdapter.isAvailable() - hasPreBundled result:', hasPreBundled)

      return hasPreBundled
    } catch (error) {
      console.error('[DEBUG] LimaAdapter.isAvailable() - error:', error)
      return false
    }
  }

  /**
   * Get runtime type
   */
  getRuntimeType(): 'docker' | 'containerd' | 'lima' {
    return 'lima'
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<{
    os: string
    architecture: string
    cpus: number
    memory: number
    runtimeVersion: string
  }> {
    try {
      const output = await this.limaManager.execNerdctl(['info', '--format', 'json'])
      const info = JSON.parse(output)

      return {
        os: info.OperatingSystem || 'Linux',
        architecture: info.Architecture || process.arch,
        cpus: info.NCPU || 0,
        memory: info.MemTotal || 0,
        runtimeVersion: info.ServerVersion || '1.0.0'
      }
    } catch (error: any) {
      throw new Error(`Failed to get system info: ${error.message}`)
    }
  }

  /**
   * List containers
   */
  async listContainers(options?: {
    all?: boolean
    filters?: Record<string, string[]>
  }): Promise<ContainerInfo[]> {
    try {
      const args = ['ps', '--format', 'json']

      if (options?.all) {
        args.push('--all')
      }

      if (options?.filters) {
        for (const [key, values] of Object.entries(options.filters)) {
          for (const value of values) {
            args.push('--filter', `${key}=${value}`)
          }
        }
      }

      const output = await this.limaManager.execNerdctl(args)

      // nerdctl returns NDJSON (newline-delimited JSON)
      const containers = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const data = JSON.parse(line)
          return {
            id: data.ID || data.Id,
            name: data.Names?.replace(/^\//, '') || data.Name,
            image: data.Image,
            state: data.State?.toLowerCase() || data.Status?.toLowerCase() || 'unknown',
            status: data.Status,
            created: data.CreatedAt || data.Created
          }
        })

      return containers
    } catch (error: any) {
      throw new Error(`Failed to list containers: ${error.message}`)
    }
  }

  /**
   * Start a container
   */
  async startContainer(config: ContainerConfig): Promise<string> {
    try {
      const args = ['run', '-d']

      // Container name
      if (config.name) {
        args.push('--name', config.name)
      }

      // Port mappings
      if (config.portMappings) {
        for (const [hostPort, containerPort] of Object.entries(config.portMappings)) {
          args.push('-p', `${hostPort}:${containerPort}`)
        }
      }

      // Environment variables
      if (config.env) {
        for (const [key, value] of Object.entries(config.env)) {
          args.push('-e', `${key}=${value}`)
        }
      }

      // Volume mounts
      if (config.volumes) {
        if (Array.isArray(config.volumes)) {
          // Handle array format: ['hostPath:containerPath', ...]
          for (const volume of config.volumes) {
            if (typeof volume === 'string') {
              args.push('-v', volume)
            } else if (volume && typeof volume === 'object') {
              // Handle object format in array: { source: 'hostPath', target: 'containerPath' }
              const source = (volume as any).source || (volume as any).hostPath
              const target = (volume as any).target || (volume as any).containerPath
              if (source && target) {
                args.push('-v', `${source}:${target}`)
              }
            }
          }
        } else {
          // Handle object format: { 'hostPath': 'containerPath', ... }
          for (const [hostPath, containerPath] of Object.entries(config.volumes)) {
            if (typeof containerPath === 'string') {
              args.push('-v', `${hostPath}:${containerPath}`)
            }
          }
        }
      }

      // Network
      if (config.network) {
        args.push('--network', config.network)
      }

      // Labels
      if (config.labels) {
        for (const [key, value] of Object.entries(config.labels)) {
          args.push('--label', `${key}=${value}`)
        }
      }

      // Restart policy
      if (config.restartPolicy) {
        args.push('--restart', config.restartPolicy)
      }

      // Image
      args.push(config.image)

      // Command
      if (config.cmd) {
        args.push(...config.cmd)
      }

      const output = await this.limaManager.execNerdctl(args)
      return output.trim()
    } catch (error: any) {
      throw new Error(`Failed to start container: ${error.message}`)
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(id: string, timeout?: number): Promise<void> {
    try {
      const args = ['stop']

      if (timeout !== undefined) {
        args.push('--time', timeout.toString())
      }

      args.push(id)

      await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to stop container: ${error.message}`)
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(id: string, force?: boolean): Promise<void> {
    try {
      const args = ['rm']

      if (force) {
        args.push('--force')
      }

      args.push(id)

      await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to remove container: ${error.message}`)
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(id: string, timeout?: number): Promise<void> {
    try {
      const args = ['restart']

      if (timeout !== undefined) {
        args.push('--time', timeout.toString())
      }

      args.push(id)

      await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to restart container: ${error.message}`)
    }
  }

  /**
   * Inspect a container
   */
  async inspectContainer(id: string): Promise<ContainerInfo> {
    try {
      const output = await this.limaManager.execNerdctl(['inspect', '--format', 'json', id])
      const data = JSON.parse(output)[0]

      return {
        id: data.Id,
        name: data.Name?.replace(/^\//, ''),
        image: data.Config?.Image || data.Image,
        state: data.State?.Status?.toLowerCase() || 'unknown',
        status: data.State?.Status,
        created: data.Created,
        ports: this.parsePorts(data.NetworkSettings?.Ports || {}),
        mounts: data.Mounts || [],
        networks: Object.keys(data.NetworkSettings?.Networks || {})
      }
    } catch (error: any) {
      throw new Error(`Failed to inspect container: ${error.message}`)
    }
  }

  /**
   * Get container stats
   */
  async getContainerStats(id: string): Promise<any> {
    try {
      const output = await this.limaManager.execNerdctl(['stats', '--no-stream', '--format', 'json', id])
      const data = JSON.parse(output)

      return {
        cpu: parseFloat(data.CPUPerc?.replace('%', '') || '0'),
        memory: {
          used: this.parseMemory(data.MemUsage?.split('/')[0]?.trim() || '0'),
          limit: this.parseMemory(data.MemUsage?.split('/')[1]?.trim() || '0'),
          percentage: parseFloat(data.MemPerc?.replace('%', '') || '0')
        },
        network: {
          rx: this.parseBytes(data.NetIO?.split('/')[0]?.trim() || '0'),
          tx: this.parseBytes(data.NetIO?.split('/')[1]?.trim() || '0')
        },
        blockIO: {
          read: this.parseBytes(data.BlockIO?.split('/')[0]?.trim() || '0'),
          write: this.parseBytes(data.BlockIO?.split('/')[1]?.trim() || '0')
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to get container stats: ${error.message}`)
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(id: string, options?: { tail?: number; follow?: boolean }): Promise<string> {
    try {
      const args = ['logs']

      if (options?.tail) {
        args.push('--tail', options.tail.toString())
      }

      args.push(id)

      return await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to get container logs: ${error.message}`)
    }
  }

  /**
   * List images
   */
  async listImages(): Promise<ImageInfo[]> {
    try {
      const output = await this.limaManager.execNerdctl(['images', '--format', 'json'])

      const images = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const data = JSON.parse(line)
          return {
            id: data.ID,
            repository: data.Repository,
            tag: data.Tag,
            size: this.parseSize(data.Size),
            created: data.CreatedAt
          }
        })

      return images
    } catch (error: any) {
      throw new Error(`Failed to list images: ${error.message}`)
    }
  }

  /**
   * Pull an image
   */
  async pullImage(name: string, onProgress?: (data: any) => void): Promise<void> {
    try {
      // For simple implementation, execute without progress
      await this.limaManager.execNerdctl(['pull', name])
      onProgress?.({ name, status: 'complete' })
    } catch (error: any) {
      throw new Error(`Failed to pull image: ${error.message}`)
    }
  }

  /**
   * Check if image exists
   */
  async imageExists(name: string): Promise<boolean> {
    try {
      await this.limaManager.execNerdctl(['inspect', '--type', 'image', name])
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove an image
   */
  async removeImage(id: string, force?: boolean): Promise<void> {
    try {
      const args = ['rmi']

      if (force) {
        args.push('--force')
      }

      args.push(id)

      await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to remove image: ${error.message}`)
    }
  }

  /**
   * List networks
   */
  async listNetworks(): Promise<NetworkInfo[]> {
    try {
      const output = await this.limaManager.execNerdctl(['network', 'ls', '--format', 'json'])

      const networks = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const data = JSON.parse(line)
          return {
            id: data.ID || data.NetworkID,
            name: data.Name,
            driver: data.Driver,
            scope: data.Scope
          }
        })

      return networks
    } catch (error: any) {
      throw new Error(`Failed to list networks: ${error.message}`)
    }
  }

  /**
   * Create a network
   */
  async createNetwork(name: string, options?: any): Promise<string> {
    try {
      const args = ['network', 'create']

      if (options?.driver) {
        args.push('--driver', options.driver)
      }

      args.push(name)

      const output = await this.limaManager.execNerdctl(args)
      return output.trim()
    } catch (error: any) {
      throw new Error(`Failed to create network: ${error.message}`)
    }
  }

  /**
   * Remove a network
   */
  async removeNetwork(id: string): Promise<void> {
    try {
      await this.limaManager.execNerdctl(['network', 'rm', id])
    } catch (error: any) {
      throw new Error(`Failed to remove network: ${error.message}`)
    }
  }

  /**
   * List volumes
   */
  async listVolumes(): Promise<VolumeInfo[]> {
    try {
      const output = await this.limaManager.execNerdctl(['volume', 'ls', '--format', 'json'])

      const volumes = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const data = JSON.parse(line)
          return {
            name: data.Name,
            driver: data.Driver,
            mountpoint: data.Mountpoint
          }
        })

      return volumes
    } catch (error: any) {
      throw new Error(`Failed to list volumes: ${error.message}`)
    }
  }

  /**
   * Create a volume
   */
  async createVolume(name: string, options?: any): Promise<string> {
    try {
      const args = ['volume', 'create']

      if (options?.driver) {
        args.push('--driver', options.driver)
      }

      args.push(name)

      const output = await this.limaManager.execNerdctl(args)
      return output.trim()
    } catch (error: any) {
      throw new Error(`Failed to create volume: ${error.message}`)
    }
  }

  /**
   * Remove a volume
   */
  async removeVolume(name: string, force?: boolean): Promise<void> {
    try {
      const args = ['volume', 'rm']

      if (force) {
        args.push('--force')
      }

      args.push(name)

      await this.limaManager.execNerdctl(args)
    } catch (error: any) {
      throw new Error(`Failed to remove volume: ${error.message}`)
    }
  }

  /**
   * Prune system
   */
  async pruneSystem(options?: any): Promise<any> {
    try {
      const results = {
        containersDeleted: 0,
        imagesDeleted: 0,
        volumesDeleted: 0,
        networksDeleted: 0,
        spaceReclaimed: 0
      }

      if (options?.containers !== false) {
        await this.limaManager.execNerdctl(['container', 'prune', '--force'])
        results.containersDeleted = 1 // nerdctl doesn't return count
      }

      if (options?.images !== false) {
        await this.limaManager.execNerdctl(['image', 'prune', '--force'])
        results.imagesDeleted = 1
      }

      if (options?.volumes !== false) {
        await this.limaManager.execNerdctl(['volume', 'prune', '--force'])
        results.volumesDeleted = 1
      }

      if (options?.networks !== false) {
        await this.limaManager.execNerdctl(['network', 'prune', '--force'])
        results.networksDeleted = 1
      }

      return results
    } catch (error: any) {
      throw new Error(`Failed to prune system: ${error.message}`)
    }
  }

  /**
   * Parse port mappings
   */
  private parsePorts(ports: any): any[] {
    const result: any[] = []

    for (const [containerPort, hostBindings] of Object.entries(ports)) {
      if (Array.isArray(hostBindings)) {
        for (const binding of hostBindings as any[]) {
          result.push({
            privatePort: parseInt(containerPort.split('/')[0]),
            publicPort: parseInt(binding.HostPort || '0'),
            type: containerPort.split('/')[1] || 'tcp'
          })
        }
      }
    }

    return result
  }

  /**
   * Parse memory size string (e.g., "128MiB", "1.5GiB")
   */
  private parseMemory(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)\s*([KMGT]i?B?)$/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'KIB': 1024,
      'MB': 1024 * 1024,
      'MIB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'GIB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024,
      'TIB': 1024 * 1024 * 1024 * 1024
    }

    return value * (multipliers[unit] || 1)
  }

  /**
   * Parse bytes string (e.g., "1.2kB", "300MB")
   */
  private parseBytes(sizeStr: string): number {
    return this.parseMemory(sizeStr)
  }

  /**
   * Parse size string
   */
  private parseSize(sizeStr: string): number {
    return this.parseMemory(sizeStr)
  }

  /**
   * Get Lima manager (for lifecycle management)
   */
  getLimaManager(): LimaRuntimeManager {
    return this.limaManager
  }
}
