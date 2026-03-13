import { useState, useEffect, useCallback } from 'react';
import { fetchTrades, deleteTrade, updateTrade } from './api';
import TradeForm from './TradeForm';

const ACCOUNTS  = ['Moomoo', 'IBKR', 'TradeStation'];
const STATUSES  = ['open', 'closed', 'expired'];

const STRATEGY_LABELS = {
  CSP: 'CSP', covered_call: 'Covered Call', put_spread: 'Put Spread',
  call_spread: 'Call Spread', iron_condor: 'Iron Condor',
  calendar: 'Calendar', diagonal: 'Diagonal', seagull: 'Seagull', risk_reversal: 'Risk Reversal',
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
  const [sortDir,       setSortDir]       = useState('desc');
  const [closingTrade,  setClosingTrade]  = useState(null);

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

  const calcPnL = (t) => {
    const prem      = parseFloat(t.net_premium);
    const contracts = parseFloat(t.contracts);
    if (isNaN(prem) || isNaN(contracts) || t.status === 'open') return null;
    // expired worthless → close_price treated as 0
    const closeP = t.status === 'expired' && (t.close_price == null || t.close_price === '')
      ? 0
      : parseFloat(t.close_price);
    if (isNaN(closeP)) return null;
    return (prem - closeP) * contracts * 100;
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
                {['Ticker','Strategy','Acct'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', color: '#7dd3fc' }}
                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
                  Open {sortDir === 'asc' ? '▲' : '▼'}
                </th>
                {['Exp','Net Prem','Ctrs','Status','Close Date','P&L','Notes',''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...trades].sort((a, b) => {
                const da = a.open_date || '', db = b.open_date || '';
                return sortDir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
              }).map((t, i) => {
                const pnl = calcPnL(t);
                return (
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
                  <td style={tdStyle}><span style={statusBadge(t.status)}>{t.status}</span></td>
                  <td style={{ ...tdStyle, ...mono }}>{t.close_date || '—'}</td>
                  <td style={tdStyle}>
                    {pnl != null
                      ? <span style={{ ...mono, fontWeight: 700, color: pnl >= 0 ? '#4ade80' : '#f87171' }}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                        </span>
                      : <span style={{ color: '#475569' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}>
                    {t.notes || '—'}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {t.status === 'open' && (
                      <button onClick={() => setClosingTrade(t)} style={{ ...btnSmall, color: '#4ade80', borderColor: '#166534' }}>Close</button>
                    )}
                    <button onClick={() => openEdit(t)} style={btnSmall}>Edit</button>
                    <button onClick={() => handleDelete(t.id, t.ticker)} style={{ ...btnSmall, color: '#f87171', borderColor: '#7f1d1d' }}>Del</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <TradeForm trade={editTrade} onSave={handleSaved} onClose={closeForm} />
      )}

      {closingTrade && (
        <CloseModal
          trade={closingTrade}
          onSave={() => { setClosingTrade(null); load(); }}
          onClose={() => setClosingTrade(null)}
        />
      )}
    </div>
  );
}

function CloseModal({ trade, onSave, onClose }) {
  const [status,     setStatus]     = useState('closed');
  const [closeDate,  setCloseDate]  = useState(new Date().toISOString().slice(0, 10));
  const [closePrice, setClosePrice] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const pnlPreview = (() => {
    const prem = parseFloat(trade.net_premium);
    const ctrs = parseFloat(trade.contracts);
    const cp   = status === 'expired' && closePrice === '' ? 0 : parseFloat(closePrice);
    if (isNaN(prem) || isNaN(ctrs) || isNaN(cp)) return null;
    return (prem - cp) * ctrs * 100;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateTrade(trade.id, {
        ...trade,
        status,
        close_date:  closeDate || null,
        close_price: closePrice !== '' ? parseFloat(closePrice) : null,
      });
      onSave();
    } catch {
      setError('Save failed — check your connection');
      setSaving(false);
    }
  };

  const inp = {
    width: '100%', padding: '7px 10px',
    background: '#020817', border: '1px solid #334155', borderRadius: 6,
    color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box',
    fontFamily: "'JetBrains Mono', monospace", outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 28, width: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 16 }}>
            Close Trade — <span style={{ color: '#38bdf8' }}>{trade.ticker}</span>
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ background: '#020817', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
          Open premium: <span style={{ color: '#4ade80' }}>${trade.net_premium}</span>
          &nbsp;·&nbsp;{trade.contracts} contract{trade.contracts !== 1 ? 's' : ''}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outcome</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
              <option value="closed">Closed (bought back)</option>
              <option value="expired">Expired worthless</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Close Date</label>
            <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} style={inp} />
          </div>

          {status === 'closed' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Close Price (cost to close)</label>
              <input type="number" step="0.01" min="0" value={closePrice} onChange={e => setClosePrice(e.target.value)}
                placeholder="e.g. 0.45" style={inp} />
            </div>
          )}

          {pnlPreview != null && (
            <div style={{
              background: pnlPreview >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${pnlPreview >= 0 ? '#166534' : '#7f1d1d'}`,
              borderRadius: 6, padding: '10px 14px', marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated P&L</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: pnlPreview >= 0 ? '#4ade80' : '#f87171' }}>
                {pnlPreview >= 0 ? '+' : ''}${pnlPreview.toFixed(0)}
              </div>
            </div>
          )}

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', padding: '8px 18px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ background: '#0ea5e9', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Confirm Close'}
            </button>
          </div>
        </form>
      </div>
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
