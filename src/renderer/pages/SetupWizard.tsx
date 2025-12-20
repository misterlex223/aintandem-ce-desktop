import React, { useState, useEffect } from 'react'
import RuntimeSetupStep from '../components/RuntimeSetupStep'

interface SetupWizardProps {
  onComplete: () => void
  runtimeType: 'docker' | 'containerd' | 'lima' | 'none'
}

export default function SetupWizard({ onComplete, runtimeType }: SetupWizardProps) {
  // Start at step 0 if runtime is not available, otherwise step 1
  const [step, setStep] = useState(runtimeType === 'none' ? 0 : 1)
  const [config, setConfig] = useState({
    baseDirectory: '',
    codeServerPassword: '',
    frontendUrl: 'http://localhost:9901'
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load default base directory on mount
    const loadDefaults = async () => {
      if (window.kai) {
        const defaultDir = await window.kai.config.getDefaultBaseDirectory()
        setConfig(prev => ({ ...prev, baseDirectory: defaultDir }))
      }
    }
    loadDefaults()
  }, [])

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1)
    } else {
      // Save config and complete setup (skip the cloud frontend step)
      setSaving(true)
      setValidationErrors([])

      try {
        // Validate configuration
        const validation = await window.kai.config.validate({
          baseDirectory: config.baseDirectory,
          frontendUrl: 'http://localhost:9901', // Use default value
          services: {
            codeServer: { password: config.codeServerPassword, port: 8443 },
            backend: { port: 9900, nodeEnv: 'production' }
          }
        })

        if (!validation.valid) {
          setValidationErrors(validation.errors.map(e => e.message))
          setSaving(false)
          return
        }

        // Save configuration
        await window.kai.config.update({
          baseDirectory: config.baseDirectory,
          frontendUrl: 'http://localhost:9901', // Use default value
          services: {
            codeServer: { password: config.codeServerPassword, port: 8443 },
            backend: { port: 9900, nodeEnv: 'production' }
          }
        })

        // Create base directory
        await window.kai.config.ensureBaseDirectory()

        // Mark setup as complete
        await window.kai.config.markSetupComplete()

        // Complete setup
        onComplete()
      } catch (error) {
        console.error('Failed to save configuration:', error)
        setValidationErrors([`Failed to save configuration: ${error}`])
      } finally {
        setSaving(false)
      }
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
      setValidationErrors([])
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.wizard}>
        <h1 style={styles.title}>AInTandem Setup</h1>

        {/* Progress indicator */}
        <div style={styles.progress}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                ...styles.progressStep,
                ...(s <= step ? styles.progressStepActive : {})
              }}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={styles.content}>
          {step === 0 && (
            <RuntimeSetupStep
              runtimeType={runtimeType}
              onComplete={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <div>
              <h2 style={styles.stepTitle}>Welcome to AInTandem</h2>
              <p style={styles.text}>
                Build with AI, safely, on your own machine.
              </p>
              <div style={styles.infoBox}>
                <strong>Runtime Detected:</strong> {runtimeType}
                {runtimeType === 'docker' && (
                  <div style={styles.infoText}>Using Docker Desktop (Developer Mode)</div>
                )}
                {runtimeType === 'containerd' && (
                  <div style={styles.infoText}>Using containerd (End-User Mode)</div>
                )}
                {runtimeType === 'none' && (
                  <div style={{ ...styles.infoText, color: '#d32f2f' }}>
                    No container runtime detected. Please install Docker Desktop.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={styles.stepTitle}>Base Directory</h2>
              <p style={styles.text}>
                Choose where Kai will store your projects and data.
              </p>
              <input
                type="text"
                style={styles.input}
                placeholder="e.g., /Users/yourname/AiTBase"
                value={config.baseDirectory}
                onChange={(e) =>
                  setConfig({ ...config, baseDirectory: e.target.value })
                }
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={styles.stepTitle}>Security Configuration</h2>
              <p style={styles.text}>Set passwords for your services.</p>

              <label style={styles.label}>Code Server Password</label>
              <input
                type="password"
                style={styles.input}
                placeholder="Enter Code Server password"
                value={config.codeServerPassword}
                onChange={(e) =>
                  setConfig({ ...config, codeServerPassword: e.target.value })
                }
              />
            </div>
          )}

        </div>

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

        {/* Navigation buttons (hidden on step 0 - runtime setup has its own button) */}
        {step !== 0 && (
          <div style={styles.buttons}>
            <button
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleBack}
              disabled={step === 1 || saving}
            >
              Back
            </button>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary }}
              onClick={handleNext}
              disabled={saving}
            >
              {saving ? 'Saving...' : (step === 3 ? 'Finish' : 'Next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  wizard: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    maxWidth: '600px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#333'
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginBottom: '40px'
  },
  progressStep: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    color: '#999'
  },
  progressStepActive: {
    background: '#667eea',
    color: 'white'
  },
  content: {
    minHeight: '300px',
    marginBottom: '30px'
  },
  stepTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '15px',
    color: '#333'
  },
  text: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#666',
    marginBottom: '20px'
  },
  infoBox: {
    background: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginTop: '20px'
  },
  infoText: {
    marginTop: '10px',
    color: '#666'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
    marginTop: '20px'
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  buttons: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '15px'
  },
  button: {
    flex: 1,
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  buttonPrimary: {
    background: '#667eea',
    color: 'white'
  },
  buttonSecondary: {
    background: '#e0e0e0',
    color: '#666'
  },
  errorBox: {
    background: '#ffebee',
    border: '2px solid #c62828',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '20px'
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
  }
}
