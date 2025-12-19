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
    backend: {
      name: 'backend',
      displayName: 'Backend',
      description: 'Kai backend API server',
      essential: true,
      dependsOn: ['qdrant', 'neo4j'],
      containerConfig: (config: KaiConfig) => ({
        name: 'kai-backend',
        image: 'kai-backend:latest',
        env: {
          NODE_ENV: config.services.backend.nodeEnv,
          PORT: config.services.backend.port.toString(),
          DOCKER_NETWORK: config.env.dockerNetwork,
          IMAGE_NAME: config.env.imageName,
          KAI_BASE_ROOT: config.baseDirectory,
          USER_ID: config.env.userId.toString(),
          GROUP_ID: config.env.groupId.toString(),
          ENABLE_PERSISTENT_AI_SESSIONS: config.env.enablePersistentAiSessions.toString(),
          AI_SESSION_MODE: config.env.aiSessionMode,
          TASK_COMPLETION_TIMEOUT: config.env.taskCompletionTimeout.toString(),
          CONTEXT_ENABLED: config.env.contextEnabled.toString(),
          QDRANT_URL: 'http://kai-qdrant:6333',
          NEO4J_URI: 'bolt://kai-neo4j:7687',
          NEO4J_USER: 'neo4j',
          NEO4J_PASSWORD: config.services.neo4j.password,
          EMBEDDING_PROVIDER: config.env.embeddingProvider,
          EMBEDDING_MODEL: config.env.embeddingModel,
          EMBEDDING_DIMENSIONS: config.env.embeddingDimensions.toString(),
          AUTO_CAPTURE_ENABLED: config.env.autoCaptureEnabled.toString(),
          EXTRACT_FACTS_ENABLED: config.env.extractFactsEnabled.toString()
        },
        ports: {
          [config.services.backend.port.toString()]: config.services.backend.port.toString()
        },
        volumes: [
          {
            host: '/var/run/docker.sock',
            container: '/var/run/docker.sock'
          },
          {
            host: 'kai-data',
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
          test: ['CMD', 'wget', '-q', '--spider', `http://localhost:${config.services.backend.port}/api/health`],
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
        name: 'kai-code-server',
        image: 'codercom/code-server:latest',
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
            host: join(config.baseDirectory, '.kai/code-server/config'),
            container: '/home/coder/.config'
          },
          {
            host: join(config.baseDirectory, '.kai/code-server/local'),
            container: '/home/coder/.local'
          }
        ],
        networks: [config.env.dockerNetwork],
        restart: 'unless-stopped'
      })
    },

    qdrant: {
      name: 'qdrant',
      displayName: 'Qdrant',
      description: 'Vector database for context system',
      essential: true,
      containerConfig: (config: KaiConfig) => ({
        name: 'kai-qdrant',
        image: 'qdrant/qdrant:latest',
        ports: {
          '6333': config.services.qdrant.port.toString(),
          '6334': '6334'
        },
        volumes: [
          {
            host: 'qdrant-data',
            container: '/qdrant/storage'
          }
        ],
        networks: [config.env.dockerNetwork],
        restart: 'unless-stopped',
        healthcheck: {
          test: ['CMD', 'curl', '-f', 'http://localhost:6333/'],
          interval: 10000,
          timeout: 5000,
          retries: 3,
          startPeriod: 10000
        }
      })
    },

    neo4j: {
      name: 'neo4j',
      displayName: 'Neo4j',
      description: 'Graph database for context system',
      essential: true,
      containerConfig: (config: KaiConfig) => ({
        name: 'kai-neo4j',
        image: 'neo4j:5-community',
        env: {
          NEO4J_AUTH: `neo4j/${config.services.neo4j.password}`,
          'NEO4J_PLUGINS': '["apoc"]',
          'NEO4J_dbms_security_procedures_unrestricted': 'apoc.*',
          'NEO4J_dbms_security_procedures_allowlist': 'apoc.*'
        },
        ports: {
          '7474': '7474',
          '7687': config.services.neo4j.port.toString()
        },
        volumes: [
          {
            host: 'neo4j-data',
            container: '/data'
          },
          {
            host: 'neo4j-logs',
            container: '/logs'
          }
        ],
        networks: [config.env.dockerNetwork],
        restart: 'unless-stopped',
        healthcheck: {
          test: ['CMD', 'cypher-shell', '-u', 'neo4j', '-p', config.services.neo4j.password, 'RETURN 1'],
          interval: 10000,
          timeout: 5000,
          retries: 5,
          startPeriod: 30000
        }
      })
    }
  }
}

/**
 * Get required volumes for Kai services
 */
export function getRequiredVolumes(): string[] {
  return ['kai-data', 'qdrant-data', 'neo4j-data', 'neo4j-logs']
}

/**
 * Get required network name
 */
export function getRequiredNetwork(): string {
  return 'kai-net'
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
