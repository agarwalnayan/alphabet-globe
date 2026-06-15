import React, { useState, useEffect } from 'react';
import GlobeView from './components/GlobeView';
import AdminPanel from './components/AdminPanel';
import './App.css';

export default function App() {
  const [view, setView] = useState('globe'); // 'globe' | 'admin'
  const [models, setModels] = useState([]);

  const fetchModels = async () => {
  try {
    const API_URL = 'https://alphabet-globe.onrender.com';

    console.log("API_URL =", API_URL);

    const res = await fetch(`${API_URL}/api/models`);

    console.log("Status =", res.status);
    console.log("Response URL =", res.url);

    const text = await res.text();
    console.log("Response:", text);

    const data = JSON.parse(text);

    setModels(data.models || []);
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
