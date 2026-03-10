import { useState } from 'react';
import { login } from './api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await login(username, password);
      if (data.token) {
        onLogin(data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error — is the Worker running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#020817',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: 12, padding: 40, width: 360,
      }}>
        <h1 style={{ color: '#38bdf8', margin: '0 0 28px', fontSize: 22, textAlign: 'center', fontWeight: 700 }}>
          Options Tracker
        </h1>
        <label style={labelStyle}>Username</label>
        <input
          value={username} onChange={e => setUsername(e.target.value)}
          autoFocus required style={inputStyle}
        />
        <label style={labelStyle}>Password</label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          required style={inputStyle}
        />
        {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 14px' }}>{error}</p>}
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '10px 0', borderRadius: 8,
          background: loading ? '#0369a1' : '#0ea5e9',
          border: 'none', color: '#fff', fontWeight: 600, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
        }}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

const labelStyle = {
  display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6, fontWeight: 500,
};
const inputStyle = {
  width: '100%', padding: '8px 12px', marginBottom: 16,
  background: '#020817', border: '1px solid #334155',
  borderRadius: 8, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box',
  outline: 'none',
};
