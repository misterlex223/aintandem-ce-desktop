import Docker from 'dockerode'
import {
  IContainerRuntime,
  ContainerConfig,
  ContainerInfo,
  ImageInfo,
  NetworkInfo,
  VolumeInfo,
  PullProgress
} from './container-runtime.interface'

/**
 * Docker Desktop adapter implementing IContainerRuntime
 */
export class DockerAdapter implements IContainerRuntime {
  private docker: Docker | null = null

  async initialize(): Promise<void> {
    try {
      this.docker = new Docker()
      // Test connection
      await this.docker.ping()
      console.log('Docker Desktop adapter initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Docker Desktop adapter:', error)
      throw new Error('Docker Desktop is not available')
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.docker) {
        this.docker = new Docker()
      }
      await this.docker.ping()
      return true
    } catch {
      return false
    }
  }

  getRuntimeType(): 'docker' | 'containerd' {
    return 'docker'
  }

  async startContainer(config: ContainerConfig): Promise<string> {
    if (!this.docker) throw new Error('Docker not initialized')

    const createOptions: Docker.ContainerCreateOptions = {
      name: config.name,
      Image: config.image,
      Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
      HostConfig: {
        PortBindings: config.ports
          ? Object.fromEntries(
              Object.entries(config.ports).map(([containerPort, hostPort]) => [
                `${containerPort}/tcp`,
                [{ HostPort: hostPort }]
              ])
            )
          : undefined,
        Binds: config.volumes?.map(v => `${v.host}:${v.container}${v.readOnly ? ':ro' : ''}`),
        NetworkMode: config.networks?.[0],
        RestartPolicy: config.restart
          ? {
              Name: config.restart === 'on-failure' ? 'on-failure' : config.restart,
              MaximumRetryCount: config.restart === 'on-failure' ? 3 : 0
            }
          : undefined
      },
      Cmd: config.command,
      Labels: config.labels,
      Healthcheck: config.healthcheck
        ? {
            Test: config.healthcheck.test,
            Interval: config.healthcheck.interval * 1000000, // convert to nanoseconds
            Timeout: config.healthcheck.timeout * 1000000,
            Retries: config.healthcheck.retries,
            StartPeriod: config.healthcheck.startPeriod
              ? config.healthcheck.startPeriod * 1000000
              : undefined
          }
        : undefined
    }

    const container = await this.docker.createContainer(createOptions)
    await container.start()

    // Connect to additional networks if specified
    if (config.networks && config.networks.length > 1) {
      for (let i = 1; i < config.networks.length; i++) {
        const network = this.docker.getNetwork(config.networks[i])
        await network.connect({ Container: container.id })
      }
    }

    return container.id
  }

  async stopContainer(id: string, timeout = 10): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    await container.stop({ t: timeout })
  }

  async removeContainer(id: string, force = false): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    await container.remove({ force, v: true })
  }

  async restartContainer(id: string, timeout = 10): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    await container.restart({ t: timeout })
  }

  async pauseContainer(id: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    await container.pause()
  }

  async unpauseContainer(id: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    await container.unpause()
  }

  async inspectContainer(id: string): Promise<ContainerInfo> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    const info = await container.inspect()

    return {
      id: info.Id,
      name: info.Name.startsWith('/') ? info.Name.substring(1) : info.Name,
      image: info.Config.Image,
      state: this.mapDockerState(info.State.Status),
      status: info.State.Status,
      health: info.State.Health?.Status as any,
      created: new Date(info.Created),
      ports: Object.entries(info.NetworkSettings.Ports || {}).flatMap(([key, bindings]) => {
        const [portStr, protocol] = key.split('/')
        const containerPort = parseInt(portStr, 10)
        if (!bindings || bindings.length === 0) {
          return [{ containerPort, protocol: protocol as 'tcp' | 'udp' }]
        }
        return bindings.map(binding => ({
          containerPort,
          hostPort: binding.HostPort ? parseInt(binding.HostPort, 10) : undefined,
          protocol: protocol as 'tcp' | 'udp'
        }))
      })
    }
  }

  async listContainers(options?: {
    all?: boolean
    filters?: Record<string, string[]>
  }): Promise<ContainerInfo[]> {
    if (!this.docker) throw new Error('Docker not initialized')

    const containers = await this.docker.listContainers({
      all: options?.all ?? true,
      filters: options?.filters ? JSON.stringify(options.filters) : undefined
    })

    return Promise.all(containers.map(c => this.inspectContainer(c.Id)))
  }

  async getContainerLogs(
    id: string,
    options?: {
      follow?: boolean
      tail?: number
      since?: number
      timestamps?: boolean
    }
  ): Promise<NodeJS.ReadableStream> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)

    return container.logs({
      follow: options?.follow ?? false,
      stdout: true,
      stderr: true,
      tail: options?.tail ?? 100,
      since: options?.since,
      timestamps: options?.timestamps ?? false
    }) as unknown as NodeJS.ReadableStream
  }

  async getContainerStats(id: string): Promise<{
    cpu: number
    memory: { used: number; limit: number; percentage: number }
    network: { rx: number; tx: number }
    blockIO: { read: number; write: number }
  }> {
    if (!this.docker) throw new Error('Docker not initialized')
    const container = this.docker.getContainer(id)
    const stats = await container.stats({ stream: false })

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0

    const memUsed = stats.memory_stats.usage || 0
    const memLimit = stats.memory_stats.limit || 1
    const memPercent = (memUsed / memLimit) * 100

    const networkRx = Object.values(stats.networks || {}).reduce(
      (sum, net) => sum + (net.rx_bytes || 0),
      0
    )
    const networkTx = Object.values(stats.networks || {}).reduce(
      (sum, net) => sum + (net.tx_bytes || 0),
      0
    )

    const blockRead = stats.blkio_stats.io_service_bytes_recursive?.find(
      x => x.op === 'Read'
    )?.value || 0
    const blockWrite = stats.blkio_stats.io_service_bytes_recursive?.find(
      x => x.op === 'Write'
    )?.value || 0

    return {
      cpu: cpuPercent,
      memory: {
        used: memUsed,
        limit: memLimit,
        percentage: memPercent
      },
      network: {
        rx: networkRx,
        tx: networkTx
      },
      blockIO: {
        read: blockRead,
        write: blockWrite
      }
    }
  }

  async pullImage(
    name: string,
    onProgress?: (progress: PullProgress) => void
  ): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')

    return new Promise((resolve, reject) => {
      this.docker!.pull(name, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        const layers = new Map<string, { current: number; total: number }>()

        this.docker!.modem.followProgress(
          stream,
          (err, _output) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          },
          (event: any) => {
            if (onProgress && event.progressDetail) {
              const { id, status, progressDetail } = event
              if (id && progressDetail.current && progressDetail.total) {
                layers.set(id, {
                  current: progressDetail.current,
                  total: progressDetail.total
                })
              }

              // Calculate overall progress
              let totalCurrent = 0
              let totalSize = 0
              layers.forEach(layer => {
                totalCurrent += layer.current
                totalSize += layer.total
              })

              const progress = totalSize > 0 ? (totalCurrent / totalSize) * 100 : 0

              onProgress({
                status,
                progress: Math.round(progress),
                total: totalSize,
                current: totalCurrent
              })
            }
          }
        )
      })
    })
  }

  async listImages(): Promise<ImageInfo[]> {
    if (!this.docker) throw new Error('Docker not initialized')
    const images = await this.docker.listImages()

    return images.map(img => ({
      id: img.Id,
      tags: img.RepoTags || [],
      size: img.Size,
      created: new Date(img.Created * 1000)
    }))
  }

  async removeImage(id: string, force = false): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const image = this.docker.getImage(id)
    await image.remove({ force })
  }

  async imageExists(name: string): Promise<boolean> {
    if (!this.docker) throw new Error('Docker not initialized')
    try {
      const image = this.docker.getImage(name)
      await image.inspect()
      return true
    } catch {
      return false
    }
  }

  async createNetwork(
    name: string,
    options?: { driver?: string; internal?: boolean; attachable?: boolean }
  ): Promise<string> {
    if (!this.docker) throw new Error('Docker not initialized')
    const network = await this.docker.createNetwork({
      Name: name,
      Driver: options?.driver ?? 'bridge',
      Internal: options?.internal ?? false,
      Attachable: options?.attachable ?? true
    })
    return network.id
  }

  async removeNetwork(id: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const network = this.docker.getNetwork(id)
    await network.remove()
  }

  async listNetworks(): Promise<NetworkInfo[]> {
    if (!this.docker) throw new Error('Docker not initialized')
    const networks = await this.docker.listNetworks()

    return networks.map(net => ({
      id: net.Id,
      name: net.Name,
      driver: net.Driver,
      containers: Object.keys(net.Containers || {})
    }))
  }

  async connectContainerToNetwork(containerId: string, networkId: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const network = this.docker.getNetwork(networkId)
    await network.connect({ Container: containerId })
  }

  async disconnectContainerFromNetwork(containerId: string, networkId: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const network = this.docker.getNetwork(networkId)
    await network.disconnect({ Container: containerId })
  }

  async createVolume(
    name: string,
    options?: { driver?: string; labels?: Record<string, string> }
  ): Promise<string> {
    if (!this.docker) throw new Error('Docker not initialized')
    const volume = await this.docker.createVolume({
      Name: name,
      Driver: options?.driver ?? 'local',
      Labels: options?.labels
    })
    return volume.Name
  }

  async removeVolume(name: string, force = false): Promise<void> {
    if (!this.docker) throw new Error('Docker not initialized')
    const volume = this.docker.getVolume(name)
    await volume.remove({ force })
  }

  async listVolumes(): Promise<VolumeInfo[]> {
    if (!this.docker) throw new Error('Docker not initialized')
    const result = await this.docker.listVolumes()

    return (
      result.Volumes?.map(vol => ({
        name: vol.Name,
        driver: vol.Driver,
        mountpoint: vol.Mountpoint
      })) || []
    )
  }

  async getSystemInfo(): Promise<{
    os: string
    architecture: string
    cpus: number
    memory: number
    runtimeVersion: string
  }> {
    if (!this.docker) throw new Error('Docker not initialized')
    const info = await this.docker.info()
    const version = await this.docker.version()

    return {
      os: info.OperatingSystem,
      architecture: info.Architecture,
      cpus: info.NCPU,
      memory: info.MemTotal,
      runtimeVersion: version.Version
    }
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
    if (!this.docker) throw new Error('Docker not initialized')

    let containersDeleted = 0
    let imagesDeleted = 0
    let volumesDeleted = 0
    let networksDeleted = 0
    let spaceReclaimed = 0

    if (options?.containers ?? true) {
      const result = await this.docker.pruneContainers()
      containersDeleted = result.ContainersDeleted?.length || 0
      spaceReclaimed += result.SpaceReclaimed || 0
    }

    if (options?.images ?? true) {
      const result = await this.docker.pruneImages({ filters: { dangling: ['false'] } })
      imagesDeleted = result.ImagesDeleted?.length || 0
      spaceReclaimed += result.SpaceReclaimed || 0
    }

    if (options?.volumes ?? true) {
      const result = await this.docker.pruneVolumes()
      volumesDeleted = result.VolumesDeleted?.length || 0
      spaceReclaimed += result.SpaceReclaimed || 0
    }

    if (options?.networks ?? true) {
      const result = await this.docker.pruneNetworks()
      networksDeleted = result.NetworksDeleted?.length || 0
    }

    return {
      containersDeleted,
      imagesDeleted,
      volumesDeleted,
      networksDeleted,
      spaceReclaimed
    }
  }

  private mapDockerState(
    state: string
  ): 'running' | 'stopped' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead' {
    const stateMap: Record<string, ContainerInfo['state']> = {
      running: 'running',
      created: 'stopped',
      restarting: 'restarting',
      removing: 'removing',
      paused: 'paused',
      exited: 'exited',
      dead: 'dead'
    }
    return stateMap[state] || 'stopped'
  }
}
