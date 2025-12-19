/**
 * Container configuration for starting containers
 */
export interface ContainerConfig {
  name: string
  image: string
  env?: Record<string, string>
  ports?: Record<string, string> // containerPort -> hostPort
  volumes?: Array<{
    host: string
    container: string
    readOnly?: boolean
  }>
  networks?: string[]
  command?: string[]
  healthcheck?: {
    test: string[]
    interval: number
    timeout: number
    retries: number
    startPeriod?: number
  }
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped'
  labels?: Record<string, string>
}

/**
 * Container information
 */
export interface ContainerInfo {
  id: string
  name: string
  image: string
  state: 'running' | 'stopped' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead'
  status: string
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'
  created: Date
  ports: Array<{
    containerPort: number
    hostPort?: number
    protocol: 'tcp' | 'udp'
  }>
}

/**
 * Image information
 */
export interface ImageInfo {
  id: string
  tags: string[]
  size: number
  created: Date
}

/**
 * Network information
 */
export interface NetworkInfo {
  id: string
  name: string
  driver: string
  containers: string[]
}

/**
 * Volume information
 */
export interface VolumeInfo {
  name: string
  driver: string
  mountpoint: string
}

/**
 * Progress callback for image pulls
 */
export interface PullProgress {
  status: string
  progress?: number // 0-100
  total?: number
  current?: number
}

/**
 * Unified container runtime interface
 * Supports both Docker Desktop and containerd
 */
export interface IContainerRuntime {
  /**
   * Initialize the runtime (detect availability, setup connections)
   */
  initialize(): Promise<void>

  /**
   * Check if the runtime is available and working
   */
  isAvailable(): Promise<boolean>

  /**
   * Get runtime type (docker, containerd, or lima)
   */
  getRuntimeType(): 'docker' | 'containerd' | 'lima'

  // Container Lifecycle

  /**
   * Start a new container
   */
  startContainer(config: ContainerConfig): Promise<string>

  /**
   * Stop a running container
   */
  stopContainer(id: string, timeout?: number): Promise<void>

  /**
   * Remove a container
   */
  removeContainer(id: string, force?: boolean): Promise<void>

  /**
   * Restart a container
   */
  restartContainer(id: string, timeout?: number): Promise<void>

  /**
   * Pause a container
   */
  pauseContainer(id: string): Promise<void>

  /**
   * Unpause a container
   */
  unpauseContainer(id: string): Promise<void>

  // Container Information

  /**
   * Get detailed container information
   */
  inspectContainer(id: string): Promise<ContainerInfo>

  /**
   * List containers
   */
  listContainers(options?: {
    all?: boolean
    filters?: Record<string, string[]>
  }): Promise<ContainerInfo[]>

  /**
   * Get container logs
   */
  getContainerLogs(id: string, options?: {
    follow?: boolean
    tail?: number
    since?: number
    timestamps?: boolean
  }): Promise<NodeJS.ReadableStream>

  /**
   * Get container stats (CPU, memory, etc.)
   */
  getContainerStats(id: string): Promise<{
    cpu: number // percentage
    memory: {
      used: number // bytes
      limit: number // bytes
      percentage: number
    }
    network: {
      rx: number // bytes
      tx: number // bytes
    }
    blockIO: {
      read: number // bytes
      write: number // bytes
    }
  }>

  // Image Management

  /**
   * Pull an image from registry
   */
  pullImage(
    name: string,
    onProgress?: (progress: PullProgress) => void
  ): Promise<void>

  /**
   * List images
   */
  listImages(): Promise<ImageInfo[]>

  /**
   * Remove an image
   */
  removeImage(id: string, force?: boolean): Promise<void>

  /**
   * Check if image exists locally
   */
  imageExists(name: string): Promise<boolean>

  // Network Management

  /**
   * Create a network
   */
  createNetwork(name: string, options?: {
    driver?: string
    internal?: boolean
    attachable?: boolean
  }): Promise<string>

  /**
   * Remove a network
   */
  removeNetwork(id: string): Promise<void>

  /**
   * List networks
   */
  listNetworks(): Promise<NetworkInfo[]>

  /**
   * Connect container to network
   */
  connectContainerToNetwork(containerId: string, networkId: string): Promise<void>

  /**
   * Disconnect container from network
   */
  disconnectContainerFromNetwork(containerId: string, networkId: string): Promise<void>

  // Volume Management

  /**
   * Create a volume
   */
  createVolume(name: string, options?: {
    driver?: string
    labels?: Record<string, string>
  }): Promise<string>

  /**
   * Remove a volume
   */
  removeVolume(name: string, force?: boolean): Promise<void>

  /**
   * List volumes
   */
  listVolumes(): Promise<VolumeInfo[]>

  // Health & System

  /**
   * Get system information
   */
  getSystemInfo(): Promise<{
    os: string
    architecture: string
    cpus: number
    memory: number
    runtimeVersion: string
  }>

  /**
   * Clean up unused resources (containers, images, volumes, networks)
   */
  prune(options?: {
    containers?: boolean
    images?: boolean
    volumes?: boolean
    networks?: boolean
  }): Promise<{
    containersDeleted: number
    imagesDeleted: number
    volumesDeleted: number
    networksDeleted: number
    spaceReclaimed: number // bytes
  }>
}
