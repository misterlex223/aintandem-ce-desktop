import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { getContainerManager } from './services/container-manager'
import { getConfigStore, getConfigStoreSync } from './config/config-store'
import { getServiceManager } from './services/service-manager'
import { getImageLoader } from './services/image-loader'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dashboardWindow: BrowserWindow | null = null
let aintandemWindowCount = 0;
let isQuitting = false


// Helper function to create a window with common configuration
function createWindowBase(showDevTools: boolean = false, urlPath: string = ''): BrowserWindow {
  const window = new BrowserWindow({
    width: 600,
    height: 720,
    minWidth: 600,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false // Don't show until ready
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    let url = 'http://localhost:5173';
    if (urlPath) {
      url += urlPath;
    }
    window.loadURL(url);
    if (showDevTools) {
      window.webContents.openDevTools();
    }
  } else {
    if (urlPath) {
      window.loadFile(join(__dirname, '../renderer/index.html'), { hash: urlPath.substring(1) }); // Remove '#' from hash
    } else {
      window.loadFile(join(__dirname, '../renderer/index.html'));
    }
  }

  // Show window when ready
  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

// Function to create the main application window
function createWindow() {
  mainWindow = createWindowBase(true); // Show dev tools for main window in dev
  mainWindow.setTitle('AInTandem');

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Minimize to tray instead of closing (Windows only, macOS follows system convention)
  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'win32') {
      event.preventDefault()
      mainWindow?.hide()
    }
    // On macOS, the window close should follow system conventions
    // The app stays running if there are background services, but can be quit via Cmd+Q or dock menu
  })
}

// Function to open or show the Dashboard window (single instance)
function openDashboardWindow(onReady?: () => void) {
  if (dashboardWindow) {
    // If dashboard window exists, bring it to focus
    if (dashboardWindow.isMinimized()) {
      dashboardWindow.restore();
    }
    dashboardWindow.focus();

    // Execute callback if provided
    if (onReady) {
      onReady();
    }
  } else {
    // Create a new dashboard window
    dashboardWindow = createWindowBase(false, '/#dashboard'); // Don't show dev tools, load dashboard route
    dashboardWindow.setTitle('AInTandem - Dashboard');

    // Execute callback when window is ready
    dashboardWindow.webContents.once('dom-ready', () => {
      if (onReady) {
        onReady();
      }
    });

    dashboardWindow.show(); // Show immediately for dashboard

    // Register the dashboard window with the service manager to receive events
    try {
      const manager = getContainerManager();
      const serviceManager = getServiceManager(manager.getRuntime());
      serviceManager.registerWindow(dashboardWindow);

      // Clean up when window is closed
      dashboardWindow.on('closed', () => {
        serviceManager.unregisterWindow(dashboardWindow!);
        dashboardWindow = null; // Clear the reference when window is closed
      });
    } catch (error) {
      console.error('Failed to register dashboard window with service manager:', error);
      // Handle window closed even if registration fails
      dashboardWindow.on('closed', () => {
        dashboardWindow = null;
      });
    }
  }
}

// Function to check if all essential services are running
async function areAllEssentialServicesRunning(): Promise<boolean> {
  try {
    const manager = getContainerManager();
    if (!manager.isInitialized()) {
      return false;
    }

    const serviceManager = getServiceManager(manager.getRuntime());
    const services = await serviceManager.getServicesStatus();

    // Check if all essential services are running
    const allEssentialRunning = services.every(
      (service: any) => !service.essential || service.status === 'running'
    );

    return allEssentialRunning;
  } catch (error) {
    console.error('Error checking service status:', error);
    return false;
  }
}

// Function to open a new AInTandem window (multiple instances allowed)
function openAInTandemWindow() {
  const aintandemWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: `AInTandem Window ${++aintandemWindowCount}`,
    show: true
  });

  // Load the AInTandem frontend
  if (process.env.NODE_ENV === 'development') {
    aintandemWindow.loadURL('http://localhost:9901');
  } else {
    // In production, load from local file or API endpoint as appropriate
    aintandemWindow.loadURL('http://localhost:9901');
  }

  // Check for login page and perform automatic login if credentials are available
  aintandemWindow.webContents.on('did-finish-load', async () => {
    try {
      // Get the current URL
      const currentURL = aintandemWindow.webContents.getURL();

      // Check if the URL contains /login
      if (currentURL.includes('/login')) {
        // Execute script to perform automatic login using only ID selectors
        const loginScript = `
          (function() {
            // Wait for the page to fully load
            setTimeout(async () => {
              if (window.aintandemCredentials) {
                try {
                  const creds = await window.aintandemCredentials.getBackendCredentials();

                  // Select fields using only their IDs
                  const usernameField = document.querySelector('#username');
                  const passwordField = document.querySelector('#password');

                  if (usernameField && passwordField) {
                    // Use native input value setter to properly update the field for frameworks like React
                    const setNativeValue = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype,
                      'value'
                    ).set;

                    // Fill in the username using the native setter
                    setNativeValue.call(usernameField, creds.username);
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameField.dispatchEvent(new Event('change', { bubbles: true }));

                    // Fill in the password using keyboard events character by character
                    // Clear the field first
                    setNativeValue.call(passwordField, '');
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));

                    // Type each character of the password individually
                    const password = creds.password;
                    for (let i = 0; i < password.length; i++) {
                      const char = password[i];

                      // Insert the character
                      const start = passwordField.selectionStart || i;
                      const end = passwordField.selectionEnd || i;
                      const currentValue = passwordField.value;
                      const newValue = currentValue.substring(0, start) + char + currentValue.substring(end);

                      // Use the native setter to update the value
                      setNativeValue.call(passwordField, newValue);

                      // Update cursor position
                      passwordField.setSelectionRange(start + 1, start + 1);

                      // Dispatch input event for each character
                      passwordField.dispatchEvent(new InputEvent('input', {
                        inputType: 'insertText',
                        data: char,
                        bubbles: true,
                        cancelable: true
                      }));

                      // Dispatch keyboard events
                      passwordField.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                      passwordField.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                      passwordField.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                    }

                    // Final input and change events after typing is complete
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));

                    // Find and click the submit button
                    const submitButton = document.querySelector('form button[type="submit"]');
                    if (submitButton) {
                      submitButton.click();
                    }
                    console.log('Auto login !!!');
                  }
                } catch (error) {
                  console.error('Automatic login failed:', error);
                }
              }
            }, 1500); // Wait 1.5 seconds for page to load
          })();
        `;

        await aintandemWindow.webContents.executeJavaScript(loginScript);
      }
    } catch (error) {
      console.error('Error during automatic login check:', error);
    }
  });

  // Register the AInTandem window with the service manager to receive events
  try {
    const manager = getContainerManager();
    const serviceManager = getServiceManager(manager.getRuntime());
    serviceManager.registerWindow(aintandemWindow);

    // Handle window closed
    aintandemWindow.on('closed', () => {
      serviceManager.unregisterWindow(aintandemWindow);
      // Decrement the counter when window is closed
      aintandemWindowCount = Math.max(0, aintandemWindowCount - 1);
    });
  } catch (error) {
    console.error('Failed to register AInTandem window with service manager:', error);
    // Handle window closed even if registration fails
    aintandemWindow.on('closed', () => {
      // Decrement the counter when window is closed
      aintandemWindowCount = Math.max(0, aintandemWindowCount - 1);
    });
  }

  return aintandemWindow;
}

// System tray setup
function createTray() {
  // Create a simple 16x16 icon (you should replace this with actual icon files)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEbSURBVDiNpZKxSgNBEIa/2b0kJyFgI1gIFoKFhY2FhY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NhY2FhRBIISRgISQQSHI7M9bZXHKJhQ/LzPD/M7Mz/wjgH6UUAEopAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAUkoApJQASCkBkFICIKUEQEoJgJQSACklAFJKAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAUkoApJQASCkBkFICIKUEQEoJgJQSACklAFJKAKSUAEgpAZBSAiClBEBKCYCUEgApJQBSSgCklABIKQGQUgIgpQRASgmAlBIAKSUAn1kcZDLNPvwAAAAASUVORK5CYII='
  )

  tray = new Tray(icon)
  tray.setToolTip('AInTandem')

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
        { label: 'AInTandem', type: 'normal', enabled: false },
        { type: 'separator' },
        { label: 'Container runtime not ready', type: 'normal', enabled: false },
        { type: 'separator' },
        { label: 'Show Window', click: () => mainWindow?.show() },
        { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
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
        label: 'AInTandem',
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
          isQuitting = true
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
  // Set app name for development mode
  if (process.env.NODE_ENV === 'development') {
    app.setName('AInTandem Dev');
  }

  console.log('AInTandem starting...')

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
    serviceManager.setMainWindow(mainWindow) // Set main window for event emission
    serviceManager.startHealthMonitoring()
  } catch (error) {
    console.error('Failed to start health monitoring:', error)
  }

  // Determine which window to open based on service status
  try {
    const allServicesRunning = await areAllEssentialServicesRunning();
    if (allServicesRunning) {
      // If all services are running, open AInTandem window
      openAInTandemWindow();
    } else {
      // If not all services are running, open Dashboard window
      openDashboardWindow();
    }
  } catch (error) {
    console.error('Error determining service status, defaulting to Dashboard:', error);
    // If there's an error checking service status, default to opening Dashboard
    openDashboardWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // When all windows are closed and app is activated again,
      // determine which window to reopen based on service status
      areAllEssentialServicesRunning()
        .then(allServicesRunning => {
          if (allServicesRunning) {
            openAInTandemWindow();
          } else {
            openDashboardWindow();
          }
        })
        .catch(err => {
          console.error('Error on app activation:', err);
          openDashboardWindow();
        });
    }
  })

  // Handle macOS quit command (Cmd+Q) and ensure proper cleanup
  app.on('before-quit', () => {
    isQuitting = true;
  })

  // Register global shortcuts
  app.on('browser-window-focus', () => {
    // When a window gains focus, we could potentially register shortcuts
    // but Electron doesn't allow dynamic global shortcut registration
  });

  // Create application menu
  const menuTemplate: import('electron').MenuItemConstructorOptions[] = [
    // { app.name } menu (macOS only)
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        {
          label: 'About AInTandem Desktop',
          click: () => {
            // If dashboard window exists, bring it to front and send event
            if (dashboardWindow) {
              if (dashboardWindow.isMinimized()) {
                dashboardWindow.restore();
              }
              dashboardWindow.show();
              dashboardWindow.focus();
              dashboardWindow.webContents.send('show-about-dialog');
            }
            // If dashboard window doesn't exist, create it and send event when ready
            else {
              openDashboardWindow(() => {
                // This callback is executed when the dashboard window is ready
                if (dashboardWindow) {
                  dashboardWindow.webContents.send('show-about-dialog');
                } else if (mainWindow) {
                  // Fallback to main window if dashboard creation fails
                  if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                  }
                  mainWindow.show();
                  mainWindow.focus();
                  mainWindow.webContents.send('show-about-dialog');
                }
              });
            }
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Cmd+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Dashboard',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            openDashboardWindow();
          }
        },
        {
          label: 'Open AInTandem Window',
          accelerator: 'CmdOrCtrl+A',
          click: () => {
            openAInTandemWindow();
          }
        },
        ...(process.platform !== 'darwin' ? [
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: 'Alt+F4',
            click: () => {
              isQuitting = true;
              app.quit();
            }
          }
        ] : [])
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin' ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow && !focusedWindow.isDestroyed()) {
              // For the main window, follow the existing behavior (hide instead of close on macOS/Windows)
              if (focusedWindow === mainWindow) {
                if (process.platform === 'darwin') {
                  focusedWindow.hide(); // On macOS, hide main window instead of closing
                } else {
                  focusedWindow.hide(); // On Windows, hide to tray as per existing behavior
                }
              } else {
                // For other windows (dashboard, AInTandem), close normally
                focusedWindow.close();
              }
            }
          }
        },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          // On non-macOS, the close functionality is handled by the menu item above
        ])
      ]
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AInTandem Desktop',
          click: () => {
            // If dashboard window exists, bring it to front and send event
            if (dashboardWindow) {
              if (dashboardWindow.isMinimized()) {
                dashboardWindow.restore();
              }
              dashboardWindow.show();
              dashboardWindow.focus();
              dashboardWindow.webContents.send('show-about-dialog');
            }
            // If dashboard window doesn't exist, create it and send event when ready
            else {
              openDashboardWindow(() => {
                // This callback is executed when the dashboard window is ready
                if (dashboardWindow) {
                  dashboardWindow.webContents.send('show-about-dialog');
                } else if (mainWindow) {
                  // Fallback to main window if dashboard creation fails
                  if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                  }
                  mainWindow.show();
                  mainWindow.focus();
                  mainWindow.webContents.send('show-about-dialog');
                }
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://github.com/aintandem/kai-desktop');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
})

app.on('window-all-closed', () => {
  // On macOS, don't quit the app when windows are closed to follow system conventions
  // The app should only quit when the user explicitly chooses "Quit" from the menu
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


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

// Check and download flexy-sandbox image if needed
ipcMain.handle('service:checkAndDownloadFlexySandboxImage', async () => {
  const manager = getContainerManager()
  const serviceManager = getServiceManager(manager.getRuntime())
  return serviceManager.checkAndDownloadFlexySandboxImage()
})

// Handle image download permission response
ipcMain.on('image-download-permission-response', (event, responseId, allowed) => {
  // Forward the response back to the service manager
  // The service manager has its own listener for this event
  console.log(`Permission response for ${responseId}: ${allowed}`)
})

// Listen for permission requests from the service manager and forward to renderer
// This is handled by the service manager's requestImageDownloadPermission method

// Open AInTandem window in new BrowserWindow
ipcMain.handle('open-aintandem-window', async () => {
  openAInTandemWindow();
  return { success: true };
});

// Open Dashboard window (single instance)
ipcMain.handle('open-dashboard-window', async () => {
  openDashboardWindow();
  return { success: true };
});

// Get app information
ipcMain.handle('app:getInfo', async () => {
  // Get package.json information
  const packagePath = join(app.getAppPath(), 'package.json');
  let packageInfo = {};

  try {
    const fs = require('fs');
    packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    console.error('Failed to read package.json:', error);
  }

  return {
    name: packageInfo['productName'] || app.getName(),
    version: app.getVersion(),
    description: packageInfo['description'] || 'AInTandem Desktop',
    author: packageInfo['author'] || 'AInTandem Team',
    license: packageInfo['license'] || 'AGPLv3',
    homepage: packageInfo['homepage'] || packageInfo['repository']?.['url'] || 'https://github.com/aintandem/kai-desktop',
    repository: packageInfo['repository']?.['url'] || 'https://github.com/aintandem/kai-desktop'
  };
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

