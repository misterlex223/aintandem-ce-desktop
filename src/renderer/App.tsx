import React, { useEffect, useState } from 'react'
import SetupWizard from './pages/SetupWizard'
import Dashboard from './pages/Dashboard'
import UpdateNotification from './components/UpdateNotification'
import AboutDialog from './components/AboutDialog'

function App() {
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [runtimeType, setRuntimeType] = useState<'docker' | 'containerd' | 'none'>('none')
  const [loading, setLoading] = useState(true)
  const [showAboutDialog, setShowAboutDialog] = useState(false)

  useEffect(() => {
    // Check runtime type and setup status on mount
    const initialize = async () => {
      if (window.kai) {
        try {
          const type = await window.kai.runtime.getType();
          const setupComplete = await window.kai.config.isSetupComplete();
          setRuntimeType(type);
          setIsSetupComplete(setupComplete);
        } catch (error) {
          console.error('Failed to initialize app:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    // Listen for about dialog request from main process
    const handleAboutMenu = () => {
      setShowAboutDialog(true);
    };

    // Listen for show-about-dialog event from main process
    let unsubscribeAboutEvent = () => {};

    if (window.kai && window.kai['about-dialog'] && window.kai['about-dialog'].onShow) {
      unsubscribeAboutEvent = window.kai['about-dialog'].onShow(handleAboutMenu);
    } else {
      // Fallback: set up the listener once kai is available
      const checkAndSetupListener = () => {
        if (window.kai && window.kai['about-dialog'] && window.kai['about-dialog'].onShow) {
          unsubscribeAboutEvent = window.kai['about-dialog'].onShow(handleAboutMenu);
        } else {
          // Keep trying until kai is ready
          setTimeout(checkAndSetupListener, 100);
        }
      };
      checkAndSetupListener();
    }

    // Add global shortcut listener for about dialog
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + A to open about dialog
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowAboutDialog(true);
      }
    };

    initialize();

    // Add keyboard shortcut listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribeAboutEvent();
    };
  }, []);

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
        Loading AInTandem...
      </div>
    )
  }

  if (!isSetupComplete) {
    return (
      <>
        <SetupWizard onComplete={handleSetupComplete} runtimeType={runtimeType} />
        <UpdateNotification />
        <AboutDialog
          isOpen={showAboutDialog}
          onClose={() => setShowAboutDialog(false)}
        />
      </>
    )
  }

  // Show dashboard for service management after setup
  return (
    <>
      <Dashboard />
      <UpdateNotification />
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />
    </>
  )
}

export default App
