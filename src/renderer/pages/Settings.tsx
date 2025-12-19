import React, { useEffect, useState } from 'react'

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'general' | 'services' | 'advanced'>('general')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [runtimeStatus, setRuntimeStatus] = useState<{
    docker: boolean
    containerd: boolean
    current: 'docker' | 'containerd' | 'none'
  } | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    loadConfig()
    loadRuntimeStatus()
  }, [])

  const loadConfig = async () => {
    try {
      const cfg = await window.kai.config.get()
      setConfig(cfg)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRuntimeStatus = async () => {
    try {
      const status = await window.kai.runtime.detectAvailable()
      setRuntimeStatus(status)
    } catch (error) {
      console.error('Failed to load runtime status:', error)
    }
  }

  const handleSwitchRuntime = async (type: 'docker' | 'containerd') => {
    setSwitching(true)
    try {
      await window.kai.runtime.switch(type)
      await loadRuntimeStatus()
      alert(`Switched to ${type} runtime successfully!`)
    } catch (error) {
      alert(`Failed to switch runtime: ${error}`)
    } finally {
      setSwitching(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setValidationErrors([])

    try {
      // Validate
      const validation = await window.kai.config.validate(config)
      if (!validation.valid) {
        setValidationErrors(validation.errors.map(e => e.message))
        setSaving(false)
        return
      }

      // Save
      await window.kai.config.update(config)
      onClose()
    } catch (error) {
      console.error('Failed to save config:', error)
      setValidationErrors([`Failed to save: ${error}`])
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This will close the app.')) {
      await window.kai.config.reset()
      window.location.reload()
    }
  }

  const handleExport = async () => {
    const json = await window.kai.config.export()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kai-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || !config) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{...styles.tab, ...(tab === 'general' ? styles.tabActive : {})}}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            style={{...styles.tab, ...(tab === 'services' ? styles.tabActive : {})}}
            onClick={() => setTab('services')}
          >
            Services
          </button>
          <button
            style={{...styles.tab, ...(tab === 'advanced' ? styles.tabActive : {})}}
            onClick={() => setTab('advanced')}
          >
            Advanced
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {tab === 'general' && (
            <div>
              <div style={styles.field}>
                <label style={styles.label}>Base Directory</label>
                <input
                  type="text"
                  style={styles.input}
                  value={config.baseDirectory}
                  onChange={(e) => setConfig({...config, baseDirectory: e.target.value})}
                />
                <p style={styles.hint}>Where Kai stores your projects and data</p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Cloud Frontend URL</label>
                <input
                  type="text"
                  style={styles.input}
                  value={config.cloudFrontendUrl}
                  onChange={(e) => setConfig({...config, cloudFrontendUrl: e.target.value})}
                />
                <p style={styles.hint}>URL of your cloud-deployed frontend</p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Preferred Runtime</label>
                <select
                  style={styles.select}
                  value={config.preferredRuntime}
                  onChange={(e) => setConfig({...config, preferredRuntime: e.target.value})}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="docker">Docker Desktop</option>
                  <option value="containerd">Containerd</option>
                </select>
              </div>

              {/* Runtime Status */}
              {runtimeStatus && (
                <div style={styles.field}>
                  <label style={styles.label}>Runtime Status</label>
                  <div style={styles.runtimeStatus}>
                    <div style={styles.runtimeItem}>
                      <span style={styles.runtimeName}>Current Runtime:</span>
                      <span style={{
                        ...styles.runtimeBadge,
                        background: runtimeStatus.current === 'none' ? '#ffebee' : '#e8f5e9',
                        color: runtimeStatus.current === 'none' ? '#c62828' : '#2e7d32'
                      }}>
                        {runtimeStatus.current === 'none' ? 'Not Available' : runtimeStatus.current}
                      </span>
                    </div>
                    <div style={styles.runtimeItem}>
                      <span style={styles.runtimeName}>Docker Desktop:</span>
                      <span style={{
                        ...styles.runtimeBadge,
                        background: runtimeStatus.docker ? '#e8f5e9' : '#ffebee',
                        color: runtimeStatus.docker ? '#2e7d32' : '#c62828'
                      }}>
                        {runtimeStatus.docker ? 'Available' : 'Not Installed'}
                      </span>
                      {runtimeStatus.docker && runtimeStatus.current !== 'docker' && (
                        <button
                          style={styles.switchButton}
                          onClick={() => handleSwitchRuntime('docker')}
                          disabled={switching}
                        >
                          Switch to Docker
                        </button>
                      )}
                    </div>
                    <div style={styles.runtimeItem}>
                      <span style={styles.runtimeName}>Containerd (nerdctl):</span>
                      <span style={{
                        ...styles.runtimeBadge,
                        background: runtimeStatus.containerd ? '#e8f5e9' : '#ffebee',
                        color: runtimeStatus.containerd ? '#2e7d32' : '#c62828'
                      }}>
                        {runtimeStatus.containerd ? 'Available' : 'Not Installed'}
                      </span>
                      {runtimeStatus.containerd && runtimeStatus.current !== 'containerd' && (
                        <button
                          style={styles.switchButton}
                          onClick={() => handleSwitchRuntime('containerd')}
                          disabled={switching}
                        >
                          Switch to Containerd
                        </button>
                      )}
                    </div>
                  </div>
                  <p style={styles.hint}>
                    {!runtimeStatus.docker && !runtimeStatus.containerd && (
                      <>No container runtime detected. Install Docker Desktop or nerdctl to use Kai Desktop.</>
                    )}
                    {(runtimeStatus.docker || runtimeStatus.containerd) && (
                      <>You can switch between available runtimes. App will restart services after switching.</>
                    )}
                  </p>
                </div>
              )}

              <div style={styles.field}>
                <label style={styles.label}>Theme</label>
                <select
                  style={styles.select}
                  value={config.ui.theme}
                  onChange={(e) => setConfig({...config, ui: {...config.ui, theme: e.target.value}})}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          )}

          {tab === 'services' && (
            <div>
              <div style={styles.field}>
                <label style={styles.label}>Backend Port</label>
                <input
                  type="number"
                  style={styles.input}
                  value={config.services.backend.port}
                  onChange={(e) => setConfig({...config, services: {...config.services, backend: {...config.services.backend, port: parseInt(e.target.value)}}})}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Neo4j Port</label>
                <input
                  type="number"
                  style={styles.input}
                  value={config.services.neo4j.port}
                  onChange={(e) => setConfig({...config, services: {...config.services, neo4j: {...config.services.neo4j, port: parseInt(e.target.value)}}})}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Neo4j Password</label>
                <input
                  type="password"
                  style={styles.input}
                  value={config.services.neo4j.password}
                  onChange={(e) => setConfig({...config, services: {...config.services, neo4j: {...config.services.neo4j, password: e.target.value}}})}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Code Server Port</label>
                <input
                  type="number"
                  style={styles.input}
                  value={config.services.codeServer.port}
                  onChange={(e) => setConfig({...config, services: {...config.services, codeServer: {...config.services.codeServer, port: parseInt(e.target.value)}}})}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Code Server Password</label>
                <input
                  type="password"
                  style={styles.input}
                  value={config.services.codeServer.password}
                  onChange={(e) => setConfig({...config, services: {...config.services, codeServer: {...config.services.codeServer, password: e.target.value}}})}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Qdrant Port</label>
                <input
                  type="number"
                  style={styles.input}
                  value={config.services.qdrant.port}
                  onChange={(e) => setConfig({...config, services: {...config.services, qdrant: {...config.services.qdrant, port: parseInt(e.target.value)}}})}
                />
              </div>
            </div>
          )}

          {tab === 'advanced' && (
            <div>
              <div style={styles.field}>
                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={config.env.contextEnabled}
                    onChange={(e) => setConfig({...config, env: {...config.env, contextEnabled: e.target.checked}})}
                  />
                  <span style={{marginLeft: '8px'}}>Enable Context System</span>
                </label>
              </div>

              <div style={styles.field}>
                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={config.env.autoCaptureEnabled}
                    onChange={(e) => setConfig({...config, env: {...config.env, autoCaptureEnabled: e.target.checked}})}
                  />
                  <span style={{marginLeft: '8px'}}>Auto-capture Task Dialogs</span>
                </label>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Embedding Provider</label>
                <select
                  style={styles.select}
                  value={config.env.embeddingProvider}
                  onChange={(e) => setConfig({...config, env: {...config.env, embeddingProvider: e.target.value}})}
                >
                  <option value="openai">OpenAI</option>
                  <option value="local">Local</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Task Completion Timeout (ms)</label>
                <input
                  type="number"
                  style={styles.input}
                  value={config.env.taskCompletionTimeout}
                  onChange={(e) => setConfig({...config, env: {...config.env, taskCompletionTimeout: parseInt(e.target.value)}})}
                />
              </div>
            </div>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div style={styles.errorBox}>
              <strong>Please fix the following errors:</strong>
              <ul style={styles.errorList}>
                {validationErrors.map((error, index) => (
                  <li key={index} style={styles.errorItem}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <button style={styles.buttonDanger} onClick={handleReset}>
              Reset to Defaults
            </button>
            <button style={styles.buttonSecondary} onClick={handleExport}>
              Export Config
            </button>
          </div>
          <div style={styles.footerRight}>
            <button style={styles.buttonSecondary} onClick={onClose}>
              Cancel
            </button>
            <button style={styles.buttonPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
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
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    color: '#666',
    lineHeight: 1
  },
  tabs: {
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
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px'
  },
  field: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    outline: 'none'
  },
  hint: {
    fontSize: '12px',
    color: '#999',
    marginTop: '5px'
  },
  errorBox: {
    background: '#ffebee',
    border: '2px solid #c62828',
    borderRadius: '8px',
    padding: '15px',
    marginTop: '20px'
  },
  errorList: {
    marginTop: '10px',
    marginLeft: '20px',
    marginBottom: '0'
  },
  errorItem: {
    color: '#c62828',
    fontSize: '14px',
    marginBottom: '5px'
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '20px',
    borderTop: '1px solid #e0e0e0'
  },
  footerLeft: {
    display: 'flex',
    gap: '10px'
  },
  footerRight: {
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
  buttonDanger: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#ffebee',
    color: '#c62828'
  },
  runtimeStatus: {
    background: '#f9f9f9',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    padding: '15px'
  },
  runtimeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px'
  },
  runtimeName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#666',
    minWidth: '180px'
  },
  runtimeBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600'
  },
  switchButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white',
    marginLeft: 'auto'
  }
}
