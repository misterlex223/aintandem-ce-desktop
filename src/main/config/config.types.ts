/**
 * Configuration types for Kai Desktop
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
    backend: {
      port: number
      nodeEnv: 'development' | 'production'
    }
    neo4j: {
      password: string
      port: number
    }
    codeServer: {
      password: string
      port: number
    }
    qdrant: {
      port: number
    }
  }

  // Cloud frontend
  cloudFrontendUrl: string

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
    backend: {
      port: 9900,
      nodeEnv: 'production'
    },
    neo4j: {
      password: '',
      port: 7687
    },
    codeServer: {
      password: '',
      port: 8443
    },
    qdrant: {
      port: 6333
    }
  },
  cloudFrontendUrl: '',
  env: {
    dockerNetwork: 'kai-net',
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
