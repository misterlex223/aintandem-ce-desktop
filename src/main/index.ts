import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { getContainerManager } from './services/container-manager'
import { getConfigStore, getConfigStoreSync } from './config/config-store'
import { getServiceManager } from './services/service-manager'
import { getImageLoader } from './services/image-loader'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Kai Desktop',
    show: false // Don't show until ready
  })

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Minimize to tray instead of closing (macOS/Windows)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && (process.platform === 'darwin' || process.platform === 'win32')) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

// System tray setup
function createTray() {
  // Create a simple 16x16 icon (you should replace this with actual icon files)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEbSURBVDiNpZKxSgNBEIa/2b0kJyFgI1gIFoKFhY2FhY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NhY2FhRBIISRgISQQSHI7M9bZXHKJhQ/LzPD/M7Mz/wjgH6UUAEopAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAUkoApJQASCkBkFICIKUEQEoJgJQSACklAFJKAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAUkoApJQASCkBkFICIKUEQEoJgJQSACklAFJKAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAn1kcZDLNPvwAAAAASUVORK5CYII='
  )

  tray = new Tray(icon)
  tray.setToolTip('Kai Desktop')

  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
      }
    }
  })
}

async function updateTrayMenu() {
  if (!tray) return

  try {
    const manager = getContainerManager()

    // Check if runtime is initialized
    if (!manager.isInitialized()) {
      // Show minimal menu when not initialized
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Kai Desktop', type: 'normal', enabled: false },
        { type: 'separator' },
        { label: 'Container runtime not ready', type: 'normal', enabled: false },
        { type: 'separator' },
        { label: 'Show Window', click: () => mainWindow?.show() },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
      ])
      tray.setContextMenu(contextMenu)
      return
    }

    const serviceManager = getServiceManager(manager.getRuntime())
    const services = await serviceManager.getServicesStatus()

    const runningCount = services.filter(s => s.status === 'running').length
    const totalCount = services.length

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Kai Desktop',
        type: 'normal',
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: `Services: ${runningCount}/${totalCount} running`,
        type: 'normal',
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: 'Start All Services',
        type: 'normal',
        click: async () => {
          try {
            await serviceManager.startAll()
            updateTrayMenu()
            mainWindow?.webContents.send('services:updated')
          } catch (error) {
            console.error('Failed to start all services:', error)
          }
        }
      },
      {
        label: 'Stop All Services',
        type: 'normal',
        click: async () => {
          try {
            await serviceManager.stopAll()
            updateTrayMenu()
            mainWindow?.webContents.send('services:updated')
          } catch (error) {
            console.error('Failed to stop all services:', error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Show Window',
        type: 'normal',
        click: () => {
          mainWindow?.show()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        type: 'normal',
        click: () => {
          app.isQuitting = true
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
  } catch (error) {
    console.error('Failed to update tray menu:', error)
  }
}

// Auto-updater configuration
function setupAutoUpdater() {
  // Configure auto-updater
  autoUpdater.autoDownload = false // Don't auto-download, ask user first
  autoUpdater.autoInstallOnAppQuit = true

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...')
    mainWindow?.webContents.send('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info.version)
    mainWindow?.webContents.send('update:not-available')
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
    mainWindow?.webContents.send('update:error', err.message)
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${progress.percent.toFixed(2)}%`)
    mainWindow?.webContents.send('update:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    mainWindow?.webContents.send('update:downloaded', {
      version: info.version
    })
  })

  // Check for updates on startup (production only)
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Failed to check for updates:', err)
      })
    }, 3000) // Wait 3s after startup
  }
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('Kai Desktop starting...')

  try {
    // Initialize config store first
    await getConfigStore()
    console.log('Config store initialized')

    // Initialize container runtime
    const containerManager = getContainerManager()
    await containerManager.initialize()
    console.log(`Container runtime initialized: ${containerManager.getRuntimeType()}`)

    // Load bundled images on first launch
    const imageLoader = getImageLoader()
    const runtimeType = containerManager.getRuntimeType()
    if (runtimeType !== 'none') {
      try {
        await imageLoader.loadBackendImage(runtimeType, (message) => {
          console.log(`[Image Loader] ${message}`)
        })
      } catch (error) {
        console.error('Failed to load bundled images:', error)
        // Non-fatal error, continue startup
      }
    }
  } catch (error) {
    console.error('Failed to initialize container runtime:', error)
    // Still create window to show error to user
  }

  createWindow()

  // Setup system tray
  createTray()

  // Setup auto-updater after window is created
  setupAutoUpdater()

  // Update tray menu periodically
  setInterval(updateTrayMenu, 30000) // Update every 30 seconds

  // Start health monitoring and auto-restart for essential services
  try {
    const manager = getContainerManager()
    const serviceManager = getServiceManager(manager.getRuntime())
    serviceManager.startHealthMonitoring()
  } catch (error) {
    console.error('Failed to start health monitoring:', error)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit on window close if tray is active (except on Linux)
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    app.quit()
  }
})

// Declare isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

// IPC Handlers

// Container Runtime Info
ipcMain.handle('runtime:getType', async () => {
  const manager = getContainerManager()
  return manager.getRuntimeType()
})

ipcMain.handle('runtime:getSystemInfo', async () => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.getSystemInfo()
})

ipcMain.handle('runtime:detectAvailable', async () => {
  const manager = getContainerManager()
  return manager.detectAvailableRuntimes()
})

ipcMain.handle('runtime:switch', async (_event, type: 'docker' | 'containerd') => {
  const manager = getContainerManager()
  await manager.switchRuntime(type)
  return manager.getRuntimeType()
})

ipcMain.handle('runtime:restart', async () => {
  // Restart the app to apply runtime changes
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('runtime:setupBundled', async (event) => {
  try {
    console.log('[Runtime Setup] Starting bundled runtime setup...')
    event.sender.send('runtime:setup-progress', 'Starting runtime setup...')

    const platform = process.platform

    // Determine which runtime to set up
    let runtimeType: 'lima' | 'containerd' | 'docker' = 'docker'
    if (platform === 'darwin') {
      runtimeType = 'lima'
      event.sender.send('runtime:setup-progress', 'Setting up Lima runtime for macOS...')
    } else {
      runtimeType = 'containerd'
      event.sender.send('runtime:setup-progress', 'Setting up containerd runtime...')
    }

    // Import adapters
    const { LimaAdapter } = await import('./services/lima-adapter')

    if (runtimeType === 'lima') {
      const limaAdapter = new LimaAdapter()
      const limaManager = limaAdapter.getLimaManager()

      // Initialize (copy files, extract guestagent)
      event.sender.send('runtime:setup-progress', 'Copying Lima files...')
      await limaManager.initialize((message) => {
        event.sender.send('runtime:setup-progress', message)
      })

      // Start VM
      event.sender.send('runtime:setup-progress', 'Starting Lima VM...')
      await limaManager.start((message) => {
        event.sender.send('runtime:setup-progress', message)
      })

      event.sender.send('runtime:setup-progress', 'Lima runtime setup completed successfully!')
      return { success: true, runtime: 'lima' }
    } else {
      const bundledRuntime = await import('./services/bundled-runtime').then(m => m.getBundledRuntime())

      // Initialize bundled runtime
      event.sender.send('runtime:setup-progress', 'Initializing bundled runtime...')
      await bundledRuntime.initialize((message) => {
        event.sender.send('runtime:setup-progress', message)
      })

      event.sender.send('runtime:setup-progress', 'Containerd runtime setup completed successfully!')
      return { success: true, runtime: 'containerd' }
    }
  } catch (error: any) {
    console.error('[Runtime Setup] Failed:', error)
    event.sender.send('runtime:setup-progress', `Error: ${error.message}`)
    return { success: false, error: error.message }
  }
})

// Container Management
ipcMain.handle('container:list', async (_event, options) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.listContainers(options)
})

ipcMain.handle('container:start', async (_event, config) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.startContainer(config)
})

ipcMain.handle('container:stop', async (_event, id, timeout) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.stopContainer(id, timeout)
})

ipcMain.handle('container:remove', async (_event, id, force) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.removeContainer(id, force)
})

ipcMain.handle('container:restart', async (_event, id, timeout) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.restartContainer(id, timeout)
})

ipcMain.handle('container:inspect', async (_event, id) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.inspectContainer(id)
})

ipcMain.handle('container:stats', async (_event, id) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.getContainerStats(id)
})

ipcMain.handle('container:logs', async (_event, id, options) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.getContainerLogs(id, options)
})

// Image Management
ipcMain.handle('image:list', async () => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.listImages()
})

ipcMain.handle('image:pull', async (_event, name) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()

  return new Promise((resolve, reject) => {
    runtime
      .pullImage(name, progress => {
        // Send progress updates to renderer
        mainWindow?.webContents.send('image:pullProgress', { name, progress })
      })
      .then(resolve)
      .catch(reject)
  })
})

ipcMain.handle('image:exists', async (_event, name) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.imageExists(name)
})

ipcMain.handle('image:remove', async (_event, id, force) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.removeImage(id, force)
})

// Network Management
ipcMain.handle('network:list', async () => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.listNetworks()
})

ipcMain.handle('network:create', async (_event, name, options) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.createNetwork(name, options)
})

ipcMain.handle('network:remove', async (_event, id) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.removeNetwork(id)
})

// Volume Management
ipcMain.handle('volume:list', async () => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.listVolumes()
})

ipcMain.handle('volume:create', async (_event, name, options) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.createVolume(name, options)
})

ipcMain.handle('volume:remove', async (_event, name, force) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.removeVolume(name, force)
})

// System Operations
ipcMain.handle('system:prune', async (_event, options) => {
  const manager = getContainerManager()
  const runtime = manager.getRuntime()
  return runtime.prune(options)
})

// Configuration Management
ipcMain.handle('config:get', async () => {
  const configStore = getConfigStoreSync()
  return configStore.getConfig()
})

ipcMain.handle('config:getValue', async (_event, key) => {
  const configStore = getConfigStoreSync()
  return configStore.get(key)
})

ipcMain.handle('config:set', async (_event, key, value) => {
  const configStore = getConfigStoreSync()
  configStore.set(key, value)
})

ipcMain.handle('config:update', async (_event, updates) => {
  const configStore = getConfigStoreSync()
  configStore.update(updates)
})

ipcMain.handle('config:reset', async () => {
  const configStore = getConfigStoreSync()
  configStore.reset()
})

ipcMain.handle('config:validate', async (_event, config) => {
  const configStore = getConfigStoreSync()
  return configStore.validate(config)
})

ipcMain.handle('config:isSetupComplete', async () => {
  const configStore = getConfigStoreSync()
  return configStore.isSetupComplete()
})

ipcMain.handle('config:markSetupComplete', async () => {
  const configStore = getConfigStoreSync()
  configStore.markSetupComplete()
})

ipcMain.handle('config:getDefaultBaseDirectory', async () => {
  const configStore = getConfigStoreSync()
  return configStore.getDefaultBaseDirectory()
})

ipcMain.handle('config:ensureBaseDirectory', async () => {
  const configStore = getConfigStoreSync()
  return configStore.ensureBaseDirectory()
})

ipcMain.handle('config:export', async () => {
  const configStore = getConfigStoreSync()
  return configStore.export()
})

ipcMain.handle('config:import', async (_event, json) => {
  const configStore = getConfigStoreSync()
  configStore.import(json)
})

ipcMain.handle('config:getPath', async () => {
  const configStore = getConfigStoreSync()
  return configStore.getConfigPath()
})

// Service Management
ipcMain.handle('service:initialize', async () => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.initialize()
})

ipcMain.handle('service:getAll', async () => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.getServicesStatus()
})

ipcMain.handle('service:getStatus', async (_event, serviceName) => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.getServiceStatus(serviceName)
})

ipcMain.handle('service:start', async (_event, serviceName) => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.startService(serviceName)
})

ipcMain.handle('service:stop', async (_event, serviceName) => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.stopService(serviceName)
})

ipcMain.handle('service:restart', async (_event, serviceName) => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.restartService(serviceName)
})

ipcMain.handle('service:startAll', async () => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.startAll()
})

ipcMain.handle('service:stopAll', async () => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.stopAll()
})

// Auto-updater Management
ipcMain.handle('update:check', async () => {
  if (process.env.NODE_ENV === 'development') {
    return { available: false, version: 'dev' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    return {
      available: result !== null,
      version: result?.updateInfo?.version || 'unknown'
    }
  } catch (error) {
    throw new Error(`Failed to check for updates: ${error}`)
  }
})

ipcMain.handle('update:download', async () => {
  if (process.env.NODE_ENV === 'development') {
    throw new Error('Updates not available in development mode')
  }
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    throw new Error(`Failed to download update: ${error}`)
  }
})

ipcMain.handle('update:install', async () => {
  if (process.env.NODE_ENV === 'development') {
    throw new Error('Updates not available in development mode')
  }
  // This will quit the app and install the update
  autoUpdater.quitAndInstall(false, true)
})

console.log('IPC handlers registered')
