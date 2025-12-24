import { contextBridge, ipcRenderer } from 'electron'
import type { ContainerConfig, ContainerInfo, ImageInfo, NetworkInfo, VolumeInfo } from '../main/services/container-runtime.interface'
import type { KaiConfig, ConfigValidationResult } from '../main/config/config.types'

// Helper function to create event listener APIs
function createEventListenerAPI<T>(eventName: string, callback: (data: T) => void) {
  const listener = (_event: any, data: T) => callback(data)
  ipcRenderer.on(eventName, listener)
  return () => ipcRenderer.removeListener(eventName, listener)
}

// Helper function to create event listener APIs without data
function createSimpleEventListenerAPI(eventName: string, callback: () => void) {
  const listener = () => callback()
  ipcRenderer.on(eventName, listener)
  return () => ipcRenderer.removeListener(eventName, listener)
}

// Define the API that will be exposed to the renderer
const api = {
  // Runtime
  runtime: {
    getType: () => ipcRenderer.invoke('runtime:getType') as Promise<'docker' | 'containerd' | 'lima' | 'none'>,
    getSystemInfo: () => ipcRenderer.invoke('runtime:getSystemInfo'),
    detectAvailable: () => ipcRenderer.invoke('runtime:detectAvailable') as Promise<{
      docker: boolean
      containerd: boolean
      lima: boolean
      current: 'docker' | 'containerd' | 'lima' | 'none'
    }>,
    switch: (type: 'docker' | 'containerd' | 'lima') => ipcRenderer.invoke('runtime:switch', type) as Promise<'docker' | 'containerd' | 'lima' | 'none'>,
    restart: () => ipcRenderer.invoke('runtime:restart') as Promise<void>,
    setupBundled: () => ipcRenderer.invoke('runtime:setupBundled') as Promise<{ success: boolean; runtime?: string; error?: string }>,
    onSetupProgress: (callback: (message: string) => void) =>
      createEventListenerAPI('runtime:setup-progress', callback)
  },

  // Container operations
  container: {
    list: (options?: { all?: boolean; filters?: Record<string, string[]> }) =>
      ipcRenderer.invoke('container:list', options) as Promise<ContainerInfo[]>,
    start: (config: ContainerConfig) =>
      ipcRenderer.invoke('container:start', config) as Promise<string>,
    stop: (id: string, timeout?: number) =>
      ipcRenderer.invoke('container:stop', id, timeout) as Promise<void>,
    remove: (id: string, force?: boolean) =>
      ipcRenderer.invoke('container:remove', id, force) as Promise<void>,
    restart: (id: string, timeout?: number) =>
      ipcRenderer.invoke('container:restart', id, timeout) as Promise<void>,
    inspect: (id: string) =>
      ipcRenderer.invoke('container:inspect', id) as Promise<ContainerInfo>,
    stats: (id: string) =>
      ipcRenderer.invoke('container:stats', id) as Promise<{
        cpu: number
        memory: { used: number; limit: number; percentage: number }
        network: { rx: number; tx: number }
        blockIO: { read: number; write: number }
      }>,
    getLogs: (id: string, options?: { tail?: number; follow?: boolean }) =>
      ipcRenderer.invoke('container:logs', id, options) as Promise<string>
  },

  // Image operations
  image: {
    list: () => ipcRenderer.invoke('image:list') as Promise<ImageInfo[]>,
    pull: (name: string) => ipcRenderer.invoke('image:pull', name) as Promise<void>,
    exists: (name: string) => ipcRenderer.invoke('image:exists', name) as Promise<boolean>,
    remove: (id: string, force?: boolean) =>
      ipcRenderer.invoke('image:remove', id, force) as Promise<void>,
    onPullProgress: (callback: (data: { name: string; progress: any }) => void) =>
      createEventListenerAPI('image:pullProgress', callback)
  },

  // Network operations
  network: {
    list: () => ipcRenderer.invoke('network:list') as Promise<NetworkInfo[]>,
    create: (name: string, options?: { driver?: string; internal?: boolean; attachable?: boolean }) =>
      ipcRenderer.invoke('network:create', name, options) as Promise<string>,
    remove: (id: string) => ipcRenderer.invoke('network:remove', id) as Promise<void>
  },

  // Volume operations
  volume: {
    list: () => ipcRenderer.invoke('volume:list') as Promise<VolumeInfo[]>,
    create: (name: string, options?: { driver?: string; labels?: Record<string, string> }) =>
      ipcRenderer.invoke('volume:create', name, options) as Promise<string>,
    remove: (name: string, force?: boolean) =>
      ipcRenderer.invoke('volume:remove', name, force) as Promise<void>
  },

  // System operations
  system: {
    prune: (options?: {
      containers?: boolean
      images?: boolean
      volumes?: boolean
      networks?: boolean
    }) =>
      ipcRenderer.invoke('system:prune', options) as Promise<{
        containersDeleted: number
        imagesDeleted: number
        volumesDeleted: number
        networksDeleted: number
        spaceReclaimed: number
      }>
  },

  // Configuration operations
  config: {
    get: () => ipcRenderer.invoke('config:get') as Promise<KaiConfig>,
    getValue: <K extends keyof KaiConfig>(key: K) =>
      ipcRenderer.invoke('config:getValue', key) as Promise<KaiConfig[K]>,
    set: <K extends keyof KaiConfig>(key: K, value: KaiConfig[K]) =>
      ipcRenderer.invoke('config:set', key, value) as Promise<void>,
    update: (updates: Partial<KaiConfig>) =>
      ipcRenderer.invoke('config:update', updates) as Promise<void>,
    reset: () => ipcRenderer.invoke('config:reset') as Promise<void>,
    validate: (config?: Partial<KaiConfig>) =>
      ipcRenderer.invoke('config:validate', config) as Promise<ConfigValidationResult>,
    isSetupComplete: () => ipcRenderer.invoke('config:isSetupComplete') as Promise<boolean>,
    markSetupComplete: () => ipcRenderer.invoke('config:markSetupComplete') as Promise<void>,
    getDefaultBaseDirectory: () =>
      ipcRenderer.invoke('config:getDefaultBaseDirectory') as Promise<string>,
    ensureBaseDirectory: () => ipcRenderer.invoke('config:ensureBaseDirectory') as Promise<void>,
    export: () => ipcRenderer.invoke('config:export') as Promise<string>,
    import: (json: string) => ipcRenderer.invoke('config:import', json) as Promise<void>,
    getPath: () => ipcRenderer.invoke('config:getPath') as Promise<string>
  },

  // Service operations
  service: {
    initialize: () => ipcRenderer.invoke('service:initialize') as Promise<void>,
    getAll: () => ipcRenderer.invoke('service:getAll') as Promise<any[]>,
    getStatus: (serviceName: string) => ipcRenderer.invoke('service:getStatus', serviceName),
    start: (serviceName: string) => ipcRenderer.invoke('service:start', serviceName) as Promise<void>,
    stop: (serviceName: string) => ipcRenderer.invoke('service:stop', serviceName) as Promise<void>,
    restart: (serviceName: string) => ipcRenderer.invoke('service:restart', serviceName) as Promise<void>,
    startAll: () => ipcRenderer.invoke('service:startAll') as Promise<void>,
    stopAll: () => ipcRenderer.invoke('service:stopAll') as Promise<void>,
    checkAndDownloadFlexySandboxImage: () => ipcRenderer.invoke('service:checkAndDownloadFlexySandboxImage') as Promise<void>
  },

  // Service events
  'service-events': {
    onServiceEvent: (callback: (event: { serviceName: string; eventType: string; data: any }) => void) =>
      createEventListenerAPI('service-event', callback),
    onServicesUpdated: (callback: (services: any[]) => void) =>
      createEventListenerAPI('services-updated', callback)
  },

  // Image download permission
  'image-download-permission': {
    onRequest: (callback: (request: { id: string; serviceName: string; imageName: string; size: string }) => void) =>
      createEventListenerAPI('image-download-permission-request', callback),
    respond: (requestId: string, allowed: boolean) => {
      ipcRenderer.send('image-download-permission-response', requestId, allowed)
    }
  },

  // Auto-updater operations
  update: {
    check: () => ipcRenderer.invoke('update:check') as Promise<{ available: boolean; version: string }>,
    download: () => ipcRenderer.invoke('update:download') as Promise<void>,
    install: () => ipcRenderer.invoke('update:install') as Promise<void>,
    onChecking: (callback: () => void) =>
      createSimpleEventListenerAPI('update:checking', callback),
    onAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) =>
      createEventListenerAPI('update:available', callback),
    onNotAvailable: (callback: () => void) =>
      createSimpleEventListenerAPI('update:not-available', callback),
    onError: (callback: (message: string) => void) =>
      createEventListenerAPI('update:error', callback),
    onDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) =>
      createEventListenerAPI('update:download-progress', callback),
    onDownloaded: (callback: (info: { version: string }) => void) =>
      createEventListenerAPI('update:downloaded', callback)
  },

  // Window operations
  openAInTandemWindow: () => ipcRenderer.invoke('open-aintandem-window') as Promise<void>,
  openDashboardWindow: () => ipcRenderer.invoke('open-dashboard-window') as Promise<void>,

  // App information
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo') as Promise<{
      name: string;
      version: string;
      description: string;
      author: string;
      license: string;
      homepage: string;
      repository: string;
    }>
  },

  // About dialog
  'about-dialog': {
    onShow: (callback: () => void) =>
      createSimpleEventListenerAPI('show-about-dialog', callback)
  },

  // API proxy for making requests to localhost:9900
  apiProxy: {
    request: (options: { method: string; path: string; headers?: any; body?: any }) =>
      ipcRenderer.invoke('api-proxy:request', options) as Promise<{
        statusCode: number;
        headers: any;
        data: string;
      }>
  }
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('kai', api)
contextBridge.exposeInMainWorld('__IN_AINTANDEM_DESKTOP__', true)

// Expose limited Node.js functionality for renderer (only if needed)
// NOTE: Exposing Node.js APIs to renderer can be a security risk
// Only expose what is absolutely necessary
// Check if we're in an environment where Node.js modules are available
if (typeof require !== 'undefined' && typeof process !== 'undefined') {
  try {
    const path = require('path');
    contextBridge.exposeInMainWorld('nodePath', {
      join: (...args: string[]) => path.join(...args),
      resolve: (...args: string[]) => path.resolve(...args),
      dirname: (pathStr: string) => path.dirname(pathStr),
      basename: (pathStr: string) => path.basename(pathStr),
      extname: (pathStr: string) => path.extname(pathStr)
    });
  } catch (error) {
    console.warn('Could not expose Node.js path module to renderer:', error);
  }
} else {
  console.debug('Node.js modules not available in this context, skipping path module exposure');
}

// Expose backend credentials for automatic login
contextBridge.exposeInMainWorld('aintandemCredentials', {
  getBackendCredentials: async () => {
    const DEFAULT_USERNAME = 'admin';
    const DEFAULT_PASSWORD = 'aintandem';

    if (window.kai) {
      try {
        const config = await window.kai.config.get();
        return {
          username: config.services.orchestrator.username || DEFAULT_USERNAME,
          password: config.services.orchestrator.password || DEFAULT_PASSWORD
        };
      } catch (error) {
        console.error('Could not retrieve backend credentials:', error);
        return {
          username: DEFAULT_USERNAME,
          password: DEFAULT_PASSWORD
        };
      }
    } else {
      console.warn('window.kai not available, returning default credentials');
      return {
          username: DEFAULT_USERNAME,
          password: DEFAULT_PASSWORD
      };
    }
  }
});

// Export types for TypeScript support
export type KaiAPI = typeof api
