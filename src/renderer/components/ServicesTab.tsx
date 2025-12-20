import React, { useEffect, useState } from 'react'
import LogViewerModal from './LogViewerModal'
import ImageDownloadPermissionModal from './ImageDownloadPermissionModal'

interface ServiceStatus {
  name: string
  displayName: string
  description: string
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown'
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'
  containerId?: string
  error?: string
  essential: boolean
}

interface ContainerStats {
  cpu: number
  memory: {
    used: number
    limit: number
    percentage: number
  }
}

export default function ServicesTab() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [serviceEvents, setServiceEvents] = useState<Record<string, any>>({})
  const [stats, setStats] = useState<Record<string, ContainerStats>>({})
  const [generalImageEvents, setGeneralImageEvents] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState<{ containerId: string; containerName: string } | null>(null)

  useEffect(() => {
    loadServices()
    // Refresh every 10 seconds (optimized from 5s)
    const interval = setInterval(loadServices, 10000)

    // Set up event listener for individual service events (like image pulling)
    const unlistenServiceEvent = window.kai['service-events'].onServiceEvent((event) => {
      // For known services, store in serviceEvents
      if (services.some(service => service.name === event.serviceName)) {
        setServiceEvents(prev => ({
          ...prev,
          [event.serviceName]: event
        }))

        // Clear the event after some time if it's a completion event
        if (event.eventType === 'image-pulled') {
          setTimeout(() => {
            setServiceEvents(current => {
              const newState = { ...current };
              delete newState[event.serviceName];
              return newState;
            });
          }, 2000);
        }
      } else {
        // For non-service events (like flexy-sandbox), store in generalImageEvents
        setGeneralImageEvents(prev => ({
          ...prev,
          [event.serviceName]: event
        }))

        // Clear the event after some time if it's a completion event
        if (event.eventType === 'image-pulled') {
          setTimeout(() => {
            setGeneralImageEvents(current => {
              const newState = { ...current };
              delete newState[event.serviceName];
              return newState;
            });
          }, 2000);
        }
      }
    })

    // Set up event listener for bulk service status updates
    const unlistenServicesUpdated = window.kai['service-events'].onServicesUpdated((updatedServices) => {
      setServices(updatedServices)
    });

    // Check for flexy-sandbox image when component mounts and after a delay to ensure services are loaded
    const checkImageOnMount = setTimeout(async () => {
      try {
        // Load services again to make sure we have current status
        await loadServices();

        // Check if all essential services are running before checking the image
        const allServices = await window.kai.service.getAll();
        const allEssentialRunning = allServices.every(
          (service: any) => !service.essential || service.status === 'running'
        );

        if (allEssentialRunning) {
          await window.kai.service.checkAndDownloadFlexySandboxImage();
        }
      } catch (error) {
        console.error('Error checking flexy-sandbox image on mount:', error);
      }
    }, 2000); // Delay to ensure services are loaded

    return () => {
      clearInterval(interval)
      unlistenServiceEvent()
      unlistenServicesUpdated()
      clearTimeout(checkImageOnMount); // Clean up the timeout on unmount
    }
  }, [])

  const loadServices = async () => {
    if (window.kai) {
      try {
        const list = await window.kai.service.getAll()
        setServices(list)

        // Load stats for running services
        const statsPromises = list
          .filter(s => s.status === 'running' && s.containerId)
          .map(async (s) => {
            try {
              const stat = await window.kai.container.stats(s.containerId)
              return { name: s.name, stat }
            } catch {
              return null
            }
          })

        const results = await Promise.all(statsPromises)
        const newStats: Record<string, ContainerStats> = {}
        results.forEach(r => {
          if (r) newStats[r.name] = r.stat
        })
        setStats(newStats)
      } catch (error) {
        console.error('Failed to load services:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100  } ${  sizes[i]}`
  }

  const handleStart = async (serviceName: string) => {
    setOperating(serviceName)
    try {
      await window.kai.service.start(serviceName)
      await loadServices()
    } catch (error) {
      alert(`Failed to start ${serviceName}: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleStop = async (serviceName: string) => {
    setOperating(serviceName)
    try {
      await window.kai.service.stop(serviceName)
      await loadServices()
    } catch (error) {
      alert(`Failed to stop ${serviceName}: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleRestart = async (serviceName: string) => {
    setOperating(serviceName)
    try {
      await window.kai.service.restart(serviceName)
      await loadServices()
    } catch (error) {
      alert(`Failed to restart ${serviceName}: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleStartAll = async () => {
    setOperating('all')
    try {
      await window.kai.service.startAll()
      await loadServices()

      // After all services have started, check for the flexy-sandbox image
      setTimeout(async () => {
        try {
          await window.kai.service.checkAndDownloadFlexySandboxImage();
        } catch (error) {
          console.error('Error checking flexy-sandbox image:', error)
        }
      }, 3000) // Delay to allow services to fully start
    } catch (error) {
      alert(`Failed to start all services: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const handleStopAll = async () => {
    if (!confirm('Are you sure you want to stop all services?')) return

    setOperating('all')
    try {
      await window.kai.service.stopAll()
      await loadServices()
    } catch (error) {
      alert(`Failed to stop all services: ${error}`)
    } finally {
      setOperating(null)
    }
  }

  const getStatusColor = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'running':
        return '#2e7d32'
      case 'stopped':
        return '#757575'
      case 'starting':
      case 'stopping':
        return '#f57c00'
      case 'error':
        return '#c62828'
      default:
        return '#9e9e9e'
    }
  }

  const getHealthIcon = (health?: ServiceStatus['health']) => {
    if (!health || health === 'none') return ''
    switch (health) {
      case 'healthy':
        return '✓'
      case 'unhealthy':
        return '✗'
      case 'starting':
        return '⟳'
    }
  }

  const isImagePulling = (serviceName: string) => {
    const event = serviceEvents[serviceName];
    return event && (
      event.eventType === 'image-pulling' ||
      event.eventType === 'image-pulling-progress'
    );
  };

  const getImagePullProgress = (serviceName: string) => {
    const event = serviceEvents[serviceName];
    return isImagePulling(serviceName) && event.eventType === 'image-pulling-progress'
      ? event.data
      : null;
  };

  if (loading) {
    return <div style={styles.loading}>Loading services...</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Services</h2>
        <div style={styles.actions}>
          <button
            style={styles.buttonPrimary}
            onClick={handleStartAll}
            disabled={operating === 'all'}
          >
            {operating === 'all' ? 'Starting...' : 'Start All'}
          </button>
          <button
            style={styles.buttonSecondary}
            onClick={handleStopAll}
            disabled={operating === 'all'}
          >
            Stop All
          </button>
        </div>
      </div>

      {/* General image download progress (for non-service images like flexy-sandbox) */}
      {Object.entries(generalImageEvents).map(([serviceName, event]) => {
        if (event.eventType === 'image-pulling' || event.eventType === 'image-pulling-progress') {
          // If we have detailed phase information, show separate progress bars for each phase
          if (event.data?.allPhases) {
            const { downloading, extracting } = event.data.allPhases;

            return (
              <div key={`general-${serviceName}`} style={styles.imagePullingSection}>
                <div style={styles.imagePullingText}>
                  {event.data?.message || `Pulling image for ${serviceName}...`}
                </div>

                {/* Downloading Phase */}
                <div style={styles.phaseContainer}>
                  <div style={styles.phaseLabel}>Downloading:</div>
                  <div style={styles.imagePullProgressBar}>
                    <div
                      style={{
                        ...styles.imagePullProgressFill,
                        width: `${downloading.progress}%`,
                        background: '#4caf50'
                      }}
                    />
                  </div>
                  <div style={styles.phaseProgress}>{downloading.progress}% - {downloading.status}</div>
                </div>

                {/* Extracting Phase */}
                <div style={styles.phaseContainer}>
                  <div style={styles.phaseLabel}>Extracting:</div>
                  <div style={styles.imagePullProgressBar}>
                    <div
                      style={{
                        ...styles.imagePullProgressFill,
                        width: `${extracting.progress}%`,
                        background: '#ff9800'
                      }}
                    />
                  </div>
                  <div style={styles.phaseProgress}>{extracting.progress}% - {extracting.status}</div>
                </div>
              </div>
            );
          } else {
            // Fallback to single progress bar if no phase info
            return (
              <div key={`general-${serviceName}`} style={styles.imagePullingSection}>
                <div style={styles.imagePullingText}>
                  {event.data?.message || `Downloading image for ${serviceName}...`}
                  {event.data?.progress !== undefined && (
                    <span> ({event.data.progress}%)</span>
                  )}
                </div>
                {event.data?.progress !== undefined && (
                  <div style={styles.imagePullProgressBar}>
                    <div
                      style={{
                        ...styles.imagePullProgressFill,
                        width: `${event.data.progress}%`
                      }}
                    />
                  </div>
                )}
              </div>
            );
          }
        }
        return null;
      })}

      <div style={styles.serviceList}>
        {services.map((service) => (
          <div key={service.name} style={styles.serviceCard}>
            <div style={styles.serviceHeader}>
              <div style={styles.serviceInfo}>
                <div style={styles.serviceName}>
                  {service.displayName}
                  {service.essential && (
                    <span style={styles.essentialBadge}>Essential</span>
                  )}
                </div>
                <div style={styles.serviceDescription}>{service.description}</div>
              </div>
              <div style={styles.serviceStatus}>
                {isImagePulling(service.name) ? (
                  <div style={styles.statusBadge}>
                    <span style={{ color: '#f57c00' }}>Pulling image...</span>
                  </div>
                ) : (
                  <div
                    style={{
                      ...styles.statusBadge,
                      background: `${getStatusColor(service.status)}22`,
                      color: getStatusColor(service.status)
                    }}
                  >
                    {getHealthIcon(service.health)} {service.status}
                  </div>
                )}
              </div>
            </div>

            {/* Image pulling progress display */}
            {isImagePulling(service.name) && (
              <div style={styles.imagePullingSection}>
                {getImagePullProgress(service.name)?.allPhases ? (
                  // Show detailed phase progress if available
                  (() => {
                    const { downloading, extracting } = getImagePullProgress(service.name).allPhases;

                    return (
                      <>
                        <div style={styles.imagePullingText}>
                          {getImagePullProgress(service.name)?.message || 'Pulling image...'}
                        </div>

                        {/* Downloading Phase */}
                        <div style={styles.phaseContainer}>
                          <div style={styles.phaseLabel}>Downloading:</div>
                          <div style={styles.imagePullProgressBar}>
                            <div
                              style={{
                                ...styles.imagePullProgressFill,
                                width: `${downloading.progress}%`,
                                background: '#4caf50'
                              }}
                            />
                          </div>
                          <div style={styles.phaseProgress}>{downloading.progress}% - {downloading.status}</div>
                        </div>

                        {/* Extracting Phase */}
                        <div style={styles.phaseContainer}>
                          <div style={styles.phaseLabel}>Extracting:</div>
                          <div style={styles.imagePullProgressBar}>
                            <div
                              style={{
                                ...styles.imagePullProgressFill,
                                width: `${extracting.progress}%`,
                                background: '#ff9800'
                              }}
                            />
                          </div>
                          <div style={styles.phaseProgress}>{extracting.progress}% - {extracting.status}</div>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  // Fallback to single progress bar if no phase info
                  <>
                    <div style={styles.imagePullingText}>
                      {getImagePullProgress(service.name)?.message || 'Pulling image...'}
                      {getImagePullProgress(service.name)?.progress !== undefined && (
                        <span> ({getImagePullProgress(service.name).progress}%)</span>
                      )}
                    </div>
                    {getImagePullProgress(service.name)?.progress !== undefined && (
                      <div style={styles.imagePullProgressBar}>
                        <div
                          style={{
                            ...styles.imagePullProgressFill,
                            width: `${getImagePullProgress(service.name).progress}%`
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {service.error && (
              <div style={styles.errorText}>{service.error}</div>
            )}

            {/* Resource usage */}
            {service.status === 'running' && stats[service.name] && (
              <div style={styles.resourceUsage}>
                <div style={styles.resourceItem}>
                  <span style={styles.resourceLabel}>CPU:</span>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${Math.min(stats[service.name].cpu, 100)}%`,
                        background: stats[service.name].cpu > 80 ? '#f57c00' : '#667eea'
                      }}
                    />
                  </div>
                  <span style={styles.resourceValue}>{stats[service.name].cpu.toFixed(1)}%</span>
                </div>
                <div style={styles.resourceItem}>
                  <span style={styles.resourceLabel}>Memory:</span>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${stats[service.name].memory.percentage}%`,
                        background: stats[service.name].memory.percentage > 80 ? '#f57c00' : '#667eea'
                      }}
                    />
                  </div>
                  <span style={styles.resourceValue}>
                    {formatBytes(stats[service.name].memory.used)} / {formatBytes(stats[service.name].memory.limit)}
                  </span>
                </div>
              </div>
            )}

            <div style={styles.serviceActions}>
              {service.status === 'stopped' && (
                <button
                  style={styles.actionButton}
                  onClick={() => handleStart(service.name)}
                  disabled={operating === service.name}
                >
                  {operating === service.name ? 'Starting...' : 'Start'}
                </button>
              )}
              {service.status === 'running' && (
                <>
                  <button
                    style={styles.actionButton}
                    onClick={() => handleRestart(service.name)}
                    disabled={operating === service.name}
                  >
                    {operating === service.name ? 'Restarting...' : 'Restart'}
                  </button>
                  <button
                    style={styles.actionButtonDanger}
                    onClick={() => handleStop(service.name)}
                    disabled={operating === service.name}
                  >
                    {operating === service.name ? 'Stopping...' : 'Stop'}
                  </button>
                  <button
                    style={styles.actionButtonSecondary}
                    onClick={() => setShowLogs({
                      containerId: service.containerId!,
                      containerName: service.displayName
                    })}
                  >
                    View Logs
                  </button>
                </>
              )}
              {service.containerId && (
                <span style={styles.containerId}>
                  ID: {service.containerId.slice(0, 12)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Log Viewer Modal */}
      {showLogs && (
        <LogViewerModal
          containerId={showLogs.containerId}
          containerName={showLogs.containerName}
          onClose={() => setShowLogs(null)}
        />
      )}

      {/* Image Download Permission Modal */}
      <ImageDownloadPermissionModal
        onRequest={window.kai['image-download-permission'].onRequest}
        respond={window.kai['image-download-permission'].respond}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#666'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: 0
  },
  actions: {
    display: 'flex',
    gap: '10px'
  },
  buttonPrimary: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white'
  },
  buttonSecondary: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#e0e0e0',
    color: '#666'
  },
  serviceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  serviceCard: {
    background: '#fafafa',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px'
  },
  serviceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '15px'
  },
  serviceInfo: {
    flex: 1
  },
  serviceName: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  essentialBadge: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '4px',
    background: '#fff3e0',
    color: '#e65100'
  },
  serviceDescription: {
    fontSize: '14px',
    color: '#666'
  },
  serviceStatus: {
    display: 'flex',
    alignItems: 'center'
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600'
  },
  errorText: {
    fontSize: '13px',
    color: '#c62828',
    background: '#ffebee',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '15px'
  },
  serviceActions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
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
  },
  actionButtonSecondary: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#f5f5f5',
    color: '#666'
  },
  containerId: {
    fontSize: '12px',
    color: '#999',
    fontFamily: 'monospace',
    marginLeft: 'auto'
  },
  resourceUsage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '15px',
    padding: '12px',
    background: '#f9f9f9',
    borderRadius: '6px'
  },
  resourceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  resourceLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    minWidth: '65px'
  },
  progressBar: {
    flex: 1,
    height: '6px',
    background: '#e0e0e0',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  resourceValue: {
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace',
    minWidth: '120px',
    textAlign: 'right'
  },
  imagePullingSection: {
    marginBottom: '15px',
    padding: '12px',
    background: '#fff3e0',
    borderRadius: '6px'
  },
  imagePullingText: {
    fontSize: '13px',
    color: '#e65100',
    marginBottom: '5px'
  },
  imagePullProgressBar: {
    height: '6px',
    background: '#e0e0e0',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  imagePullProgressFill: {
    height: '100%',
    background: '#f57c00',
    transition: 'width 0.3s ease'
  },
  phaseContainer: {
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  phaseLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
    minWidth: '70px'
  },
  phaseProgress: {
    fontSize: '11px',
    color: '#666',
    minWidth: '100px',
    textAlign: 'right'
  }
}
