import React, { useState, useEffect, useCallback } from 'react'

interface RuntimeAvailability {
  docker: boolean
  containerd: boolean
  lima: boolean
  bundled: boolean
}

interface RuntimeModeSelectorProps {
  onSelect: (mode: 'docker' | 'containerd' | 'lima') => void
  onCancel?: () => void
  currentMode?: 'docker' | 'containerd' | 'lima' | 'none'
  showCancel?: boolean
}

export default function RuntimeModeSelector({
  onSelect,
  onCancel,
  currentMode,
  showCancel = false
}: RuntimeModeSelectorProps) {
  const [availability, setAvailability] = useState<RuntimeAvailability>({
    docker: false,
    containerd: false,
    lima: false,
    bundled: true // Bundled is always available
  })
  const [loading, setLoading] = useState(true)
  const [selectedMode, setSelectedMode] = useState<'docker' | 'containerd' | 'lima'>(
    currentMode === 'docker' ? 'docker' : currentMode === 'lima' ? 'lima' : 'containerd'
  )
  // Detect platform based on availability (Lima = macOS, Containerd = Linux/Windows)
  const [isMacOS, setIsMacOS] = useState(false)

  const checkRuntimeAvailability = useCallback(async () => {
    try {
      const result = await window.kai.runtime.detectAvailable()
      setAvailability({
        docker: result.docker,
        containerd: result.containerd,
        lima: result.lima,
        bundled: true
      })
      // Detect macOS: if Lima runtime is detected or current mode is lima
      setIsMacOS(result.lima || currentMode === 'lima')
    } catch (error) {
      console.error('Failed to check runtime availability:', error)
    } finally {
      setLoading(false)
    }
  }, [currentMode])

  useEffect(() => {
    checkRuntimeAvailability()
  }, [checkRuntimeAvailability])

  const handleSelect = () => {
    onSelect(selectedMode)
  }

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <h2 style={styles.title}>Detecting Container Runtimes...</h2>
          <div style={styles.loading}>
            <div style={styles.spinner} />
            <p>Please wait...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Choose Container Runtime Mode</h2>

        <p style={styles.subtitle}>
          Kai Desktop uses a bundled container runtime by default (no dependencies required).
          Developers can optionally use Docker Desktop if already installed.
        </p>

        <div style={styles.optionsContainer}>
          {/* Development Mode - Docker Desktop */}
          <div
            style={{
              ...styles.option,
              ...(selectedMode === 'docker' ? styles.optionSelected : {}),
              ...(availability.docker ? {} : styles.optionDisabled)
            }}
            onClick={() => availability.docker && setSelectedMode('docker')}
          >
            <div style={styles.optionHeader}>
              <div style={styles.radioContainer}>
                <input
                  type="radio"
                  checked={selectedMode === 'docker'}
                  onChange={() => setSelectedMode('docker')}
                  disabled={!availability.docker}
                  style={styles.radio}
                />
              </div>
              <div style={styles.optionContent}>
                <h3 style={styles.optionTitle}>
                  Development Mode (Optional)
                  {availability.docker && <span style={styles.badge}>Available</span>}
                  {!availability.docker && <span style={styles.badgeDisabled}>Not Installed</span>}
                </h3>
                <p style={styles.optionDescription}>
                  For developers who prefer Docker Desktop
                </p>
              </div>
            </div>

            <div style={styles.features}>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Full Docker CLI compatibility</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Docker Compose support</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Kubernetes integration (optional)</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Optional for advanced users</span>
              </div>
            </div>

            {!availability.docker && (
              <div style={styles.installNote}>
                <p>Not required. You can use User Mode instead (recommended).</p>
                <p style={{marginTop: '8px', fontSize: '13px', color: '#666'}}>
                  To enable Developer Mode, install{' '}
                  <a
                    href="https://www.docker.com/products/docker-desktop"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    Docker Desktop
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* User Mode - Lima (macOS) or Containerd (Linux/Windows) */}
          <div
            style={{
              ...styles.option,
              ...(selectedMode === (isMacOS ? 'lima' : 'containerd') ? styles.optionSelected : {})
            }}
            onClick={() => setSelectedMode(isMacOS ? 'lima' : 'containerd')}
          >
            <div style={styles.optionHeader}>
              <div style={styles.radioContainer}>
                <input
                  type="radio"
                  checked={selectedMode === (isMacOS ? 'lima' : 'containerd')}
                  onChange={() => setSelectedMode(isMacOS ? 'lima' : 'containerd')}
                  style={styles.radio}
                />
              </div>
              <div style={styles.optionContent}>
                <h3 style={styles.optionTitle}>
                  User Mode (Default)
                  <span style={styles.badgeRecommended}>Recommended</span>
                </h3>
                <p style={styles.optionDescription}>
                  {isMacOS
                    ? 'Bundled Lima runtime (no Docker Desktop required)'
                    : 'Bundled containerd runtime (no Docker Desktop required)'}
                </p>
              </div>
            </div>

            <div style={styles.features}>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>No external dependencies</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Lightweight and fast</span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>
                  {(isMacOS ? availability.lima : availability.containerd) || availability.bundled
                    ? 'Ready to use'
                    : 'Auto-download on first use'}
                </span>
              </div>
              <div style={styles.feature}>
                <span style={styles.featureIcon}>✓</span>
                <span>Best for end users</span>
              </div>
            </div>

            {!(isMacOS ? availability.lima : availability.containerd) && availability.bundled && (
              <div style={styles.infoNote}>
                <p>
                  <strong>Note:</strong> {isMacOS
                    ? 'Lima VM will be downloaded and started automatically (~200MB). Includes Ubuntu + containerd + nerdctl. No admin privileges required.'
                    : 'Bundled runtime will be downloaded and installed automatically (~50-100MB). No admin privileges required.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={styles.footer}>
          {showCancel && onCancel && (
            <button onClick={onCancel} style={styles.buttonSecondary}>
              Cancel
            </button>
          )}
          <button
            onClick={handleSelect}
            style={{
              ...styles.buttonPrimary,
              ...(selectedMode === 'docker' && !availability.docker
                ? styles.buttonDisabled
                : {})
            }}
            disabled={selectedMode === 'docker' && !availability.docker}
          >
            Continue with {selectedMode === 'docker' ? 'Development' : 'User'} Mode
            {selectedMode === 'lima' && ' (Lima)'}
            {selectedMode === 'containerd' && ' (Containerd)'}
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
    background: 'white',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '900px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '28px',
    fontWeight: '600',
    color: '#1a1a1a'
  },
  subtitle: {
    margin: '0 0 24px 0',
    fontSize: '16px',
    color: '#666',
    lineHeight: '1.5'
  },
  optionsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: '20px',
    marginBottom: '24px'
  },
  option: {
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: 'white'
  },
  optionSelected: {
    borderColor: '#007aff',
    background: '#f0f8ff'
  },
  optionDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  optionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: '16px'
  },
  radioContainer: {
    paddingTop: '2px',
    marginRight: '12px'
  },
  radio: {
    width: '20px',
    height: '20px',
    cursor: 'pointer'
  },
  optionContent: {
    flex: 1
  },
  optionTitle: {
    margin: '0 0 4px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  optionDescription: {
    margin: 0,
    fontSize: '14px',
    color: '#666'
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '500',
    background: '#e8f5e9',
    color: '#2e7d32',
    borderRadius: '4px'
  },
  badgeDisabled: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '500',
    background: '#fafafa',
    color: '#999',
    borderRadius: '4px'
  },
  badgeRecommended: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '500',
    background: '#e3f2fd',
    color: '#1976d2',
    borderRadius: '4px'
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#333'
  },
  featureIcon: {
    display: 'inline-block',
    width: '20px',
    color: '#4caf50',
    fontWeight: 'bold',
    marginRight: '8px'
  },
  installNote: {
    marginTop: '12px',
    padding: '12px',
    background: '#fff3e0',
    borderRadius: '6px',
    fontSize: '14px'
  },
  infoNote: {
    marginTop: '12px',
    padding: '12px',
    background: '#e3f2fd',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#1565c0'
  },
  link: {
    color: '#007aff',
    textDecoration: 'none',
    fontWeight: '500'
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid #e0e0e0'
  },
  buttonPrimary: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    background: '#007aff',
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
    background: 'white',
    color: '#007aff',
    border: '1px solid #007aff',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  buttonDisabled: {
    background: '#ccc',
    cursor: 'not-allowed'
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '40px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #007aff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}
