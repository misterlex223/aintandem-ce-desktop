import React, { useEffect, useState } from 'react'
import SetupWizard from './pages/SetupWizard'
import Dashboard from './pages/Dashboard'
import UpdateNotification from './components/UpdateNotification'

function App() {
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [runtimeType, setRuntimeType] = useState<'docker' | 'containerd' | 'none'>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check runtime type and setup status on mount
    const initialize = async () => {
      if (window.kai) {
        try {
          const [type, setupComplete] = await Promise.all([
            window.kai.runtime.getType(),
            window.kai.config.isSetupComplete()
          ])
          setRuntimeType(type)
          setIsSetupComplete(setupComplete)
        } catch (error) {
          console.error('Failed to initialize app:', error)
        } finally {
          setLoading(false)
        }
      }
    }

    initialize()
  }, [])

  const handleSetupComplete = () => {
    setIsSetupComplete(true)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '20px'
      }}>
        Loading Kai Desktop...
      </div>
    )
  }

  if (!isSetupComplete) {
    return (
      <>
        <SetupWizard onComplete={handleSetupComplete} runtimeType={runtimeType} />
        <UpdateNotification />
      </>
    )
  }

  return (
    <>
      <Dashboard />
      <UpdateNotification />
    </>
  )
}

export default App
