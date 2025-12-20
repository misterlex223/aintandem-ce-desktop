import React, { useEffect, useState, useCallback } from 'react'
import Settings from './Settings'
import ServicesTab from '../components/ServicesTab'
import ServiceHealthDashboard from '../components/ServiceHealthDashboard'
import RuntimeModeSelector from '../components/RuntimeModeSelector'

export default function Dashboard() {
  const [containers, setContainers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showRuntimeSelector, setShowRuntimeSelector] = useState(false)
  const [activeTab, setActiveTab] = useState<'services' | 'health' | 'containers'>('services')
  const [operating, setOperating] = useState<string | null>(null)
  const [currentRuntime, setCurrentRuntime] = useState<'docker' | 'containerd' | 'lima' | 'none'>('none')

  // Define loadContainers first
  const loadContainers = useCallback(async () => {
    if (window.kai) {
      try {
        const list = await window.kai.container.list({ all: true })
        setContainers(list)
      } catch (error) {
        console.error('Failed to load containers:', error)
      } finally {
        setLoading(false)
      }
    }
  }, [])

  // Then checkRuntimeAndLoadContainers which uses loadContainers
  const checkRuntimeAndLoadContainers = useCallback(async () => {
    try {
      // Check current runtime status
      const status = await window.kai.runtime.detectAvailable()
      setCurrentRuntime(status.current)

      // Check if we need to show runtime selector
      const config = await window.kai.config.get()

      // Show runtime selector if:
      // 1. Runtime preference is 'auto' AND
      // 2. Both Docker and (Containerd or Lima) are available
      // Determine user mode based on which bundled runtime is available
      const hasUserMode = status.lima || status.containerd
      if (config.preferredRuntime === 'auto' && status.docker && hasUserMode) {
        setShowRuntimeSelector(true)
        setLoading(false)
        return
      }

      // Otherwise load containers normally
      await loadContainers()
    } catch (error) {
      console.error('Failed to check runtime:', error)
      await loadContainers()
    }
  }, [loadContainers])

  // Effects
  useEffect(() => {
    checkRuntimeAndLoadContainers()
    // Refresh every 10 seconds (optimized from 5s)
    const interval = setInterval(loadContainers, 10000)
    return () => clearInterval(interval)
  }, [checkRuntimeAndLoadContainers, loadContainers])

  // Event handlers
  const handleRuntimeSelected = async (mode: 'docker' | 'containerd' | 'lima') => {
    try {
      // Save preference
      await window.kai.config.update({ preferredRuntime: mode })

      // Restart app to apply new runtime
      setShowRuntimeSelector(false)
      setLoading(true)

      // Request app restart
      await window.kai.runtime.restart()
    } catch (error) {
      console.error('Failed to switch runtime:', error)
      alert(`Failed to switch runtime: ${error}`)
    }
  }

  const handleStartContainer = async (id: string) => {
    setOperating(id)
    try {
      // Containers are already created, just need to restart them
      await window.kai.container.restart(id)
      await loadContainers()
    } catch (error) {
      alert(`Failed to start container: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleStopContainer = async (id: string) => {
    setOperating(id)
    try {
      await window.kai.container.stop(id)
      await loadContainers()
    } catch (error) {
      alert(`Failed to stop container: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleRemoveContainer = async (id: string) => {
    if (!confirm('Are you sure you want to remove this container?')) return

    setOperating(id)
    try {
      await window.kai.container.remove(id, true)
      await loadContainers()
    } catch (error) {
      alert(`Failed to remove container: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  return (
    <div style={styles.container}>
      {/* Runtime Mode Selector */}
      {showRuntimeSelector && (
        <RuntimeModeSelector
          onSelect={handleRuntimeSelected}
          currentMode={currentRuntime}
        />
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>AInTandem Desktop</h1>
          <p style={styles.subtitle}>Sandbox Management Dashboard</p>
        </div>
        <button style={styles.settingsButton} onClick={() => setShowSettings(true)}>
          ⚙️ Settings
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{...styles.tab, ...(activeTab === 'services' ? styles.tabActive : {})}}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button
          style={{...styles.tab, ...(activeTab === 'health' ? styles.tabActive : {})}}
          onClick={() => setActiveTab('health')}
        >
          Health Dashboard
        </button>
        <button
          style={{...styles.tab, ...(activeTab === 'containers' ? styles.tabActive : {})}}
          onClick={() => setActiveTab('containers')}
        >
          Containers
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'services' ? (
          <ServicesTab />
        ) : activeTab === 'health' ? (
          <ServiceHealthDashboard />
        ) : (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Containers</h2>

          {loading ? (
            <p>Loading containers...</p>
          ) : containers.length === 0 ? (
            <p style={styles.emptyText}>No containers found</p>
          ) : (
            <div style={styles.containerList}>
              {containers.map((container) => (
                <div key={container.id} style={styles.containerCard}>
                  <div style={styles.containerHeader}>
                    <span style={styles.containerName}>{container.name}</span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        ...(container.state === 'running'
                          ? styles.statusRunning
                          : styles.statusStopped)
                      }}
                    >
                      {container.state}
                    </span>
                  </div>
                  <div style={styles.containerInfo}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Image:</span>
                      <span style={styles.infoValue}>{container.image}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>ID:</span>
                      <span style={styles.infoValue}>{container.id.slice(0, 12)}</span>
                    </div>
                  </div>
                  <div style={styles.containerActions}>
                    {container.state === 'exited' || container.state === 'stopped' ? (
                      <button
                        style={styles.actionButton}
                        onClick={() => handleStartContainer(container.id)}
                        disabled={operating === container.id}
                      >
                        {operating === container.id ? 'Starting...' : 'Start'}
                      </button>
                    ) : (
                      <button
                        style={styles.actionButtonDanger}
                        onClick={() => handleStopContainer(container.id)}
                        disabled={operating === container.id}
                      >
                        {operating === container.id ? 'Stopping...' : 'Stop'}
                      </button>
                    )}
                    <button
                      style={styles.actionButtonDanger}
                      onClick={() => handleRemoveContainer(container.id)}
                      disabled={operating === container.id}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f5'
  },
  header: {
    background: 'white',
    padding: '30px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tabs: {
    background: 'white',
    display: 'flex',
    borderBottom: '1px solid #e0e0e0'
  },
  tab: {
    flex: 1,
    padding: '15px',
    border: 'none',
    background: 'none',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    color: '#666',
    borderBottom: '3px solid transparent'
  },
  tabActive: {
    color: '#667eea',
    borderBottom: '3px solid #667eea'
  },
  settingsButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '5px'
  },
  subtitle: {
    fontSize: '14px',
    color: '#666'
  },
  content: {
    flex: 1,
    padding: '30px',
    overflowY: 'auto'
  },
  section: {
    background: 'white',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    padding: '40px'
  },
  containerList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '15px'
  },
  containerCard: {
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    padding: '15px',
    background: '#fafafa'
  },
  containerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  containerName: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333'
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600'
  },
  statusRunning: {
    background: '#e8f5e9',
    color: '#2e7d32'
  },
  statusStopped: {
    background: '#ffebee',
    color: '#c62828'
  },
  containerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  infoRow: {
    display: 'flex',
    gap: '10px'
  },
  infoLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '600',
    minWidth: '50px'
  },
  infoValue: {
    fontSize: '14px',
    color: '#333',
    fontFamily: 'monospace'
  },
  containerActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '15px'
  },
  actionButton: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white'
  },
  actionButtonDanger: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#ffebee',
    color: '#c62828'
  }
}
