import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ImageManifest {
  imageName: string
  fileName: string
  exportedAt: string
  size: string
}

/**
 * Image Loader - Loads bundled Docker images on first launch
 */
export class ImageLoader {
  private resourcesPath: string

  constructor() {
    // In development, resources are in kai-desktop/resources
    // In production, resources are in app.asar or extraResources
    this.resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'resources')
      : join(app.getAppPath(), 'resources')
  }

  /**
   * Load bundled backend image if not already present
   */
  async loadBackendImage(
    runtimeType: 'docker' | 'containerd',
    onProgress?: (message: string) => void
  ): Promise<void> {
    const manifestPath = join(this.resourcesPath, 'image-manifest.json')
    const imagePath = join(this.resourcesPath, 'kai-backend-image.tar.gz')

    // Check if manifest exists
    if (!existsSync(manifestPath)) {
      console.log('No bundled image manifest found, skipping image load')
      return
    }

    // Read manifest
    const manifest: ImageManifest = JSON.parse(
      readFileSync(manifestPath, 'utf-8')
    )

    onProgress?.(`Checking for bundled image: ${manifest.imageName}`)

    // Check if image file exists
    if (!existsSync(imagePath)) {
      console.log(`Bundled image file not found: ${imagePath}`)
      return
    }

    // Check if image already exists in the runtime
    const imageExists = await this.checkImageExists(
      runtimeType,
      manifest.imageName
    )

    if (imageExists) {
      console.log(`Image ${manifest.imageName} already exists, skipping load`)
      onProgress?.(`Image ${manifest.imageName} already available`)
      return
    }

    // Load image
    onProgress?.(
      `Loading bundled image ${manifest.imageName} (${manifest.size})...`
    )
    await this.loadImage(runtimeType, imagePath, manifest.imageName)
    onProgress?.(`✓ Image ${manifest.imageName} loaded successfully`)
  }

  /**
   * Check if image exists in the container runtime
   */
  private async checkImageExists(
    runtimeType: 'docker' | 'containerd',
    imageName: string
  ): Promise<boolean> {
    try {
      if (runtimeType === 'docker') {
        await execAsync(`docker image inspect ${imageName}`)
        return true
      } else {
        await execAsync(`nerdctl --namespace kai inspect --type image ${imageName}`)
        return true
      }
    } catch {
      return false
    }
  }

  /**
   * Load image from tarball into container runtime
   */
  private async loadImage(
    runtimeType: 'docker' | 'containerd',
    imagePath: string,
    imageName: string
  ): Promise<void> {
    console.log(`Loading image ${imageName} from ${imagePath}...`)

    try {
      if (runtimeType === 'docker') {
        // Docker load
        await execAsync(`gunzip -c "${imagePath}" | docker load`)
      } else {
        // nerdctl load (containerd)
        await execAsync(
          `gunzip -c "${imagePath}" | nerdctl --namespace kai load`
        )
      }
      console.log(`✓ Image ${imageName} loaded successfully`)
    } catch (error) {
      console.error(`Failed to load image ${imageName}:`, error)
      throw new Error(`Failed to load bundled image: ${error}`)
    }
  }

  /**
   * Get list of bundled images
   */
  async getBundledImages(): Promise<ImageManifest[]> {
    const manifestPath = join(this.resourcesPath, 'image-manifest.json')

    if (!existsSync(manifestPath)) {
      return []
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      return [manifest] // Currently only backend image, but can expand to array
    } catch {
      return []
    }
  }
}

// Singleton instance
let imageLoaderInstance: ImageLoader | null = null

/**
 * Get global image loader instance
 */
export function getImageLoader(): ImageLoader {
  if (!imageLoaderInstance) {
    imageLoaderInstance = new ImageLoader()
  }
  return imageLoaderInstance
}
