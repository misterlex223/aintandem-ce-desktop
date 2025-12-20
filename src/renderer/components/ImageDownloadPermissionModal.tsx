import React, { useEffect, useState } from 'react';

interface ImageDownloadPermissionModalProps {
  onRequest: (request: { id: string; serviceName: string; imageName: string; size: string }) => void;
  respond: (requestId: string, allowed: boolean) => void;
}

interface PermissionRequest {
  id: string;
  serviceName: string;
  imageName: string;
  size: string;
}

const ImageDownloadPermissionModal: React.FC<ImageDownloadPermissionModalProps> = ({ onRequest, respond }) => {
  const [request, setRequest] = useState<PermissionRequest | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onRequest((req) => {
      setRequest(req);
      setShowModal(true);
    });

    return () => unsubscribe();
  }, [onRequest]);

  const handleAllow = () => {
    if (request) {
      respond(request.id, true);
      setShowModal(false);
    }
  };

  const handleDeny = () => {
    if (request) {
      respond(request.id, false);
      setShowModal(false);
    }
  };

  if (!showModal || !request) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>Download Image</h3>
        </div>
        
        <div style={styles.body}>
          <p style={styles.message}>
            The <strong>{request.serviceName}</strong> service requires the following image to run:
          </p>
          
          <div style={styles.imageInfo}>
            <strong>Image:</strong> {request.imageName}
          </div>
          
          {request.size !== 'unknown' && (
            <div style={styles.imageInfo}>
              <strong>Size:</strong> {request.size}
            </div>
          )}
          
          <p style={styles.confirmation}>
            Do you want to download this image now?
          </p>
        </div>
        
        <div style={styles.footer}>
          <button style={styles.denyButton} onClick={handleDeny}>
            Deny
          </button>
          <button style={styles.allowButton} onClick={handleAllow}>
            Allow Download
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
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    width: '450px',
    maxWidth: '90%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  header: {
    marginBottom: '15px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  body: {
    marginBottom: '20px',
  },
  message: {
    margin: '0 0 15px 0',
    color: '#333',
    lineHeight: '1.5',
  },
  imageInfo: {
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    marginBottom: '10px',
    fontFamily: 'monospace',
    fontSize: '14px',
  },
  confirmation: {
    margin: '15px 0 0 0',
    color: '#333',
    fontWeight: '500',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  denyButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    background: 'white',
    color: '#666',
  },
  allowButton: {
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

export default ImageDownloadPermissionModal;