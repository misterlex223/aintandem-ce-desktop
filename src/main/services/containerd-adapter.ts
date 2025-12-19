import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import {
  IContainerRuntime,
  ContainerConfig,
  ContainerInfo,
  ImageInfo,
  NetworkInfo,
  VolumeInfo,
  ContainerStats
} from './container-runtime.interface'

const _execAsync = promisify(exec)

/**
 * Containerd adapter using nerdctl CLI
 * Supports both system-installed and bundled nerdctl
 */
export class ContainerdAdapter implements IContainerRuntime {
  private nerdctlPath: string = 'nerdctl'
  private namespace: string = 'kai'

  /**
   * Set custom nerdctl path (for bundled runtime)
   */
  setNerdctlPath(path: string) {
    this.nerdctlPath = path
  }

  async initialize(): Promise<void> {
    // Check if nerdctl is available
    try {
      await this.exec('--version')
      console.log(`Containerd runtime initialized via nerdctl (${this.nerdctlPath})`)
    } catch {
      throw new Error('nerdctl not found. Please install nerdctl to use containerd runtime.')
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.exec('info')
      return true
    } catch {
      return false
    }
  }

  getRuntimeType(): 'docker' | 'containerd' {
    return 'containerd'
  }

  // Helper method to execute nerdctl commands
  private async exec(args: string, options?: { input?: string }): Promise<string> {
    const command = `${this.nerdctlPath} --namespace ${this.namespace} ${args}`

    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        env: { ...process.env }
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      if (options?.input) {
        child.stdin.write(options.input)
        child.stdin.end()
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`nerdctl command failed: ${stderr || stdout}`))
        }
      })

      child.on('error', (err) => {
        reject(err)
      })
    })
  }

  // Container operations
  async startContainer(config: ContainerConfig): Promise<string> {
    const args: string[] = ['run', '-d']

    // Name
    if (config.name) {
      args.push('--name', config.name)
    }

    // Environment variables
    if (config.env) {
      Object.entries(config.env).forEach(([key, value]) => {
        args.push('-e', `${key}=${value}`)
      })
    }

    // Port mappings
    if (config.ports) {
      Object.entries(config.ports).forEach(([containerPort, hostPort]) => {
        args.push('-p', `${hostPort}:${containerPort}`)
      })
    }

    // Volume mounts
    if (config.volumes) {
      config.volumes.forEach((vol) => {
        const source = vol.source || vol.name
        args.push('-v', `${source}:${vol.target}`)
      })
    }

    // Networks
    if (config.networks && config.networks.length > 0) {
      args.push('--network', config.networks[0])
    }

    // Restart policy
    if (config.restart) {
      args.push('--restart', config.restart)
    }

    // Labels
    if (config.labels) {
      Object.entries(config.labels).forEach(([key, value]) => {
        args.push('--label', `${key}=${value}`)
      })
    }

    // Health check
    if (config.healthcheck) {
      args.push('--health-cmd', config.healthcheck.test.join(' '))
      if (config.healthcheck.interval) {
        args.push('--health-interval', `${config.healthcheck.interval}ms`)
      }
      if (config.healthcheck.timeout) {
        args.push('--health-timeout', `${config.healthcheck.timeout}ms`)
      }
      if (config.healthcheck.retries) {
        args.push('--health-retries', config.healthcheck.retries.toString())
      }
    }

    // Image
    args.push(config.image)

    // Command
    if (config.cmd) {
      args.push(...config.cmd)
    }

    const output = await this.exec(args.join(' '))
    return output.trim()
  }

  async stopContainer(id: string, timeout?: number): Promise<void> {
    const args = ['stop']
    if (timeout) {
      args.push('-t', timeout.toString())
    }
    args.push(id)
    await this.exec(args.join(' '))
  }

  async removeContainer(id: string, force?: boolean): Promise<void> {
    const args = ['rm']
    if (force) {
      args.push('-f')
    }
    args.push(id)
    await this.exec(args.join(' '))
  }

  async restartContainer(id: string, timeout?: number): Promise<void> {
    const args = ['restart']
    if (timeout) {
      args.push('-t', timeout.toString())
    }
    args.push(id)
    await this.exec(args.join(' '))
  }

  async pauseContainer(id: string): Promise<void> {
    await this.exec(`pause ${id}`)
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.exec(`unpause ${id}`)
  }

  async listContainers(options?: {
    all?: boolean
    filters?: Record<string, string[]>
  }): Promise<ContainerInfo[]> {
    const args = ['ps']

    if (options?.all) {
      args.push('-a')
    }

    args.push('--format', '{{json .}}')

    const output = await this.exec(args.join(' '))
    if (!output.trim()) {
      return []
    }

    const lines = output.trim().split('\n')
    const containers: ContainerInfo[] = []

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        containers.push({
          id: data.ID || data.ContainerID || '',
          name: data.Names || data.Name || '',
          image: data.Image || '',
          state: this.mapState(data.Status || data.State || ''),
          status: data.Status || '',
          created: new Date(data.CreatedAt || Date.now()),
          ports: this.parsePorts(data.Ports || ''),
          labels: {},
          networks: []
        })
      } catch (err) {
        console.error('Failed to parse container JSON:', line, err)
      }
    }

    return containers
  }

  private mapState(status: string): 'running' | 'stopped' | 'paused' | 'restarting' | 'exited' {
    const lower = status.toLowerCase()
    if (lower.includes('up') || lower.includes('running')) return 'running'
    if (lower.includes('paused')) return 'paused'
    if (lower.includes('restarting')) return 'restarting'
    if (lower.includes('exited')) return 'exited'
    return 'stopped'
  }

  private parsePorts(portsStr: string): Record<string, number> {
    const ports: Record<string, number> = {}
    // Parse ports like "0.0.0.0:8080->80/tcp"
    const matches = portsStr.matchAll(/(\d+\.\d+\.\d+\.\d+):(\d+)->(\d+)\/\w+/g)
    for (const match of matches) {
      const containerPort = match[3]
      const hostPort = parseInt(match[2], 10)
      ports[containerPort] = hostPort
    }
    return ports
  }

  async inspectContainer(id: string): Promise<ContainerInfo> {
    const output = await this.exec(`inspect ${id}`)
    const data = JSON.parse(output)

    if (!data || data.length === 0) {
      throw new Error(`Container ${id} not found`)
    }

    const container = data[0]
    return {
      id: container.Id,
      name: container.Name.replace(/^\//, ''),
      image: container.Config?.Image || '',
      state: this.mapContainerdState(container.State),
      status: container.State?.Status || '',
      created: new Date(container.Created),
      ports: this.parsePortBindings(container.NetworkSettings?.Ports || {}),
      labels: container.Config?.Labels || {},
      networks: Object.keys(container.NetworkSettings?.Networks || {})
    }
  }

  private mapContainerdState(state: any): 'running' | 'stopped' | 'paused' | 'restarting' | 'exited' {
    if (state.Running) return 'running'
    if (state.Paused) return 'paused'
    if (state.Restarting) return 'restarting'
    if (state.Status === 'exited') return 'exited'
    return 'stopped'
  }

  private parsePortBindings(ports: any): Record<string, number> {
    const result: Record<string, number> = {}
    Object.entries(ports || {}).forEach(([key, bindings]: [string, any]) => {
      const containerPort = key.split('/')[0]
      if (bindings?.[0]?.HostPort) {
        result[containerPort] = parseInt(bindings[0].HostPort, 10)
      }
    })
    return result
  }

  async getContainerLogs(id: string, options?: {
    tail?: number
    follow?: boolean
  }): Promise<string> {
    const args = ['logs']
    if (options?.tail) {
      args.push('--tail', options.tail.toString())
    }
    if (options?.follow) {
      args.push('-f')
    }
    args.push(id)

    return await this.exec(args.join(' '))
  }

  async getContainerStats(id: string): Promise<ContainerStats> {
    const output = await this.exec(`stats --no-stream --format "{{json .}}" ${id}`)
    const data = JSON.parse(output)

    return {
      cpu: parseFloat(data.CPUPerc?.replace('%', '') || '0'),
      memory: {
        used: this.parseBytes(data.MemUsage?.split('/')[0]?.trim() || '0B'),
        limit: this.parseBytes(data.MemUsage?.split('/')[1]?.trim() || '0B'),
        percentage: parseFloat(data.MemPerc?.replace('%', '') || '0')
      },
      network: {
        rx: this.parseBytes(data.NetIO?.split('/')[0]?.trim() || '0B'),
        tx: this.parseBytes(data.NetIO?.split('/')[1]?.trim() || '0B')
      },
      blockIO: {
        read: this.parseBytes(data.BlockIO?.split('/')[0]?.trim() || '0B'),
        write: this.parseBytes(data.BlockIO?.split('/')[1]?.trim() || '0B')
      }
    }
  }

  private parseBytes(str: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'KiB': 1024,
      'MiB': 1024 * 1024,
      'GiB': 1024 * 1024 * 1024
    }

    const match = str.match(/^([\d.]+)\s*([A-Za-z]+)$/)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2]
    return value * (units[unit] || 1)
  }

  async checkHealth(id: string): Promise<'healthy' | 'unhealthy' | 'starting' | 'none'> {
    try {
      const info = await this.inspectContainer(id)
      // Containerd doesn't have native health check status in the same way
      // We'll check if container is running as a simple health check
      return info.state === 'running' ? 'healthy' : 'unhealthy'
    } catch {
      return 'none'
    }
  }

  // Image operations
  async pullImage(name: string, onProgress?: (progress: any) => void): Promise<void> {
    // nerdctl pull doesn't provide JSON progress, so we'll just run it
    await this.exec(`pull ${name}`)
    if (onProgress) {
      onProgress({ status: 'Download complete', id: name })
    }
  }

  async listImages(): Promise<ImageInfo[]> {
    const output = await this.exec('images --format "{{json .}}"')
    if (!output.trim()) {
      return []
    }

    const lines = output.trim().split('\n')
    const images: ImageInfo[] = []

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        images.push({
          id: data.ID || '',
          tags: [data.Repository && data.Tag ? `${data.Repository}:${data.Tag}` : ''],
          size: this.parseBytes(data.Size || '0B'),
          created: new Date(data.CreatedAt || Date.now())
        })
      } catch (err) {
        console.error('Failed to parse image JSON:', line, err)
      }
    }

    return images
  }

  async removeImage(id: string, force?: boolean): Promise<void> {
    const args = ['rmi']
    if (force) {
      args.push('-f')
    }
    args.push(id)
    await this.exec(args.join(' '))
  }

  async imageExists(name: string): Promise<boolean> {
    try {
      await this.exec(`inspect --type image ${name}`)
      return true
    } catch {
      return false
    }
  }

  // Network operations
  async createNetwork(name: string, options?: {
    driver?: string
    internal?: boolean
    attachable?: boolean
  }): Promise<string> {
    const args = ['network', 'create']
    if (options?.driver) {
      args.push('-d', options.driver)
    }
    if (options?.internal) {
      args.push('--internal')
    }
    args.push(name)

    const output = await this.exec(args.join(' '))
    return output.trim()
  }

  async listNetworks(): Promise<NetworkInfo[]> {
    const output = await this.exec('network ls --format "{{json .}}"')
    if (!output.trim()) {
      return []
    }

    const lines = output.trim().split('\n')
    const networks: NetworkInfo[] = []

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        networks.push({
          id: data.ID || data.NetworkID || '',
          name: data.Name || '',
          driver: data.Driver || 'bridge',
          scope: 'local'
        })
      } catch (err) {
        console.error('Failed to parse network JSON:', line, err)
      }
    }

    return networks
  }

  async removeNetwork(id: string): Promise<void> {
    await this.exec(`network rm ${id}`)
  }

  async connectContainerToNetwork(containerId: string, networkId: string): Promise<void> {
    await this.exec(`network connect ${networkId} ${containerId}`)
  }

  async disconnectContainerFromNetwork(containerId: string, networkId: string): Promise<void> {
    await this.exec(`network disconnect ${networkId} ${containerId}`)
  }

  // Volume operations
  async createVolume(name: string, options?: {
    driver?: string
    labels?: Record<string, string>
  }): Promise<string> {
    const args = ['volume', 'create']
    if (options?.labels) {
      Object.entries(options.labels).forEach(([key, value]) => {
        args.push('--label', `${key}=${value}`)
      })
    }
    args.push(name)

    const output = await this.exec(args.join(' '))
    return output.trim()
  }

  async listVolumes(): Promise<VolumeInfo[]> {
    const output = await this.exec('volume ls --format "{{json .}}"')
    if (!output.trim()) {
      return []
    }

    const lines = output.trim().split('\n')
    const volumes: VolumeInfo[] = []

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        volumes.push({
          name: data.Name || data.VolumeName || '',
          driver: data.Driver || 'local',
          mountpoint: data.Mountpoint || ''
        })
      } catch (err) {
        console.error('Failed to parse volume JSON:', line, err)
      }
    }

    return volumes
  }

  async removeVolume(name: string, force?: boolean): Promise<void> {
    const args = ['volume', 'rm']
    if (force) {
      args.push('-f')
    }
    args.push(name)
    await this.exec(args.join(' '))
  }

  // System operations
  async getSystemInfo(): Promise<any> {
    const output = await this.exec('info --format json')
    return JSON.parse(output)
  }

  async prune(options?: {
    containers?: boolean
    images?: boolean
    volumes?: boolean
    networks?: boolean
  }): Promise<{
    containersDeleted: number
    imagesDeleted: number
    volumesDeleted: number
    networksDeleted: number
    spaceReclaimed: number
  }> {
    const result = {
      containersDeleted: 0,
      imagesDeleted: 0,
      volumesDeleted: 0,
      networksDeleted: 0,
      spaceReclaimed: 0
    }

    if (options?.containers) {
      const _output = await this.exec('container prune -f')
      // Parse output for deleted count if needed
    }

    if (options?.images) {
      const _output = await this.exec('image prune -f')
      // Parse output for deleted count if needed
    }

    if (options?.volumes) {
      const _output = await this.exec('volume prune -f')
      // Parse output for deleted count if needed
    }

    if (options?.networks) {
      const _output = await this.exec('network prune -f')
      // Parse output for deleted count if needed
    }

    return result
  }
}
