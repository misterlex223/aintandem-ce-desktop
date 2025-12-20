import React, { useState, useEffect } from 'react';

const AInTandemPage: React.FC = () => {
  const [iframeUrl, setIframeUrl] = useState<string>('http://localhost:9901');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if the frontend service is running by attempting to connect to it
    const checkFrontendStatus = async () => {
      try {
        // Check if we can reach the frontend
        const response = await fetch('http://localhost:9901', {
          method: 'GET',
          mode: 'cors', // Enable CORS
        });

        if (response.ok || response.status === 200) {
          setLoading(false);
          setError(null);
        } else {
          setError('Frontend service is not responding correctly');
          setLoading(false);
        }
      } catch {
        console.error('Error checking frontend status');
        setError('Could not connect to frontend service. Make sure all services are running.');
        setLoading(false);
      }
    };

    checkFrontendStatus();
  }, []);

  const handleReload = () => {
    setError(null);
    setLoading(true);
    // Force a reload by temporarily changing the URL
    setIframeUrl('');
    setTimeout(() => {
      setIframeUrl('http://localhost:9901');
      setLoading(true);
      // Check status again
      const checkBackendStatus = async () => {
        try {
          const response = await fetch('http://localhost:9900/api/health', {
            method: 'GET',
            mode: 'cors',
          });
          
          if (response.ok) {
            setLoading(false);
            setError(null);
          } else {
            setError('Backend service is not responding correctly');
            setLoading(false);
          }
        } catch {
          setError('Could not connect to backend service. Make sure all services are running.');
          setLoading(false);
        }
      };
      checkBackendStatus();
    }, 100);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>AInTandem Interface</h1>
        <div style={styles.controls}>
          <button style={styles.reloadButton} onClick={handleReload}>
            Reload
          </button>
        </div>
      </div>
      
      {error && (
        <div style={styles.errorContainer}>
          <div style={styles.errorContent}>
            <h3 style={styles.errorTitle}>Connection Error</h3>
            <p style={styles.errorText}>{error}</p>
            <p style={styles.errorHint}>
              Please make sure all Kai services are running, especially the Backend service.
            </p>
            <button style={styles.retryButton} onClick={handleReload}>
              Retry Connection
            </button>
          </div>
        </div>
      )}
      
      {loading && !error && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Connecting to AInTandem interface...</p>
        </div>
      )}
      
      {!error && (
        <div style={styles.iframeContainer}>
          <iframe
            src={iframeUrl}
            title="AInTandem Interface"
            style={styles.iframe}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
            onLoad={() => !error && setLoading(false)}
            onError={() => setError('Failed to load AInTandem interface')}
          />
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    backgroundColor: 'white',
    borderBottom: '2px solid #e0e0e0',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
  },
  controls: {
    display: 'flex',
    gap: '10px',
  },
  reloadButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid #ccc',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#666',
    cursor: 'pointer',
  },
  errorContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    padding: '20px',
  },
  errorContent: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '8px',
    textAlign: 'center',
    maxWidth: '500px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  errorTitle: {
    margin: '0 0 15px 0',
    color: '#c62828',
    fontSize: '18px',
  },
  errorText: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '14px',
  },
  errorHint: {
    margin: '15px 0',
    color: '#666',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  retryButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#667eea',
    color: 'white',
    cursor: 'pointer',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    padding: '20px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '20px',
    color: '#666',
    fontSize: '14px',
  },
  iframeContainer: {
    flex: 1,
    position: 'relative',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
  },
};

// Add the keyframes for the spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default AInTandemPage;
