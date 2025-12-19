import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Bundled Runtime Manager
 * Downloads, installs, and manages bundled nerdctl + containerd binaries
 */
export class BundledRuntimeManager {
  private runtimeDir: string
  private binDir: string
  private dataDir: string
  private initialized: boolean = false

  // Download URLs for different platforms
  // NOTE: nerdctl does NOT support macOS natively - macOS users should use Docker Desktop
  private readonly DOWNLOAD_URLS = {
    // darwin: NOT SUPPORTED - no native macOS binaries available
    linux: {
      arm64: 'https://github.com/containerd/nerdctl/releases/download/v2.1.6/nerdctl-full-2.1.6-linux-arm64.tar.gz',
      x64: 'https://github.com/containerd/nerdctl/releases/download/v2.1.6/nerdctl-full-2.1.6-linux-amd64.tar.gz'
    },
    win32: {
      x64: 'https://github.com/containerd/nerdctl/releases/download/v2.1.6/nerdctl-full-2.1.6-windows-amd64.tar.gz'
    }
  }

  constructor() {
    // Store runtime in app data directory
    const appData = app.getPath('userData')
    this.runtimeDir = path.join(appData, 'bundled-runtime')
    this.binDir = path.join(this.runtimeDir, 'bin')
    this.dataDir = path.join(this.runtimeDir, 'data')
  }

  /**
   * Get path to pre-bundled runtime in app resources
   */
  private getPreBundledPath(): string | null {
    try {
      const platform = process.platform as 'darwin' | 'linux' | 'win32'
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
      const platformKey = `${platform}-${arch}`

      // Check if running in development or production
      // In dev mode, process.resourcesPath points to Electron's internal resources
      // We need to use __dirname calculation instead
      const isDev = !app.isPackaged
      const resourcesPath = isDev ? path.join(__dirname, '..', '..') : (process.resourcesPath || path.join(__dirname, '..', '..'))
      const preBundledPath = path.join(resourcesPath, 'resources', 'bundled-runtime', platformKey)

      // Check if pre-bundled runtime exists
      if (fsSync.existsSync(preBundledPath)) {
        return preBundledPath
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Check if bundled runtime is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      const nerdctlPath = path.join(this.binDir, process.platform === 'win32' ? 'nerdctl.exe' : 'nerdctl')
      const containerdPath = path.join(this.binDir, process.platform === 'win32' ? 'containerd.exe' : 'containerd')

      const [nerdctlExists, containerdExists] = await Promise.all([
        fs.access(nerdctlPath).then(() => true).catch(() => false),
        fs.access(containerdPath).then(() => true).catch(() => false)
      ])

      return nerdctlExists && containerdExists
    } catch {
      return false
    }
  }

  /**
   * Check if containerd daemon is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const nerdctlPath = this.getNerdctlPath()
      const { stdout } = await execAsync(`"${nerdctlPath}" version`)
      return stdout.includes('Server:')
    } catch {
      return false
    }
  }

  /**
   * Get nerdctl binary path
   */
  getNerdctlPath(): string {
    return path.join(this.binDir, process.platform === 'win32' ? 'nerdctl.exe' : 'nerdctl')
  }

  /**
   * Get containerd binary path
   */
  getContainerdPath(): string {
    return path.join(this.binDir, process.platform === 'win32' ? 'containerd.exe' : 'containerd')
  }

  /**
   * Download and install bundled runtime
   */
  async install(onProgress?: (message: string) => void): Promise<void> {
    const platform = process.platform as 'darwin' | 'linux' | 'win32'
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

    onProgress?.('Preparing bundled container runtime...')

    // Create directories
    await fs.mkdir(this.runtimeDir, { recursive: true })
    await fs.mkdir(this.binDir, { recursive: true })
    await fs.mkdir(this.dataDir, { recursive: true })

    // Check for pre-bundled runtime first
    const preBundledPath = this.getPreBundledPath()
    if (preBundledPath) {
      onProgress?.('Using pre-bundled runtime from installation...')

      // Copy pre-bundled binaries to runtime directory
      await this.copyDirectory(preBundledPath, this.binDir)

      // Make binaries executable (Unix-like systems)
      if (platform !== 'win32') {
        const binaries = ['nerdctl', 'containerd', 'containerd-shim-runc-v2', 'runc', 'ctr']
        for (const binary of binaries) {
          const binaryPath = path.join(this.binDir, binary)
          try {
            await fs.chmod(binaryPath, 0o755)
          } catch (error) {
            console.warn(`Failed to chmod ${binary}:`, error)
          }
        }
      }

      onProgress?.('Pre-bundled runtime installed successfully')
      return
    }

    // Fallback to download if no pre-bundled runtime
    onProgress?.('No pre-bundled runtime found, downloading...')

    // Get download URL
    const downloadUrl = this.DOWNLOAD_URLS[platform]?.[arch]
    if (!downloadUrl) {
      throw new Error(`Bundled runtime not available for ${platform}-${arch}`)
    }

    onProgress?.(`Downloading from ${downloadUrl}...`)

    // Download runtime
    const tarPath = path.join(this.runtimeDir, 'nerdctl-full.tar.gz')
    await this.downloadFile(downloadUrl, tarPath, onProgress)

    onProgress?.('Extracting binaries...')

    // Extract binaries
    await this.extractTarGz(tarPath, this.binDir)

    // Clean up
    await fs.unlink(tarPath)

    // Make binaries executable (Unix-like systems)
    if (platform !== 'win32') {
      const binaries = ['nerdctl', 'containerd', 'containerd-shim-runc-v2', 'runc', 'ctr']
      for (const binary of binaries) {
        const binaryPath = path.join(this.binDir, binary)
        try {
          await fs.chmod(binaryPath, 0o755)
        } catch (error) {
          console.warn(`Failed to chmod ${binary}:`, error)
        }
      }
    }

    onProgress?.('Bundled runtime installed successfully')
  }

  /**
   * Start containerd daemon
   */
  async startDaemon(onOutput?: (message: string) => void): Promise<void> {
    if (await this.isRunning()) {
      onOutput?.('Containerd daemon already running')
      return
    }

    const containerdPath = this.getContainerdPath()
    const configPath = path.join(this.runtimeDir, 'containerd-config.toml')

    // Create containerd config
    await this.createContainerdConfig(configPath)

    onOutput?.('Starting containerd daemon...')

    // Start containerd in background
    const daemon = spawn(containerdPath, [
      '--config', configPath,
      '--root', path.join(this.dataDir, 'root'),
      '--state', path.join(this.dataDir, 'state')
    ], {
      detached: true,
      stdio: 'ignore'
    })

    daemon.unref()

    // Wait for daemon to be ready
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (await this.isRunning()) {
        onOutput?.('Containerd daemon started successfully')
        return
      }
    }

    throw new Error('Failed to start containerd daemon')
  }

  /**
   * Stop containerd daemon
   */
  async stopDaemon(): Promise<void> {
    if (process.platform === 'win32') {
      await execAsync('taskkill /F /IM containerd.exe')
    } else {
      await execAsync('pkill -f containerd')
    }
  }

  /**
   * Create containerd configuration file
   */
  private async createContainerdConfig(configPath: string): Promise<void> {
    const config = `
version = 2

# Root directory for persistent data
root = "${this.dataDir.replace(/\\/g, '/')}/root"

# State directory for execution state
state = "${this.dataDir.replace(/\\/g, '/')}/state"

[grpc]
  address = "${this.dataDir.replace(/\\/g, '/')}/containerd.sock"

[plugins]
  [plugins."io.containerd.grpc.v1.cri"]
    [plugins."io.containerd.grpc.v1.cri".containerd]
      snapshotter = "overlayfs"
      [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]
        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
          runtime_type = "io.containerd.runc.v2"
`

    await fs.writeFile(configPath, config, 'utf-8')
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })

    const entries = await fs.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  /**
   * Download file with progress
   */
  private async downloadFile(url: string, dest: string, onProgress?: (message: string) => void): Promise<void> {
    const https = await import('https')
    const file = fsSync.createWriteStream(dest)

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            this.downloadFile(redirectUrl, dest, onProgress).then(resolve).catch(reject)
            return
          }
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedBytes = 0

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length
          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1)
            onProgress?.(`Downloading: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`)
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          resolve()
        })
      }).on('error', (err) => {
        fsSync.unlinkSync(dest)
        reject(err)
      })
    })
  }

  /**
   * Extract tar.gz file
   */
  private async extractTarGz(tarPath: string, destDir: string): Promise<void> {
    // Use system tar command
    if (process.platform === 'win32') {
      await execAsync(`tar -xzf "${tarPath}" -C "${destDir}"`)
    } else {
      await execAsync(`tar -xzf "${tarPath}" -C "${destDir}"`)
    }
  }

  /**
   * Initialize bundled runtime (install if needed, start daemon)
   */
  async initialize(onProgress?: (message: string) => void): Promise<void> {
    if (this.initialized) return

    onProgress?.('Initializing bundled container runtime...')

    // Install if not already installed
    if (!(await this.isInstalled())) {
      await this.install(onProgress)
    }

    // Start daemon if not running
    if (!(await this.isRunning())) {
      await this.startDaemon(onProgress)
    }

    this.initialized = true
    onProgress?.('Bundled runtime ready')
  }

  /**
   * Uninstall bundled runtime
   */
  async uninstall(): Promise<void> {
    try {
      await this.stopDaemon()
    } catch (error) {
      console.warn('Failed to stop daemon:', error)
    }

    try {
      await fs.rm(this.runtimeDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to remove runtime directory:', error)
      throw error
    }

    this.initialized = false
  }
}

// Singleton instance
let bundledRuntimeInstance: BundledRuntimeManager | null = null

export function getBundledRuntime(): BundledRuntimeManager {
  if (!bundledRuntimeInstance) {
    bundledRuntimeInstance = new BundledRuntimeManager()
  }
  return bundledRuntimeInstance
}
