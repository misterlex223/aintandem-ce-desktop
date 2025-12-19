import { IContainerRuntime } from './container-runtime.interface'
import { DockerAdapter } from './docker-adapter'
import { ContainerdAdapter } from './containerd-adapter'
import { LimaAdapter } from './lima-adapter'
import { getBundledRuntime } from './bundled-runtime'

/**
 * Container Manager - Auto-detects and manages container runtime
 */
export class ContainerManager {
  private runtime: IContainerRuntime | null = null
  private preferredRuntime: 'docker' | 'containerd' | 'lima' | 'auto' = 'auto'

  constructor(preferredRuntime?: 'docker' | 'containerd' | 'lima' | 'auto') {
    this.preferredRuntime = preferredRuntime || 'auto'
  }

  /**
   * Initialize container runtime with auto-detection
   * Priority: Bundled runtime (Lima/containerd) → Docker Desktop (optional for developers)
   */
  async initialize(): Promise<void> {
    console.log(`Initializing container runtime (preferred: ${this.preferredRuntime})...`)

    // Try Lima first on macOS (default user mode)
    if (process.platform === 'darwin' && (this.preferredRuntime === 'lima' || this.preferredRuntime === 'auto')) {
      console.log('[DEBUG] Trying Lima runtime on macOS...')
      try {
        const limaAdapter = new LimaAdapter()
        console.log('[DEBUG] LimaAdapter created, checking availability...')
        if (await limaAdapter.isAvailable()) {
          console.log('[DEBUG] Lima is available, initializing...')
          await limaAdapter.initialize()
          this.runtime = limaAdapter
          console.log('Using Lima runtime (containerd + nerdctl in VM)')
          return
        } else {
          console.log('[DEBUG] Lima isAvailable() returned false')
        }
      } catch (error) {
        console.log('Lima not available:', error)
        console.error('[DEBUG] Lima availability check error:', error)

        // Try to install bundled Lima on macOS
        if (this.preferredRuntime === 'lima' || this.preferredRuntime === 'auto') {
          try {
            console.log('Attempting to use bundled Lima runtime...')
            const limaAdapter = new LimaAdapter()
            const limaManager = limaAdapter.getLimaManager()

            // Initialize (will use pre-bundled or download)
            await limaManager.initialize((message) => {
              console.log(`[Lima] ${message}`)
            })

            // Start VM
            await limaManager.start((message) => {
              console.log(`[Lima] ${message}`)
            })

            await limaAdapter.initialize()
            this.runtime = limaAdapter
            console.log('Using bundled Lima runtime')
            return
          } catch (error) {
            console.error('Bundled Lima setup failed:', error)
          }
        }
      }
    }

    // Try containerd (Linux/Windows user mode)
    if (process.platform !== 'darwin' && (this.preferredRuntime === 'containerd' || this.preferredRuntime === 'auto')) {
      // Try system-installed containerd first
      try {
        const containerdAdapter = new ContainerdAdapter()
        if (await containerdAdapter.isAvailable()) {
          await containerdAdapter.initialize()
          this.runtime = containerdAdapter
          console.log('Using system containerd runtime (nerdctl)')
          return
        }
      } catch (error) {
        console.log('System containerd not available:', error)
      }

      // Try bundled runtime as fallback
      try {
        console.log('Attempting to use bundled containerd runtime...')
        const bundledRuntime = getBundledRuntime()

        // Initialize bundled runtime (download + install if needed)
        await bundledRuntime.initialize((message) => {
          console.log(`[Bundled Runtime] ${message}`)
        })

        // Configure containerd adapter to use bundled nerdctl
        const containerdAdapter = new ContainerdAdapter()
        containerdAdapter.setNerdctlPath(bundledRuntime.getNerdctlPath())

        if (await containerdAdapter.isAvailable()) {
          await containerdAdapter.initialize()
          this.runtime = containerdAdapter
          console.log('Using bundled containerd runtime')
          return
        }
      } catch (error) {
        console.error('Bundled containerd setup failed:', error)
      }
    }

    // Try Docker Desktop as fallback (optional developer mode)
    if (this.preferredRuntime === 'docker' || this.preferredRuntime === 'auto') {
      try {
        const dockerAdapter = new DockerAdapter()
        if (await dockerAdapter.isAvailable()) {
          await dockerAdapter.initialize()
          this.runtime = dockerAdapter
          console.log('Using Docker Desktop runtime (developer mode)')
          return
        }
      } catch (error) {
        console.log('Docker Desktop not available:', error)
      }
    }

    throw new Error(
      'No container runtime available. Kai will attempt to download and install a bundled runtime.\n\n' +
      'If you prefer to use Docker Desktop (developer mode):\n' +
      'Docker Desktop: https://www.docker.com/products/docker-desktop'
    )
  }

  /**
   * Get the active runtime instance
   */
  getRuntime(): IContainerRuntime {
    if (!this.runtime) {
      throw new Error('Container runtime not initialized. Call initialize() first.')
    }
    return this.runtime
  }

  /**
   * Check if runtime is initialized
   */
  isInitialized(): boolean {
    return this.runtime !== null
  }

  /**
   * Get current runtime type
   */
  getRuntimeType(): 'docker' | 'containerd' | 'lima' | 'none' {
    if (!this.runtime) return 'none'
    return this.runtime.getRuntimeType()
  }

  /**
   * Switch runtime (requires re-initialization)
   */
  async switchRuntime(type: 'docker' | 'containerd' | 'lima'): Promise<void> {
    this.runtime = null
    this.preferredRuntime = type
    await this.initialize()
  }

  /**
   * Detect available container runtimes on the system
   */
  async detectAvailableRuntimes(): Promise<{
    docker: boolean
    containerd: boolean
    lima: boolean
    current: 'docker' | 'containerd' | 'lima' | 'none'
  }> {
    let dockerAvailable = false
    let containerdAvailable = false
    let limaAvailable = false

    // Check Docker
    try {
      const dockerAdapter = new DockerAdapter()
      dockerAvailable = await dockerAdapter.isAvailable()
    } catch {
      dockerAvailable = false
    }

    // Check Lima (macOS only)
    if (process.platform === 'darwin') {
      try {
        const limaAdapter = new LimaAdapter()
        limaAvailable = await limaAdapter.isAvailable()
      } catch {
        limaAvailable = false
      }
    }

    // Check containerd (Linux/Windows)
    if (process.platform !== 'darwin') {
      try {
        const containerdAdapter = new ContainerdAdapter()
        containerdAvailable = await containerdAdapter.isAvailable()
      } catch {
        containerdAvailable = false
      }
    }

    return {
      docker: dockerAvailable,
      containerd: containerdAvailable,
      lima: limaAvailable,
      current: this.getRuntimeType()
    }
  }
}

// Singleton instance
let containerManagerInstance: ContainerManager | null = null

/**
 * Get global container manager instance
 */
export function getContainerManager(): ContainerManager {
  if (!containerManagerInstance) {
    containerManagerInstance = new ContainerManager()
  }
  return containerManagerInstance
}
