import React, { useEffect, useState } from 'react'

interface ServiceHealth {
  name: string
  displayName: string
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'
  essential: boolean
  dependsOn?: string[]
}

export default function ServiceHealthDashboard() {
  const [services, setServices] = useState<ServiceHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadServices()
    // Refresh every 10 seconds (optimized from 5s)
    const interval = setInterval(loadServices, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadServices = async () => {
    try {
      const serviceList = await window.kai.service.getAll()
      setServices(serviceList as ServiceHealth[])
    } catch (error) {
      console.error('Failed to load services:', error)
    } finally {
      setLoading(false)
    }
  }

  const getServiceStats = () => {
    const total = services.length
    const running = services.filter(s => s.status === 'running').length
    const stopped = services.filter(s => s.status === 'stopped').length
    const error = services.filter(s => s.status === 'error').length
    const healthy = services.filter(s => s.health === 'healthy').length

    return { total, running, stopped, error, healthy }
  }

  const stats = getServiceStats()

  if (loading) {
    return <div style={styles.loading}>Loading health dashboard...</div>
  }

  return (
    <div style={styles.container}>
      {/* Overview Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>📊</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats.total}</div>
            <div style={styles.statLabel}>Total Services</div>
          </div>
        </div>

        <div style={{...styles.statCard, ...styles.statCardSuccess}}>
          <div style={styles.statIcon}>✓</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats.running}</div>
            <div style={styles.statLabel}>Running</div>
          </div>
        </div>

        <div style={{...styles.statCard, ...styles.statCardWarning}}>
          <div style={styles.statIcon}>■</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats.stopped}</div>
            <div style={styles.statLabel}>Stopped</div>
          </div>
        </div>

        <div style={{...styles.statCard, ...(stats.error > 0 ? styles.statCardDanger : {})}}>
          <div style={styles.statIcon}>✗</div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats.error}</div>
            <div style={styles.statLabel}>Errors</div>
          </div>
        </div>
      </div>

      {/* Dependency Graph Visualization */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Service Dependencies</h3>
        <div style={styles.dependencyGraph}>
          {services.map(service => (
            <div key={service.name} style={styles.serviceNode}>
              <div style={{
                ...styles.nodeHeader,
                background: getStatusColor(service.status)
              }}>
                <span style={styles.nodeName}>{service.displayName}</span>
                {service.essential && <span style={styles.essentialBadge}>Essential</span>}
              </div>
              {service.dependsOn && service.dependsOn.length > 0 && (
                <div style={styles.nodeDependencies}>
                  <div style={styles.dependencyLabel}>Depends on:</div>
                  {service.dependsOn.map(dep => {
                    const depService = services.find(s => s.name === dep)
                    return (
                      <div key={dep} style={styles.dependencyItem}>
                        <span style={{
                          ...styles.dependencyStatus,
                          background: getStatusColor(depService?.status || 'stopped')
                        }} />
                        <span style={styles.dependencyName}>
                          {depService?.displayName || dep}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={styles.nodeStatus}>
                <span style={styles.statusText}>
                  {service.status}
                  {service.health && service.health !== 'none' && ` (${service.health})`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Health Status Table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Health Status</h3>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Service</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Health</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Dependencies</th>
            </tr>
          </thead>
          <tbody>
            {services.map(service => (
              <tr key={service.name} style={styles.tableRow}>
                <td style={styles.td}>
                  <strong>{service.displayName}</strong>
                </td>
                <td style={styles.td}>
                  <span style={{
                    ...styles.badge,
                    background: `${getStatusColor(service.status)}22`,
                    color: getStatusColor(service.status)
                  }}>
                    {service.status}
                  </span>
                </td>
                <td style={styles.td}>
                  {service.health && service.health !== 'none' ? (
                    <span style={{
                      ...styles.badge,
                      background: service.health === 'healthy' ? '#e8f5e9' : '#ffebee',
                      color: service.health === 'healthy' ? '#2e7d32' : '#c62828'
                    }}>
                      {service.health}
                    </span>
                  ) : (
                    <span style={{...styles.badge, background: '#f5f5f5', color: '#999'}}>
                      N/A
                    </span>
                  )}
                </td>
                <td style={styles.td}>
                  {service.essential ? (
                    <span style={styles.essentialTag}>Essential</span>
                  ) : (
                    <span style={styles.optionalTag}>Optional</span>
                  )}
                </td>
                <td style={styles.td}>
                  {service.dependsOn && service.dependsOn.length > 0 ? (
                    <span style={styles.dependencyCount}>
                      {service.dependsOn.length} service(s)
                    </span>
                  ) : (
                    <span style={styles.noDependency}>None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function getStatusColor(status: string): string {
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#666'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
    marginBottom: '30px'
  },
  statCard: {
    background: '#fafafa',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  statCardSuccess: {
    borderColor: '#e8f5e9',
    background: '#f1f8f4'
  },
  statCardWarning: {
    borderColor: '#fff3e0',
    background: '#fffbf5'
  },
  statCardDanger: {
    borderColor: '#ffebee',
    background: '#fff5f5'
  },
  statIcon: {
    fontSize: '32px',
    lineHeight: 1
  },
  statContent: {
    flex: 1
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 1.2
  },
  statLabel: {
    fontSize: '13px',
    color: '#666',
    marginTop: '5px'
  },
  section: {
    background: 'white',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '20px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px',
    marginTop: 0
  },
  dependencyGraph: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '15px'
  },
  serviceNode: {
    background: '#f9f9f9',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  nodeHeader: {
    padding: '12px 15px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: 'white',
    fontWeight: '600'
  },
  nodeName: {
    fontSize: '14px'
  },
  essentialBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.3)'
  },
  nodeDependencies: {
    padding: '12px 15px',
    borderBottom: '1px solid #e0e0e0'
  },
  dependencyLabel: {
    fontSize: '11px',
    color: '#999',
    marginBottom: '8px',
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  dependencyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px'
  },
  dependencyStatus: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  dependencyName: {
    fontSize: '13px',
    color: '#666'
  },
  nodeStatus: {
    padding: '10px 15px',
    background: '#fff',
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace'
  },
  statusText: {
    textTransform: 'capitalize'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHeader: {
    background: '#f5f5f5'
  },
  th: {
    padding: '12px 15px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    borderBottom: '2px solid #e0e0e0'
  },
  tableRow: {
    borderBottom: '1px solid #f0f0f0'
  },
  td: {
    padding: '15px',
    fontSize: '14px',
    color: '#333'
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block'
  },
  essentialTag: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px',
    background: '#fff3e0',
    color: '#e65100'
  },
  optionalTag: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px',
    background: '#f5f5f5',
    color: '#999'
  },
  dependencyCount: {
    fontSize: '13px',
    color: '#666',
    fontFamily: 'monospace'
  },
  noDependency: {
    fontSize: '13px',
    color: '#999',
    fontStyle: 'italic'
  }
}
