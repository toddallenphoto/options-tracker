import { useState } from 'react';
import Login from './Login';
import TradeTracker from './TradeTracker';
import OptionsChart from './OptionsChart';
import './App.css';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [page, setPage]   = useState('tracker');

  const handleLogin = (tok) => {
    localStorage.setItem('token', tok);
    setToken(tok);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#e2e8f0' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 24px', height: 52,
        borderBottom: '1px solid #1e293b', background: '#0f172a',
      }}>
        <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: 15, marginRight: 8 }}>
          Options Tracker
        </span>
        <button onClick={() => setPage('tracker')}  style={navBtn(page === 'tracker')}>
          Trade Tracker
        </button>
        <button onClick={() => setPage('diagrams')} style={navBtn(page === 'diagrams')}>
          P&amp;L Diagrams
        </button>
        <button onClick={handleLogout} style={{ marginLeft: 'auto', ...navBtn(false) }}>
          Logout
        </button>
      </nav>
      <main style={{ padding: 24 }}>
        {page === 'tracker'  && <TradeTracker />}
        {page === 'diagrams' && <OptionsChart />}
      </main>
    </div>
  );
}

const navBtn = (active) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '6px 14px', borderRadius: 6,
  color: active ? '#38bdf8' : '#94a3b8',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
});
