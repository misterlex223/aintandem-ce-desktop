import React, { useState, useEffect, useRef } from 'react'

interface RuntimeSetupStepProps {
  runtimeType: 'docker' | 'containerd' | 'lima' | 'none'
  onComplete: () => void
}

type SetupState = 'idle' | 'downloading' | 'installing' | 'starting' | 'success' | 'error'

export default function RuntimeSetupStep({ runtimeType, onComplete }: RuntimeSetupStepProps) {
  const [state, setState] = useState<SetupState>('idle')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Listen for runtime setup progress
  useEffect(() => {
    if (state !== 'idle' && state !== 'success' && state !== 'error') {
      const unsubscribe = window.kai?.runtime?.onSetupProgress?.((message: string) => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])

        // Update state based on log messages
        if (message.includes('Downloading') || message.includes('download')) {
          setState('downloading')
        } else if (message.includes('Installing') || message.includes('Extracting') || message.includes('install')) {
          setState('installing')
        } else if (message.includes('Starting') || message.includes('VM')) {
          setState('starting')
        } else if (message.includes('success') || message.includes('complete')) {
          setState('success')
        }
      })

      return () => {
        unsubscribe?.()
      }
    }
  }, [state])

  const handleStartSetup = async () => {
    setState('downloading')
    setLogs([])
    setError(null)

    try {
      // Start runtime setup
      const result = await window.kai.runtime.setupBundled()

      if (result.success) {
        setState('success')
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✅ Runtime setup completed successfully!`])
      } else {
        setState('error')
        setError(result.error || 'Unknown error occurred')
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Error: ${result.error}`])
      }
    } catch (err: any) {
      setState('error')
      setError(err.message || 'Failed to setup runtime')
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Error: ${err.message}`])
    }
  }

  const getRuntimeName = () => {
    if (runtimeType === 'lima') return 'Lima (Container Runtime for macOS)'
    if (runtimeType === 'containerd') return 'Containerd (Container Runtime)'
    return 'Container Runtime'
  }

  const getStateLabel = () => {
    switch (state) {
      case 'idle': return 'Ready to Install'
      case 'downloading': return 'Downloading...'
      case 'installing': return 'Installing...'
      case 'starting': return 'Starting VM...'
      case 'success': return 'Setup Complete'
      case 'error': return 'Setup Failed'
      default: return 'Unknown'
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Container Runtime Setup</h2>
      <p style={styles.subtitle}>
        AInTandem Desktop needs to install {getRuntimeName()} to run containerized services.
      </p>

      <div style={styles.statusCard}>
        <div style={styles.statusHeader}>
          <div style={styles.statusIcon}>
            {state === 'idle' && '⏳'}
            {state === 'downloading' && '⬇️'}
            {state === 'installing' && '📦'}
            {state === 'starting' && '🚀'}
            {state === 'success' && '✅'}
            {state === 'error' && '❌'}
          </div>
          <div>
            <div style={styles.statusLabel}>{getStateLabel()}</div>
            <div style={styles.statusSubtext}>
              {state === 'idle' && 'Click Continue to begin installation'}
              {state === 'downloading' && 'Downloading runtime packages...'}
              {state === 'installing' && 'Extracting and installing files...'}
              {state === 'starting' && 'Starting container runtime...'}
              {state === 'success' && 'Runtime is ready to use'}
              {state === 'error' && 'Something went wrong'}
            </div>
          </div>
        </div>

        {state !== 'idle' && (
          <div style={styles.logsContainer}>
            <div style={styles.logsHeader}>Setup Logs</div>
            <div style={styles.logsContent}>
              {logs.map((log, index) => (
                <div key={index} style={styles.logLine}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      <div style={styles.actions}>
        {state === 'idle' && (
          <button onClick={handleStartSetup} style={styles.buttonPrimary}>
            Continue with Installation
          </button>
        )}
        {state === 'success' && (
          <button onClick={onComplete} style={styles.buttonPrimary}>
            Continue to Setup
          </button>
        )}
        {state === 'error' && (
          <button onClick={handleStartSetup} style={styles.buttonSecondary}>
            Retry Installation
          </button>
        )}
        {(state === 'downloading' || state === 'installing' || state === 'starting') && (
          <div style={styles.pleaseWait}>
            Please wait... This may take a few minutes
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px',
    maxWidth: '700px',
    margin: '0 auto'
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '8px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '32px',
    lineHeight: '1.5'
  },
  statusCard: {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '24px',
    backgroundColor: '#fafafa',
    marginBottom: '24px'
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px'
  },
  statusIcon: {
    fontSize: '48px',
    lineHeight: '1'
  },
  statusLabel: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '4px'
  },
  statusSubtext: {
    fontSize: '14px',
    color: '#666'
  },
  logsContainer: {
    marginTop: '20px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: 'white'
  },
  logsHeader: {
    padding: '12px 16px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #ddd',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  logsContent: {
    padding: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
    fontFamily: 'Monaco, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4'
  },
  logLine: {
    marginBottom: '4px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  errorBox: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#fff3f3',
    border: '1px solid #ffcccc',
    borderRadius: '6px',
    color: '#cc0000',
    fontSize: '14px'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  },
  buttonPrimary: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    backgroundColor: '#007aff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  buttonSecondary: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    backgroundColor: 'white',
    color: '#007aff',
    border: '1px solid #007aff',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  pleaseWait: {
    padding: '12px 24px',
    fontSize: '16px',
    color: '#666',
    fontStyle: 'italic'
  }
}
