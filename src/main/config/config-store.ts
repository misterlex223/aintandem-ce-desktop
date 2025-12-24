import { KaiConfig, defaultConfig, ConfigValidationResult, ConfigValidationError } from './config.types'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

// Dynamic import for ESM module
let Store: any = null

/**
 * Configuration store manager
 */
export class ConfigStore {
  private store: any
  private initialized: boolean = false

  async initialize() {
    if (!this.initialized) {
      if (!Store) {
        Store = (await import('electron-store')).default
      }
      this.store = new Store({
      name: 'kai-config',
      defaults: defaultConfig,
      schema: {
        setupCompleted: { type: 'boolean' },
        setupVersion: { type: 'string' },
        preferredRuntime: { type: 'string', enum: ['auto', 'docker', 'containerd', 'lima'] },
        baseDirectory: { type: 'string' },
        frontendUrl: { type: 'string' },
        services: {
          type: 'object',
          properties: {
            orchestrator: {
              type: 'object',
              properties: {
                port: { type: 'number' },
                nodeEnv: { type: 'string', enum: ['development', 'production'] }
              }
            },
            codeServer: {
              type: 'object',
              properties: {
                password: { type: 'string' },
                port: { type: 'number' }
              }
            }
          }
        },
        env: { type: 'object' },
        ui: { type: 'object' },
        updates: {
          type: 'object',
          properties: {
            autoCheck: { type: 'boolean' },
            autoDownload: { type: 'boolean' },
            autoInstall: { type: 'boolean' },
            channel: { type: 'string', enum: ['stable', 'beta', 'alpha'] }
          }
        }
      }
    })
      this.initialized = true
    }
  }

  /**
   * Get the entire configuration
   */
  getConfig(): KaiConfig {
    return this.store.store
  }

  /**
   * Get a specific config value
   */
  get<K extends keyof KaiConfig>(key: K): KaiConfig[K] {
    return this.store.get(key)
  }

  /**
   * Set a specific config value
   */
  set<K extends keyof KaiConfig>(key: K, value: KaiConfig[K]): void {
    this.store.set(key, value)
  }

  /**
   * Update multiple config values
   */
  update(updates: Partial<KaiConfig>): void {
    Object.entries(updates).forEach(([key, value]) => {
      this.store.set(key as keyof KaiConfig, value as any)
    })
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.store.clear()
    this.store.store = defaultConfig
  }

  /**
   * Check if setup is complete
   */
  isSetupComplete(): boolean {
    return this.store.get('setupCompleted')
  }

  /**
   * Mark setup as complete
   */
  markSetupComplete(): void {
    this.store.set('setupCompleted', true)
  }

  /**
   * Validate configuration
   */
  validate(config?: Partial<KaiConfig>): ConfigValidationResult {
    const errors: ConfigValidationError[] = []
    const cfg = config || this.getConfig()

    // Validate base directory
    if (cfg.baseDirectory) {
      if (!path.isAbsolute(cfg.baseDirectory)) {
        errors.push({
          field: 'baseDirectory',
          message: 'Base directory must be an absolute path'
        })
      }
    } else if (config) {
      errors.push({
        field: 'baseDirectory',
        message: 'Base directory is required'
      })
    }


    // Validate Code Server password
    if (config?.services?.codeServer?.password !== undefined) {
      const password = config.services.codeServer.password
      if (password && password.length < 6) {
        errors.push({
          field: 'services.codeServer.password',
          message: 'Code Server password must be at least 6 characters'
        })
      }
    }

    // Validate cloud frontend URL
    if (config?.frontendUrl !== undefined && config.frontendUrl) {
      try {
        new URL(config.frontendUrl)
      } catch {
        errors.push({
          field: 'frontendUrl',
          message: 'Frontend URL must be a valid URL'
        })
      }
    }

    // Validate ports
    const ports = [
      { field: 'services.orchestrator.port', value: config?.services?.orchestrator?.port },
      { field: 'services.codeServer.port', value: config?.services?.codeServer?.port }
    ]

    ports.forEach(({ field, value }) => {
      if (value !== undefined) {
        if (value < 1 || value > 65535) {
          errors.push({
            field,
            message: 'Port must be between 1 and 65535'
          })
        }
      }
    })

    // Validate updates configuration if present
    if (config?.updates) {
      if (config.updates.channel && !['stable', 'beta', 'alpha'].includes(config.updates.channel)) {
        errors.push({
          field: 'updates.channel',
          message: 'Update channel must be one of: stable, beta, alpha'
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Ensure base directory exists
   */
  async ensureBaseDirectory(): Promise<void> {
    const baseDir = this.get('baseDirectory')
    if (!baseDir) {
      throw new Error('Base directory not configured')
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }
  }

  /**
   * Get default base directory suggestion
   */
  getDefaultBaseDirectory(): string {
    return path.join(homedir(), 'AiTBase')
  }

  /**
   * Export configuration to JSON
   */
  export(): string {
    return JSON.stringify(this.getConfig(), null, 2)
  }

  /**
   * Import configuration from JSON
   */
  import(json: string): void {
    try {
      const config = JSON.parse(json) as KaiConfig
      const validation = this.validate(config)
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.map(e => e.message).join(', ')}`)
      }
      Object.entries(config).forEach(([key, value]) => {
        this.store.set(key as keyof KaiConfig, value)
      })
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`)
    }
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.store.path
  }
}

// Singleton instance
let configStoreInstance: ConfigStore | null = null
let initPromise: Promise<void> | null = null

/**
 * Get global config store instance (async initialization)
 */
export async function getConfigStore(): Promise<ConfigStore> {
  if (!configStoreInstance) {
    configStoreInstance = new ConfigStore()
    initPromise = configStoreInstance.initialize()
  }
  if (initPromise) {
    await initPromise
    initPromise = null
  }
  return configStoreInstance
}

/**
 * Get config store synchronously (must be called after initialization)
 * @deprecated Use getConfigStore() instead
 */
export function getConfigStoreSync(): ConfigStore {
  if (!configStoreInstance || !configStoreInstance['initialized']) {
    throw new Error('ConfigStore not initialized. Call getConfigStore() first.')
  }
  return configStoreInstance
}
