import React, { useEffect, useState, useRef, useCallback } from 'react'

interface LogViewerModalProps {
  containerId: string
  containerName: string
  onClose: () => void
}

export default function LogViewerModal({ containerId, containerName, onClose }: LogViewerModalProps) {
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tailLines, setTailLines] = useState(100)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)

  const loadLogs = useCallback(async () => {
    try {
      const logData = await window.kai.container.getLogs(containerId, { tail: tailLines })
      setLogs(logData)
    } catch (error) {
      console.error('Failed to load logs:', error)
      setLogs(`Error loading logs: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [containerId, tailLines])

  useEffect(() => {
    loadLogs()
    const interval = setInterval(() => {
      if (following) {
        loadLogs()
      }
    }, 2000) // Refresh every 2 seconds when following

    return () => clearInterval(interval)
  }, [containerId, tailLines, following, loadLogs])

  useEffect(() => {
    if (following && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, following])

  const handleClearLogs = () => {
    setLogs('')
  }

  const handleDownloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${containerName}-logs-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs)
      alert('Logs copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy logs:', error)
    }
  }

  const filteredLogs = searchTerm
    ? logs.split('\n').filter(line =>
        line.toLowerCase().includes(searchTerm.toLowerCase())
      ).join('\n')
    : logs

  const logLines = filteredLogs.split('\n')

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Container Logs</h2>
            <p style={styles.subtitle}>{containerName}</p>
          </div>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <input
              type="text"
              placeholder="Search logs..."
              style={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              style={styles.select}
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
            >
              <option value={50}>Last 50 lines</option>
              <option value={100}>Last 100 lines</option>
              <option value={500}>Last 500 lines</option>
              <option value={1000}>Last 1000 lines</option>
              <option value={5000}>Last 5000 lines</option>
            </select>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={following}
                onChange={(e) => setFollowing(e.target.checked)}
              />
              <span style={styles.checkboxLabel}>Auto-scroll</span>
            </label>
          </div>
          <div style={styles.toolbarRight}>
            <button style={styles.toolbarButton} onClick={loadLogs} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button style={styles.toolbarButton} onClick={handleCopyLogs}>
              Copy
            </button>
            <button style={styles.toolbarButton} onClick={handleDownloadLogs}>
              Download
            </button>
            <button style={styles.toolbarButtonDanger} onClick={handleClearLogs}>
              Clear
            </button>
          </div>
        </div>

        {/* Logs display */}
        <div style={styles.logsContainer} ref={logsContainerRef}>
          {loading ? (
            <div style={styles.loading}>Loading logs...</div>
          ) : logLines.length === 0 || (logLines.length === 1 && !logLines[0]) ? (
            <div style={styles.empty}>No logs available</div>
          ) : (
            <div style={styles.logsContent}>
              {logLines.map((line, index) => (
                <div key={index} style={styles.logLine}>
                  <span style={styles.lineNumber}>{index + 1}</span>
                  <span style={styles.lineContent}>{line || ' '}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.stats}>
            {searchTerm && (
              <span style={styles.statItem}>
                Found: {filteredLogs.split('\n').filter(l => l).length} / {logs.split('\n').filter(l => l).length} lines
              </span>
            )}
            <span style={styles.statItem}>
              Total: {logs.split('\n').filter(l => l).length} lines
            </span>
          </div>
          <button style={styles.closeButtonFooter} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  modal: {
    background: '#1e1e1e',
    borderRadius: '12px',
    width: '95%',
    maxWidth: '1200px',
    height: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #333',
    background: '#252525'
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: 0,
    color: '#fff'
  },
  subtitle: {
    fontSize: '14px',
    color: '#999',
    margin: '5px 0 0 0',
    fontFamily: 'monospace'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    color: '#999',
    lineHeight: 1
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: '1px solid #333',
    background: '#252525',
    gap: '10px',
    flexWrap: 'wrap'
  },
  toolbarLeft: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap'
  },
  toolbarRight: {
    display: 'flex',
    gap: '10px'
  },
  searchInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #444',
    borderRadius: '6px',
    background: '#2d2d2d',
    color: '#fff',
    outline: 'none',
    minWidth: '200px'
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #444',
    borderRadius: '6px',
    background: '#2d2d2d',
    color: '#fff',
    outline: 'none'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    color: '#ccc',
    fontSize: '14px'
  },
  checkboxLabel: {
    userSelect: 'none'
  },
  toolbarButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid #444',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#2d2d2d',
    color: '#fff'
  },
  toolbarButtonDanger: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid #c62828',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#2d2d2d',
    color: '#ff5252'
  },
  logsContainer: {
    flex: 1,
    overflow: 'auto',
    background: '#1e1e1e',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.5'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#999'
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#666'
  },
  logsContent: {
    padding: '10px'
  },
  logLine: {
    display: 'flex',
    gap: '15px',
    padding: '2px 0',
    borderBottom: '1px solid #252525'
  },
  lineNumber: {
    color: '#666',
    minWidth: '50px',
    textAlign: 'right',
    userSelect: 'none',
    flexShrink: 0
  },
  lineContent: {
    color: '#d4d4d4',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap'
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    borderTop: '1px solid #333',
    background: '#252525'
  },
  stats: {
    display: 'flex',
    gap: '20px',
    color: '#999',
    fontSize: '13px'
  },
  statItem: {
    fontFamily: 'monospace'
  },
  closeButtonFooter: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white'
  }
}
