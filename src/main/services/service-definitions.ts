import { ContainerConfig } from './container-runtime.interface'
import { KaiConfig } from '../config/config.types'
import { join } from 'path'

/**
 * Service definition for a Kai service
 */
export interface ServiceDefinition {
  name: string
  displayName: string
  description: string
  containerConfig: (config: KaiConfig) => ContainerConfig
  dependsOn?: string[]
  essential?: boolean // If true, app won't work without this service
}

/**
 * Get all Kai service definitions
 */
export function getServiceDefinitions(): Record<string, ServiceDefinition> {
  return {
    orchestrator: {
      name: 'orchestrator',
      displayName: 'Orchestrator CE',
      description: 'Orchestrator API server',
      essential: true,
      containerConfig: (config: KaiConfig) => ({
        name: 'aintandem-orchestrator-ce',
        image: 'ghcr.io/aintandem/orchestrator-ce:latest',
        env: {
          NODE_ENV: config.services.orchestrator.nodeEnv,
          PORT: config.services.orchestrator.port.toString(),
          DOCKER_NETWORK: config.env.dockerNetwork,
          IMAGE_NAME: config.env.imageName,
          KAI_BASE_ROOT: config.baseDirectory,
          USER_ID: config.env.userId.toString(),
          GROUP_ID: config.env.groupId.toString(),
          ENABLE_PERSISTENT_AI_SESSIONS: config.env.enablePersistentAiSessions.toString(),
          AI_SESSION_MODE: config.env.aiSessionMode,
          TASK_COMPLETION_TIMEOUT: config.env.taskCompletionTimeout.toString(),
          CONTEXT_ENABLED: config.env.contextEnabled.toString(),
          EMBEDDING_PROVIDER: config.env.embeddingProvider,
          EMBEDDING_MODEL: config.env.embeddingModel,
          EMBEDDING_DIMENSIONS: config.env.embeddingDimensions.toString(),
          AUTO_CAPTURE_ENABLED: config.env.autoCaptureEnabled.toString(),
          EXTRACT_FACTS_ENABLED: config.env.extractFactsEnabled.toString(),
          AUTH_USERNAME: config.services.orchestrator.username || 'admin',
          AUTH_PASSWORD: config.services.orchestrator.password || 'aintandem'
        },
        ports: {
          [config.services.orchestrator.port.toString()]: config.services.orchestrator.port.toString()
        },
        volumes: [
          {
            host: '/var/run/docker.sock',
            container: '/var/run/docker.sock'
          },
          {
            host: 'aintandem-data',
            container: '/app/data'
          },
          {
            host: config.baseDirectory,
            container: '/base-root'
          }
        ],
        networks: [config.env.dockerNetwork],
        restart: 'unless-stopped',
        healthcheck: {
          test: ['CMD', 'wget', '-q', '--spider', `http://localhost:9900/api/health`],
          interval: 15000,
          timeout: 5000,
          retries: 3,
          startPeriod: 30000
        }
      })
    },

    codeServer: {
      name: 'codeServer',
      displayName: 'Code Server',
      description: 'VS Code web IDE',
      essential: false,
      containerConfig: (config: KaiConfig) => ({
        name: 'aintandem-code-server',
        image: 'ghcr.io/aintandem/code-server:latest',
        command: ['--bind-addr', '0.0.0.0:8080'],
        env: {
          PASSWORD: config.services.codeServer.password,
          USER_ID: config.env.userId.toString(),
          GROUP_ID: config.env.groupId.toString()
        },
        ports: {
          '8080': config.services.codeServer.port.toString()
        },
        volumes: [
          {
            host: '/var/run/docker.sock',
            container: '/var/run/docker.sock'
          },
          {
            host: config.baseDirectory,
            container: '/base-root'
          },
          {
            host: join(config.baseDirectory, '.aintandem/code-server/config'),
            container: '/home/coder/.config'
          },
          {
            host: join(config.baseDirectory, '.aintandem/code-server/local'),
            container: '/home/coder/.local'
          }
        ],
        networks: [config.env.dockerNetwork],
        restart: 'unless-stopped'
      })    
    }
  }
}

/**
 * Get required volumes for AInTandem services
 */
export function getRequiredVolumes(): string[] {
  return ['aintandem-data']
}

/**
 * Get required network name
 */
export function getRequiredNetwork(): string {
  return 'aintandem-net'
}

/**
 * Create a sandbox container configuration
 */
export function createSandboxConfig(
  config: KaiConfig,
  sandboxId: string,
  projectPath: string
): ContainerConfig {
  return {
    name: `flexy-${sandboxId}`,
    image: config.env.imageName,
    env: {
      USER_ID: config.env.userId.toString(),
      GROUP_ID: config.env.groupId.toString()
    },
    volumes: [
      {
        host: projectPath,
        container: '/workspace'
      }
    ],
    networks: [config.env.dockerNetwork],
    restart: 'unless-stopped',
    labels: {
      'kai.sandbox': 'true',
      'kai.sandbox.id': sandboxId
    }
  }
}
