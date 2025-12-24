/**
 * Configuration types for AInTandem Desktop
 */

export interface KaiConfig {
  // Setup status
  setupCompleted: boolean
  setupVersion: string // Track which setup version was completed

  // Runtime
  preferredRuntime: 'auto' | 'docker' | 'containerd' | 'lima'

  // Paths
  baseDirectory: string // KAI_BASE_ROOT

  // Services
  services: {
    orchestrator: {
      port: number
      nodeEnv: 'development' | 'production'
      username?: string
      password?: string
    }
    codeServer: {
      password: string
      port: number
    }
  }

  // Cloud frontend
  frontendUrl: string

  // Advanced environment variables (from docker-compose.yml)
  env: {
    // Docker configuration
    dockerNetwork: string
    imageName: string

    // Persistent AI session configuration
    enablePersistentAiSessions: boolean
    aiSessionMode: 'interactive' | 'batch'
    taskCompletionTimeout: number

    // Context system configuration
    contextEnabled: boolean
    embeddingProvider: 'openai' | 'local'
    embeddingModel: string
    embeddingDimensions: number
    autoCaptureEnabled: boolean
    extractFactsEnabled: boolean

    // User permissions
    userId: number
    groupId: number
  }

  // UI preferences
  ui: {
    theme: 'light' | 'dark' | 'system'
    startMinimized: boolean
    minimizeToTray: boolean
  }

  // Update preferences
  updates: {
    autoCheck: boolean
    autoDownload: boolean
    autoInstall: boolean
    channel: 'stable' | 'beta' | 'alpha'
  }
}

/**
 * Default configuration values
 * Note: 'auto' mode prioritizes bundled runtime (Lima on macOS, containerd on Linux/Windows)
 * over Docker Desktop (optional developer mode)
 */
export const defaultConfig: KaiConfig = {
  setupCompleted: false,
  setupVersion: '1.0.0',
  preferredRuntime: 'auto',
  baseDirectory: '',
  services: {
    orchestrator: {
      port: 9900,
      nodeEnv: 'production',
      username: 'admin',
      password: 'aintandem'
    },
    codeServer: {
      password: '',
      port: 8443
    }
  },
  frontendUrl: 'https://console.aintandem.org',
  env: {
    dockerNetwork: 'aintandem-net',
    imageName: 'flexy-dev-sandbox:latest',
    enablePersistentAiSessions: true,
    aiSessionMode: 'interactive',
    taskCompletionTimeout: 120000,
    contextEnabled: true,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    autoCaptureEnabled: true,
    extractFactsEnabled: true,
    userId: 1000,
    groupId: 1000
  },
  ui: {
    theme: 'system',
    startMinimized: false,
    minimizeToTray: true
  },
  updates: {
    autoCheck: true,
    autoDownload: false,
    autoInstall: false,
    channel: 'stable'
  }
}

/**
 * Validation error
 */
export interface ConfigValidationError {
  field: string
  message: string
}

/**
 * Validation result
 */
export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
}
