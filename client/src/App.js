import React, { useState, useEffect } from 'react';
import GlobeView from './components/GlobeView';
import AdminPanel from './components/AdminPanel';
import { apiUrl, normalizeModelUrl } from './config/api';
import './App.css';

export default function App() {
  const [view, setView] = useState('globe'); // 'globe' | 'admin'
  const [models, setModels] = useState([]);

  const fetchModels = async () => {
    try {
      const res = await fetch(apiUrl('/api/models'));
      if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
      const data = await res.json();
      setModels((data.models || []).map(m => ({
        ...m,
        url: normalizeModelUrl(m.url)
      })));
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  return (
    <div className="app">
      {/* Nav */}
      <nav className="app-nav">
        <div className="nav-logo">
          <span className="logo-text">ALPHABET</span>
          <span className="logo-accent">GLOBE</span>
        </div>
        <div className="nav-links">
          <button
            className={`nav-btn ${view === 'globe' ? 'active' : ''}`}
            onClick={() => setView('globe')}
          >
            ◎ Experience
          </button>
          <button
            className={`nav-btn ${view === 'admin' ? 'active' : ''}`}
            onClick={() => setView('admin')}
          >
            ⬡ Admin
          </button>
        </div>
      </nav>

      {view === 'globe' ? (
        <GlobeView models={models} />
      ) : (
        <AdminPanel onModelsUpdated={fetchModels} models={models} />
      )}
    </div>
  );
}
