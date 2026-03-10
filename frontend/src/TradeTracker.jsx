import { useState, useEffect, useCallback } from 'react';
import { fetchTrades, deleteTrade } from './api';
import TradeForm from './TradeForm';

const ACCOUNTS  = ['Moomoo', 'IBKR', 'TradeStation'];
const STATUSES  = ['open', 'closed', 'expired'];

const STRATEGY_LABELS = {
  CSP: 'CSP', covered_call: 'Covered Call', put_spread: 'Put Spread',
  call_spread: 'Call Spread', iron_condor: 'Iron Condor',
  calendar: 'Calendar', diagonal: 'Diagonal',
};

const mono = { fontFamily: "'JetBrains Mono', monospace" };

export default function TradeTracker() {
  const [trades,        setTrades]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('open');
  const [showForm,      setShowForm]      = useState(false);
  const [editTrade,     setEditTrade]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTrades({ account: filterAccount, status: filterStatus });
      setTrades(data.trades || []);
    } catch {
      setError('Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, [filterAccount, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, ticker) => {
    if (!confirm(`Delete ${ticker} trade?`)) return;
    await deleteTrade(id);
    load();
  };

  const openAdd  = ()      => { setEditTrade(null); setShowForm(true); };
  const openEdit = (trade) => { setEditTrade(trade); setShowForm(true); };
  const closeForm = ()     => { setShowForm(false); setEditTrade(null); };
  const handleSaved = ()   => { closeForm(); load(); };

  const fmt = (v, prefix = '') =>
    v != null && v !== '' ? <span style={mono}>{prefix}{v}</span> : <span style={{ color: '#475569' }}>—</span>;
  const fmtMoney = (v) => {
    if (v == null || v === '') return <span style={{ color: '#475569' }}>—</span>;
    const n = Number(v);
    return <span style={{ ...mono, color: n >= 0 ? '#4ade80' : '#f87171' }}>${n.toFixed(2)}</span>;
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: 20 }}>Trade Tracker</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={selStyle}>
            <option value="">All Accounts</option>
            {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={openAdd} style={btnPrimary}>+ Add Trade</button>
        </div>
      </div>

      {error   && <p style={{ color: '#f87171' }}>{error}</p>}
      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {!loading && trades.length === 0 && (
        <p style={{ color: '#64748b' }}>No trades found. Add one to get started.</p>
      )}

      {!loading && trades.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1e293b' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#64748b' }}>
                {['Ticker','Strategy','Acct','Open','Exp','Net Prem','Ctrs','Stock Px','Status','Target','Stop','Notes',''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={t.id}
                  style={{ background: i % 2 === 0 ? '#0a1628' : '#020817', borderBottom: '1px solid #1e293b' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0f172a'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#0a1628' : '#020817'}
                >
                  <td style={tdStyle}>
                    <strong style={{ color: '#38bdf8', letterSpacing: '0.02em' }}>{t.ticker}</strong>
                  </td>
                  <td style={tdStyle}>
                    <span style={stratBadge}>{STRATEGY_LABELS[t.strategy] || t.strategy}</span>
                  </td>
                  <td style={tdStyle}>{t.account}</td>
                  <td style={{ ...tdStyle, ...mono }}>{t.open_date || '—'}</td>
                  <td style={{ ...tdStyle, ...mono }}>{t.exp_date  || '—'}</td>
                  <td style={tdStyle}>{fmtMoney(t.net_premium)}</td>
                  <td style={{ ...tdStyle, ...mono }}>{fmt(t.contracts)}</td>
                  <td style={{ ...tdStyle, ...mono }}>{t.stock_price ? `$${t.stock_price}` : '—'}</td>
                  <td style={tdStyle}><span style={statusBadge(t.status)}>{t.status}</span></td>
                  <td style={{ ...tdStyle, ...mono }}>{t.target_close ? `$${t.target_close}` : '—'}</td>
                  <td style={{ ...tdStyle, ...mono }}>{t.stop_loss   ? `$${t.stop_loss}`   : '—'}</td>
                  <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}>
                    {t.notes || '—'}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(t)}         style={btnSmall}>Edit</button>
                    <button onClick={() => handleDelete(t.id, t.ticker)} style={{ ...btnSmall, color: '#f87171', borderColor: '#7f1d1d' }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <TradeForm trade={editTrade} onSave={handleSaved} onClose={closeForm} />
      )}
    </div>
  );
}

const thStyle  = { padding: '10px 12px', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle  = { padding: '8px 12px', color: '#e2e8f0', verticalAlign: 'middle' };
const selStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 10px', fontSize: 13 };
const btnPrimary = { background: '#0ea5e9', border: 'none', borderRadius: 6, color: '#fff', padding: '7px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnSmall   = { background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', padding: '3px 8px', cursor: 'pointer', fontSize: 12, marginRight: 4 };
const stratBadge = { background: '#1e3a5f', color: '#7dd3fc', borderRadius: 4, padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap' };
const statusBadge = (s) => {
  const map = { open: ['#14532d', '#4ade80'], closed: ['#1e293b', '#94a3b8'], expired: ['#450a0a', '#f87171'] };
  const [bg, color] = map[s] || ['#1e293b', '#94a3b8'];
  return { background: bg, color, borderRadius: 4, padding: '2px 6px', fontSize: 11 };
};
