import React, { useEffect, useState } from 'react'

interface UpdateInfo {
  version: string
  releaseNotes?: string
  releaseDate?: string
}

interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export default function UpdateNotification() {
  const [checking, setChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.kai) return

    // Listen to update events
    const unsubChecking = window.kai.update.onChecking(() => {
      setChecking(true)
      setError(null)
    })

    const unsubAvailable = window.kai.update.onAvailable((info) => {
      setChecking(false)
      setUpdateAvailable(true)
      setUpdateInfo(info)
      setDismissed(false)
    })

    const unsubNotAvailable = window.kai.update.onNotAvailable(() => {
      setChecking(false)
      setUpdateAvailable(false)
    })

    const unsubError = window.kai.update.onError((message) => {
      setChecking(false)
      setDownloading(false)
      setError(message)
    })

    const unsubProgress = window.kai.update.onDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    const unsubDownloaded = window.kai.update.onDownloaded((info) => {
      setDownloading(false)
      setDownloaded(true)
      setUpdateInfo(info)
    })

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
      unsubProgress()
      unsubDownloaded()
    }
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await window.kai.update.download()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDownloading(false)
    }
  }

  const handleInstall = async () => {
    try {
      await window.kai.update.install()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100  } ${  sizes[i]}`
  }

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatBytes(bytesPerSecond)  }/s`
  }

  // Don't show if dismissed
  if (dismissed) return null

  // Show checking state
  if (checking) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <span style={styles.title}>Checking for updates...</span>
          </div>
        </div>
      </div>
    )
  }

  // Show error if any
  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.cardError }}>
          <div style={styles.header}>
            <span style={styles.title}>Update Error</span>
            <button style={styles.closeButton} onClick={handleDismiss}>
              ✕
            </button>
          </div>
          <p style={styles.errorText}>{error}</p>
        </div>
      </div>
    )
  }

  // Show update available
  if (updateAvailable && !downloaded) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <span style={styles.title}>
              Update Available: v{updateInfo?.version}
            </span>
            <button style={styles.closeButton} onClick={handleDismiss}>
              ✕
            </button>
          </div>

          {updateInfo?.releaseNotes && (
            <div style={styles.releaseNotes}>{updateInfo.releaseNotes}</div>
          )}

          {downloading && downloadProgress ? (
            <div style={styles.downloadSection}>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${downloadProgress.percent}%`
                  }}
                />
              </div>
              <div style={styles.downloadStats}>
                <span>
                  {downloadProgress.percent.toFixed(1)}% -{' '}
                  {formatBytes(downloadProgress.transferred)} /{' '}
                  {formatBytes(downloadProgress.total)}
                </span>
                <span>{formatSpeed(downloadProgress.bytesPerSecond)}</span>
              </div>
            </div>
          ) : (
            <div style={styles.actions}>
              <button
                style={styles.buttonPrimary}
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? 'Downloading...' : 'Download Update'}
              </button>
              <button style={styles.buttonSecondary} onClick={handleDismiss}>
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show update downloaded
  if (downloaded) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, ...styles.cardSuccess }}>
          <div style={styles.header}>
            <span style={styles.title}>
              Update Ready: v{updateInfo?.version}
            </span>
          </div>
          <p style={styles.message}>
            The update has been downloaded and is ready to install. The app will
            restart to apply the update.
          </p>
          <div style={styles.actions}>
            <button style={styles.buttonPrimary} onClick={handleInstall}>
              Restart & Install
            </button>
            <button style={styles.buttonSecondary} onClick={handleDismiss}>
              Install on Exit
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
    maxWidth: '400px'
  },
  card: {
    background: 'white',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    border: '2px solid #667eea'
  },
  cardError: {
    borderColor: '#c62828'
  },
  cardSuccess: {
    borderColor: '#2e7d32'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333'
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#999',
    padding: '0 4px'
  },
  releaseNotes: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '12px',
    maxHeight: '100px',
    overflow: 'auto'
  },
  message: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '12px',
    margin: 0
  },
  errorText: {
    fontSize: '14px',
    color: '#c62828',
    margin: 0
  },
  downloadSection: {
    marginBottom: '12px'
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressFill: {
    height: '100%',
    background: '#667eea',
    transition: 'width 0.3s ease'
  },
  downloadStats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace'
  },
  actions: {
    display: 'flex',
    gap: '8px'
  },
  buttonPrimary: {
    flex: 1,
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white'
  },
  buttonSecondary: {
    flex: 1,
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#e0e0e0',
    color: '#666'
  }
}
