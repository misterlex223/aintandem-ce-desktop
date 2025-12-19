import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Lima Runtime Manager
 * Manages Lima VM lifecycle and provides nerdctl access via Lima
 */
export class LimaRuntimeManager {
  private limaDir: string
  private binDir: string
  private limaVMName: string = 'default'
  private initialized: boolean = false

  // Download URLs for Lima
  private readonly DOWNLOAD_URLS = {
    darwin: {
      arm64: 'https://github.com/lima-vm/lima/releases/download/v1.2.1/lima-1.2.1-Darwin-arm64.tar.gz',
      x64: 'https://github.com/lima-vm/lima/releases/download/v1.2.1/lima-1.2.1-Darwin-x86_64.tar.gz'
    }
  }

  constructor() {
    // Store Lima in app data directory
    const appData = app.getPath('userData')
    this.limaDir = path.join(appData, 'lima')
    this.binDir = path.join(this.limaDir, 'bin')
  }

  /**
   * Get path to pre-bundled Lima in app resources
   */
  private getPreBundledPath(): string | null {
    try {
      console.log('[DEBUG] LimaRuntimeManager.getPreBundledPath() - checking for pre-bundled Lima...')
      if (process.platform !== 'darwin') {
        console.log('[DEBUG] Not macOS, returning null')
        return null // Lima only for macOS
      }

      const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
      const platformKey = `darwin-${arch}`
      console.log('[DEBUG] platformKey:', platformKey)

      // Check if running in development or production
      // In dev mode, process.resourcesPath points to Electron's internal resources
      // We need to use __dirname calculation instead
      const isDev = !app.isPackaged
      const resourcesPath = isDev ? path.join(__dirname, '..', '..') : (process.resourcesPath || path.join(__dirname, '..', '..'))
      console.log('[DEBUG] isDev:', isDev)
      console.log('[DEBUG] resourcesPath:', resourcesPath)
      console.log('[DEBUG] __dirname:', __dirname)

      const preBundledPath = path.join(resourcesPath, 'resources', 'bundled-runtime', platformKey)
      console.log('[DEBUG] preBundledPath:', preBundledPath)

      // Check if pre-bundled Lima exists
      const exists = fsSync.existsSync(preBundledPath)
      console.log('[DEBUG] preBundledPath exists:', exists)

      if (exists) {
        const contents = fsSync.readdirSync(preBundledPath)
        console.log('[DEBUG] preBundledPath contents:', contents)
        return preBundledPath
      }

      return null
    } catch (error) {
      console.error('[DEBUG] LimaRuntimeManager.getPreBundledPath() - error:', error)
      return null
    }
  }

  /**
   * Check if Lima is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      console.log('[DEBUG] LimaRuntimeManager.isInstalled() - checking paths...')
      console.log('[DEBUG] limaDir:', this.limaDir)
      console.log('[DEBUG] binDir:', this.binDir)

      const limactlPath = path.join(this.binDir, 'limactl')
      const limaPath = path.join(this.binDir, 'lima')

      console.log('[DEBUG] limactlPath:', limactlPath)
      console.log('[DEBUG] limaPath:', limaPath)

      const [limactlExists, limaExists] = await Promise.all([
        fs.access(limactlPath).then(() => true).catch(() => false),
        fs.access(limaPath).then(() => true).catch(() => false)
      ])

      console.log('[DEBUG] limactlExists:', limactlExists)
      console.log('[DEBUG] limaExists:', limaExists)

      return limactlExists && limaExists
    } catch (error) {
      console.error('[DEBUG] LimaRuntimeManager.isInstalled() - error:', error)
      return false
    }
  }

  /**
   * Check if pre-bundled Lima exists in resources
   */
  async hasPreBundled(): Promise<boolean> {
    try {
      const preBundledPath = this.getPreBundledPath()
      console.log('[DEBUG] LimaRuntimeManager.hasPreBundled() - preBundledPath:', preBundledPath)
      return preBundledPath !== null
    } catch (error) {
      console.error('[DEBUG] LimaRuntimeManager.hasPreBundled() - error:', error)
      return false
    }
  }

  /**
   * Check if Lima VM is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const limactlPath = this.getLimactlPath()
      const { stdout } = await execAsync(`"${limactlPath}" list --json`)
      const vms = JSON.parse(stdout)
      const defaultVM = vms.find((vm: any) => vm.name === this.limaVMName)
      return defaultVM?.status === 'Running'
    } catch {
      return false
    }
  }

  /**
   * Get limactl binary path
   */
  getLimactlPath(): string {
    return path.join(this.binDir, 'limactl')
  }

  /**
   * Get lima binary path
   */
  getLimaPath(): string {
    return path.join(this.binDir, 'lima')
  }

  /**
   * Get nerdctl wrapper path (lima nerdctl)
   */
  getNerdctlPath(): string {
    return path.join(this.binDir, 'nerdctl.lima')
  }

  /**
   * Initialize Lima (install if needed)
   */
  async initialize(onProgress?: (message: string) => void): Promise<void> {
    if (this.initialized) {
      return
    }

    if (process.platform !== 'darwin') {
      throw new Error('Lima is only supported on macOS')
    }

    // Check if already installed
    if (await this.isInstalled()) {
      onProgress?.('Lima already installed')
      this.initialized = true
      return
    }

    // Try to use pre-bundled Lima
    const preBundledPath = this.getPreBundledPath()
    if (preBundledPath) {
      onProgress?.('Using pre-bundled Lima from installation...')
      await this.copyDirectory(preBundledPath, this.limaDir)
      await this.extractGuestAgent(onProgress)
      await this.makeExecutable()
      this.initialized = true
      return
    }

    // Fallback: download Lima
    await this.install(onProgress)
    this.initialized = true
  }

  /**
   * Install Lima (download and extract)
   */
  async install(onProgress?: (message: string) => void): Promise<void> {
    const platform = process.platform as 'darwin'
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

    const downloadUrl = this.DOWNLOAD_URLS[platform]?.[arch]
    if (!downloadUrl) {
      throw new Error(`No Lima download available for ${platform}-${arch}`)
    }

    // Create directories
    await fs.mkdir(this.limaDir, { recursive: true })
    await fs.mkdir(this.binDir, { recursive: true })

    // Download
    const tarPath = path.join(this.limaDir, 'lima.tar.gz')
    onProgress?.('Downloading Lima...')
    await this.downloadFile(downloadUrl, tarPath, onProgress)

    // Extract
    onProgress?.('Extracting Lima...')
    await this.extractTarGz(tarPath, this.limaDir)

    // Clean up
    await fs.unlink(tarPath)

    // Make binaries executable
    await this.makeExecutable()

    onProgress?.('Lima installed successfully')
  }

  /**
   * Make binaries executable
   */
  private async makeExecutable(): Promise<void> {
    const binaries = ['limactl', 'lima', 'nerdctl.lima', 'docker.lima', 'kubectl.lima', 'podman.lima', 'apptainer.lima']
    for (const binary of binaries) {
      const binaryPath = path.join(this.binDir, binary)
      try {
        await fs.chmod(binaryPath, 0o755)
      } catch {
        // Binary might not exist (optional wrappers)
      }
    }
  }

  /**
   * Copy directory recursively (handles symlinks)
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    console.log('[DEBUG] copyDirectory - src:', src, '-> dest:', dest)
    await fs.mkdir(dest, { recursive: true })

    const entries = await fs.readdir(src, { withFileTypes: true })
    console.log('[DEBUG] copyDirectory - entries in', src, ':', entries.map(e => e.name))

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      // Handle symlinks - check if entry is a symlink
      if (entry.isSymbolicLink()) {
        console.log('[DEBUG] copyDirectory - symlink detected:', entry.name)
        try {
          // Read the symlink target
          const linkTarget = await fs.readlink(srcPath)
          console.log('[DEBUG] copyDirectory - symlink target:', linkTarget)
          // Create the same symlink in destination
          await fs.symlink(linkTarget, destPath)
          console.log('[DEBUG] copyDirectory - symlink created')
        } catch (error) {
          console.error('[DEBUG] copyDirectory - failed to copy symlink:', error)
          // Skip symlink if it fails
        }
      } else if (entry.isDirectory()) {
        console.log('[DEBUG] copyDirectory - recursing into directory:', entry.name)
        await this.copyDirectory(srcPath, destPath)
      } else {
        console.log('[DEBUG] copyDirectory - copying file:', entry.name)
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  /**
   * Extract gzipped lima-guestagent file
   */
  private async extractGuestAgent(onProgress?: (message: string) => void): Promise<void> {
    try {
      const gzPath = path.join(this.limaDir, 'share', 'lima', 'lima-guestagent.Linux-x86_64.gz')
      const extractedPath = path.join(this.limaDir, 'share', 'lima', 'lima-guestagent.Linux-x86_64')

      // Check if gzipped file exists
      try {
        await fs.access(gzPath)
      } catch {
        console.log('[DEBUG] No guestagent.gz file found, skipping extraction')
        return
      }

      onProgress?.('Extracting Lima guest agent...')
      console.log('[DEBUG] Extracting guestagent from:', gzPath)

      // Extract using gunzip command
      await execAsync(`gunzip -f "${gzPath}"`)

      console.log('[DEBUG] Guest agent extracted to:', extractedPath)
      onProgress?.('Lima guest agent extracted')
    } catch (error) {
      console.error('[DEBUG] Failed to extract guest agent:', error)
      // Don't throw - Lima might still work if guestagent is already extracted
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
            const percent = Math.floor((downloadedBytes / totalBytes) * 100)
            onProgress?.(`Downloading Lima: ${percent}%`)
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
    await execAsync(`tar -xzf "${tarPath}" -C "${destDir}"`)
  }

  /**
   * Start Lima VM
   */
  async start(onProgress?: (message: string) => void): Promise<void> {
    const limactlPath = this.getLimactlPath()

    // Check if VM already exists
    const vmExists = await this.vmExists()

    if (!vmExists) {
      onProgress?.('Creating Lima VM (first time may take a few minutes)...')
      // Create VM with default template (includes containerd)
      await execAsync(`"${limactlPath}" start --tty=false "${this.limaVMName}"`)
      onProgress?.('Lima VM created and started')
    } else {
      // Check if already running
      if (await this.isRunning()) {
        onProgress?.('Lima VM already running')
        return
      }

      onProgress?.('Starting Lima VM...')
      await execAsync(`"${limactlPath}" start --tty=false "${this.limaVMName}"`)
      onProgress?.('Lima VM started')
    }
  }

  /**
   * Stop Lima VM
   */
  async stop(onProgress?: (message: string) => void): Promise<void> {
    const limactlPath = this.getLimactlPath()

    if (!(await this.isRunning())) {
      onProgress?.('Lima VM already stopped')
      return
    }

    onProgress?.('Stopping Lima VM...')
    await execAsync(`"${limactlPath}" stop "${this.limaVMName}"`)
    onProgress?.('Lima VM stopped')
  }

  /**
   * Check if VM exists
   */
  private async vmExists(): Promise<boolean> {
    try {
      const limactlPath = this.getLimactlPath()
      const { stdout } = await execAsync(`"${limactlPath}" list --json`)
      const vms = JSON.parse(stdout)
      return vms.some((vm: any) => vm.name === this.limaVMName)
    } catch {
      return false
    }
  }

  /**
   * Execute nerdctl command via Lima
   */
  async execNerdctl(args: string[]): Promise<string> {
    const limaPath = this.getLimaPath()
    const limactlPath = this.getLimactlPath()

    // Set LIMACTL environment variable so lima wrapper can find limactl
    const env = {
      ...process.env,
      LIMACTL: limactlPath
    }

    const command = `"${limaPath}" nerdctl ${args.map(arg => `"${arg}"`).join(' ')}`
    const { stdout } = await execAsync(command, { env })
    return stdout
  }

  /**
   * Get Lima VM information
   */
  async getVMInfo(): Promise<any> {
    try {
      const limactlPath = this.getLimactlPath()
      const { stdout } = await execAsync(`"${limactlPath}" list --json`)
      const vms = JSON.parse(stdout)
      return vms.find((vm: any) => vm.name === this.limaVMName)
    } catch {
      return null
    }
  }

  /**
   * Delete Lima VM and data
   */
  async delete(onProgress?: (message: string) => void): Promise<void> {
    const limactlPath = this.getLimactlPath()

    if (await this.vmExists()) {
      onProgress?.('Deleting Lima VM...')
      await execAsync(`"${limactlPath}" delete --force "${this.limaVMName}"`)
      onProgress?.('Lima VM deleted')
    }
  }
}
