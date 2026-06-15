import React, { useState, useRef, useCallback } from 'react';
import './AdminPanel.css';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function AdminPanel({ onModelsUpdated, models }) {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [uploads, setUploads] = useState({}); // { letter: { file, status, error } }
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [globalError, setGlobalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileInputRef = useRef(null);

  const uploadedLetters = new Set(models.map(m => m.letter));

  const handleAuth = () => {
    // Client-side check (server also validates)
    if (password === 'alphabet@123') {
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Incorrect password');
      setTimeout(() => setAuthError(''), 3000);
    }
  };

  const addFilesToQueue = useCallback((files) => {
    const incomingFiles = Array.from(files || []).filter(file => file.name.toLowerCase().endsWith('.glb'));
    if (incomingFiles.length === 0) return;

    setUploads(prev => {
      const newUploads = { ...prev };
      incomingFiles.forEach(file => {
        const base = file.name.replace(/\.glb$/i, '').toUpperCase().trim();
        const letter = base.slice(-1);
        if (ALPHABET.includes(letter)) {
          newUploads[letter] = { file, status: 'queued', error: null };
        }
      });
      return newUploads;
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    addFilesToQueue(e.dataTransfer.files);
  }, [addFilesToQueue]);

  const handleFileInput = (e) => {
    addFilesToQueue(e.target.files);
  };

  const handleLetterFileInput = (letter, file) => {
    if (!file || !file.name.toLowerCase().endsWith('.glb')) return;
    setUploads(prev => ({
      ...prev,
      [letter]: { file, status: 'queued', error: null }
    }));
  };

  const removeFromQueue = (letter) => {
    setUploads(prev => {
      const n = { ...prev };
      delete n[letter];
      return n;
    });
  };

  const uploadAll = async () => {
    const queued = Object.entries(uploads).filter(([, v]) => v.status === 'queued');
    if (queued.length === 0) return;
    if (!password.trim()) {
      setGlobalError('Please enter the admin password first.');
      return;
    }

    setGlobalError('');
    setSuccessMsg('');

    for (const [letter, { file }] of queued) {
      setUploads(prev => ({
        ...prev,
        [letter]: { ...prev[letter], status: 'uploading' }
      }));

      try {
        const formData = new FormData();
        // Rename file to letter.glb for server
        const renamedFile = new File([file], `${letter}.glb`, { type: file.type });
        formData.append('models', renamedFile);

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'x-upload-password': password },
          body: formData
        });

        const data = await res.json();
        if (res.ok) {
          setUploads(prev => ({
            ...prev,
            [letter]: { ...prev[letter], status: 'done' }
          }));
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (err) {
        setUploads(prev => ({
          ...prev,
          [letter]: { ...prev[letter], status: 'error', error: err.message }
        }));
      }
    }

    onModelsUpdated();
    setSuccessMsg('Upload complete!');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const deleteModel = async (letter) => {
    try {
      const res = await fetch(`/api/models/${letter}`, {
        method: 'DELETE',
        headers: { 'x-upload-password': password }
      });
      if (res.ok) {
        onModelsUpdated();
      } else {
        const d = await res.json();
        setGlobalError(d.error || 'Delete failed');
      }
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-auth">
        <div className="auth-card">
          <div className="auth-icon">⬡</div>
          <h2 className="auth-title">ADMIN ACCESS</h2>
          <p className="auth-sub">Enter password to manage GLB models</p>
          <input
            type="password"
            className="auth-input"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            autoFocus
          />
          {authError && <p className="auth-error">{authError}</p>}
          <button className="auth-btn" onClick={handleAuth}>UNLOCK</button>
        </div>
      </div>
    );
  }

  const queuedCount = Object.values(uploads).filter(u => u.status === 'queued').length;
  const doneCount = Object.values(uploads).filter(u => u.status === 'done').length;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">MODEL MANAGER</h1>
          <p className="admin-sub">{models.length} / 26 letters uploaded</p>
        </div>
        <div className="admin-stats">
          <div className="stat">
            <span className="stat-val">{models.length}</span>
            <span className="stat-label">UPLOADED</span>
          </div>
          <div className="stat">
            <span className="stat-val">{queuedCount}</span>
            <span className="stat-label">QUEUED</span>
          </div>
          <div className="stat">
            <span className="stat-val">{26 - models.length}</span>
            <span className="stat-label">MISSING</span>
          </div>
        </div>
      </div>

      {globalError && <div className="alert error">{globalError}</div>}
      {successMsg && <div className="alert success">{successMsg}</div>}

      {/* Bulk drop zone */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <div className="dz-icon">⬆</div>
        <p className="dz-title">DROP GLB FILES HERE</p>
        <p className="dz-sub">Files should be named A.glb, B.glb etc. · Max 50MB each</p>
      </div>

      {/* Upload queue action */}
      {queuedCount > 0 && (
        <div className="upload-action">
          <button className="upload-btn" onClick={uploadAll}>
            ▲ UPLOAD {queuedCount} FILE{queuedCount > 1 ? 'S' : ''}
          </button>
        </div>
      )}

      {/* Alphabet grid */}
      <div className="alphabet-grid">
        {ALPHABET.map(letter => {
          const isUploaded = uploadedLetters.has(letter);
          const queued = uploads[letter];
          const status = queued?.status || (isUploaded ? 'uploaded' : 'empty');

          return (
            <div key={letter} className={`letter-card ${status}`}>
              <div className="lc-letter">{letter}</div>
              <div className="lc-status">
                {status === 'uploaded' && <span className="badge uploaded">✓ LIVE</span>}
                {status === 'queued' && <span className="badge queued">● QUEUED</span>}
                {status === 'uploading' && <span className="badge uploading">↑ …</span>}
                {status === 'done' && <span className="badge done">✓ DONE</span>}
                {status === 'error' && <span className="badge error-badge" title={queued?.error}>✗ ERR</span>}
                {status === 'empty' && <span className="badge empty">— NONE</span>}
              </div>

              <div className="lc-actions">
                {(status === 'empty' || status === 'error') && (
                  <label className="lc-btn select-btn" title={`Upload ${letter}.glb`}>
                    <input
                      type="file"
                      accept=".glb"
                      style={{ display: 'none' }}
                      onChange={e => handleLetterFileInput(letter, e.target.files[0])}
                    />
                    +
                  </label>
                )}
                {status === 'queued' && (
                  <button className="lc-btn remove-btn" onClick={() => removeFromQueue(letter)} title="Remove from queue">
                    ✕
                  </button>
                )}
                {(status === 'uploaded' || status === 'done') && (
                  <button className="lc-btn delete-btn" onClick={() => deleteModel(letter)} title={`Delete ${letter}.glb`}>
                    ✕
                  </button>
                )}
              </div>

              {queued?.file && (
                <div className="lc-filename" title={queued.file.name}>
                  {queued.file.name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Uploaded models list */}
      {models.length > 0 && (
        <div className="models-section">
          <h3 className="section-title">LIVE MODELS ({models.length})</h3>
          <div className="models-list">
            {models.map(m => (
              <div key={m.letter} className="model-row">
                <span className="ml-letter">{m.letter}</span>
                <span className="ml-file">{m.filename}</span>
                <span className="ml-url">{m.url}</span>
                <button
                  className="ml-delete"
                  onClick={() => deleteModel(m.letter)}
                >
                  DELETE
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
