import React, { useEffect, useState } from 'react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ isOpen, onClose }) => {
  const [appInfo, setAppInfo] = useState({
    name: '',
    version: '',
    description: '',
    author: '',
    license: '',
    homepage: '',
    repository: ''
  });

  useEffect(() => {
    // Get app info from window.kai if available
    if (window.kai && window.kai.app) {
      // We'll populate this from the main process
      window.kai.app.getInfo().then((info: any) => {
        setAppInfo(info);
      }).catch(() => {
        // Fallback to default values if API is not available
        setAppInfo({
          name: 'AInTandem Desktop',
          version: '0.5.0',
          description: 'Your local AI sandbox for safe, collaborative building',
          author: 'AInTandem Team',
          license: 'AGPLv3',
          homepage: 'https://github.com/aintandem/kai-desktop',
          repository: 'https://github.com/aintandem/kai-desktop'
        });
      });
    } else {
      // Fallback to default values
      setAppInfo({
        name: 'AInTandem Desktop',
        version: '0.5.0',
        description: 'Your local AI sandbox for safe, collaborative building',
        author: 'AInTandem Team',
        license: 'AGPLv3',
        homepage: 'https://github.com/aintandem/kai-desktop',
        repository: 'https://github.com/aintandem/kai-desktop'
      });
    }
  }, []);

  if (!isOpen) {
    return null;
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{appInfo.name}</h2>
          <button style={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </div>
        
        <div style={styles.content}>
          <div style={styles.infoSection}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Version:</span>
              <span style={styles.infoValue}>{appInfo.version}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Author:</span>
              <span style={styles.infoValue}>{appInfo.author}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>License:</span>
              <span style={styles.infoValue}>{appInfo.license}</span>
            </div>
          </div>
          
          <div style={styles.description}>
            {appInfo.description}
          </div>
          
          <div style={styles.linksSection}>
            <div style={styles.linkRow}>
              <a 
                href={appInfo.homepage} 
                style={styles.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Homepage
              </a>
            </div>
            <div style={styles.linkRow}>
              <a 
                href={appInfo.repository} 
                style={styles.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Repository
              </a>
            </div>
          </div>
        </div>
        
        <div style={styles.footer}>
          <button style={styles.okButton} onClick={handleClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '450px',
    maxWidth: '90%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666',
    padding: '0',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: '20px',
  },
  infoSection: {
    marginBottom: '15px',
  },
  infoRow: {
    display: 'flex',
    marginBottom: '8px',
  },
  infoLabel: {
    fontWeight: 'bold',
    color: '#333',
    minWidth: '80px',
    marginRight: '10px',
  },
  infoValue: {
    color: '#666',
    flex: 1,
  },
  description: {
    marginBottom: '15px',
    color: '#555',
    lineHeight: '1.5',
  },
  linksSection: {
    marginBottom: '20px',
  },
  linkRow: {
    marginBottom: '5px',
  },
  link: {
    color: '#667eea',
    textDecoration: 'none',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '20px',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  okButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    background: '#667eea',
    color: 'white',
  },
};

export default AboutDialog;