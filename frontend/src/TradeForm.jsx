import { useState, useEffect } from 'react';
import { createTrade, updateTrade } from './api';

const STRATEGIES = ['CSP', 'covered_call', 'put_spread', 'call_spread', 'iron_condor', 'calendar', 'diagonal', 'risk_reversal', 'seagull'];
const ACCOUNTS   = ['Moomoo', 'IBKR', 'TradeStation'];
const STATUSES   = ['open', 'closed', 'expired'];

// How many legs each strategy uses
const LEG_COUNT = { CSP: 1, covered_call: 1, put_spread: 2, call_spread: 2, iron_condor: 4, calendar: 2, diagonal: 2, seagull: 3, risk_reversal: 2 };

// Default leg action/type per strategy
const LEG_DEFAULTS = {
  CSP:          [['SELL','P']],
  covered_call: [['SELL','C']],
  put_spread:   [['SELL','P'], ['BUY','P']],
  call_spread:  [['SELL','C'], ['BUY','C']],
  iron_condor:  [['SELL','P'], ['BUY','P'], ['SELL','C'], ['BUY','C']],
  calendar:     [['SELL','P'], ['BUY','P']],
  diagonal:     [['SELL','P'], ['BUY','P']],
  seagull:      [['SELL','P'], ['BUY','C'], ['SELL','C']],  // OTM put / ATM call / further OTM call
  risk_reversal:[['SELL','P'], ['BUY','C']],               // OTM put finances ATM/OTM call
};

const EMPTY = {
  ticker: '', strategy: 'CSP', account: 'IBKR', status: 'open',
  open_date: new Date().toISOString().slice(0, 10),
  exp_date: '', close_date: '', close_price: '',
  leg1_strike: '', leg1_type: 'P', leg1_action: 'SELL', leg1_premium: '', leg1_expiry: '',
  leg2_strike: '', leg2_type: 'P', leg2_action: 'BUY',  leg2_premium: '', leg2_expiry: '',
  leg3_strike: '', leg3_type: 'P', leg3_action: 'SELL', leg3_premium: '',
  leg4_strike: '', leg4_type: 'C', leg4_action: 'BUY',  leg4_premium: '',
  contracts: '', net_premium: '', stock_price: '',
  target_close: '', stop_loss: '', notes: '',
};

export default function TradeForm({ trade, onSave, onClose }) {
  const isEdit = !!trade?.id;
  const [form,   setForm]   = useState(isEdit ? { ...EMPTY, ...trade } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const numLegs = LEG_COUNT[form.strategy] || 1;

  // Apply default leg types/actions when strategy changes (new trade only)
  useEffect(() => {
    if (isEdit) return;
    const defs = LEG_DEFAULTS[form.strategy] || [];
    setForm(f => {
      const updates = {};
      for (let i = 0; i < 4; i++) {
        updates[`leg${i + 1}_action`] = defs[i]?.[0] ?? f[`leg${i + 1}_action`];
        updates[`leg${i + 1}_type`]   = defs[i]?.[1] ?? f[`leg${i + 1}_type`];
      }
      return { ...f, ...updates };
    });
  }, [form.strategy, isEdit]);

  // Auto-compute net premium from legs
  useEffect(() => {
    let net = 0, hasData = false;
    for (let i = 1; i <= numLegs; i++) {
      const p = parseFloat(form[`leg${i}_premium`]);
      const a = form[`leg${i}_action`];
      if (!isNaN(p) && a) {
        net += a === 'SELL' ? p : -p;
        hasData = true;
      }
    }
    if (hasData) setForm(f => ({ ...f, net_premium: net.toFixed(2) }));
  }, [
    form.leg1_premium, form.leg1_action,
    form.leg2_premium, form.leg2_action,
    form.leg3_premium, form.leg3_action,
    form.leg4_premium, form.leg4_action,
    numLegs,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      // Cast numeric fields
      const numFs = [
        'leg1_strike','leg1_premium','leg2_strike','leg2_premium',
        'leg3_strike','leg3_premium','leg4_strike','leg4_premium',
        'contracts','net_premium','stock_price','close_price','target_close','stop_loss',
      ];
      numFs.forEach(f => { payload[f] = payload[f] !== '' && payload[f] != null ? parseFloat(payload[f]) : null; });
      // Null out unused legs
      for (let i = numLegs + 1; i <= 4; i++) {
        payload[`leg${i}_strike`] = null;
        payload[`leg${i}_type`]   = null;
        payload[`leg${i}_action`] = null;
        payload[`leg${i}_premium`]= null;
      }
      // Null empty date strings
      ['exp_date','close_date','leg1_expiry','leg2_expiry'].forEach(f => {
        if (!payload[f]) payload[f] = null;
      });

      if (isEdit) {
        await updateTrade(trade.id, payload);
      } else {
        await createTrade(payload);
      }
      onSave();
    } catch {
      setError('Save failed — check your connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
        padding: 28, width: 760, maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 17 }}>
            {isEdit ? `Edit Trade — ${trade.ticker}` : 'Add Trade'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Row 1: Core fields */}
          <Row>
            <Field label="Ticker *">
              <input value={form.ticker} onChange={set('ticker')} required style={inp} placeholder="GDX" />
            </Field>
            <Field label="Strategy *">
              <select value={form.strategy} onChange={set('strategy')} style={inp}>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Account *">
              <select value={form.account} onChange={set('account')} style={inp}>
                {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Status *">
              <select value={form.status} onChange={set('status')} style={inp}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </Row>

          {/* Row 2: Dates + position */}
          <Row>
            <Field label="Open Date *">
              <input type="date" value={form.open_date} onChange={set('open_date')} required style={inp} />
            </Field>
            <Field label="Exp Date">
              <input type="date" value={form.exp_date} onChange={set('exp_date')} style={inp} />
            </Field>
            <Field label="Stock Price">
              <input type="number" step="0.01" value={form.stock_price} onChange={set('stock_price')} style={inp} placeholder="0.00" />
            </Field>
            <Field label="Contracts">
              <input type="number" step="1" min="0" value={form.contracts} onChange={set('contracts')} style={inp} placeholder="1" />
            </Field>
          </Row>

          {/* Legs */}
          <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', margin: '14px 0 8px', textTransform: 'uppercase' }}>
            Legs ({numLegs} for {form.strategy})
          </p>
          {Array.from({ length: numLegs }, (_, i) => i + 1).map(n => (
            <LegRow key={n} n={n} form={form} set={set} showExpiry={n <= 2} />
          ))}

          {/* Net premium + risk */}
          <Row>
            <Field label="Net Premium (auto)">
              <input
                type="number" step="0.01" value={form.net_premium} onChange={set('net_premium')}
                style={{ ...inp, color: parseFloat(form.net_premium) >= 0 ? '#4ade80' : '#f87171', fontFamily: "'JetBrains Mono', monospace" }}
              />
            </Field>
            <Field label="Target Close">
              <input type="number" step="0.01" value={form.target_close} onChange={set('target_close')} style={inp} placeholder="0.00" />
            </Field>
            <Field label="Stop Loss">
              <input type="number" step="0.01" value={form.stop_loss} onChange={set('stop_loss')} style={inp} placeholder="0.00" />
            </Field>
          </Row>

          {/* Close fields — only when not open */}
          {form.status !== 'open' && (
            <Row>
              <Field label="Close Date">
                <input type="date" value={form.close_date} onChange={set('close_date')} style={inp} />
              </Field>
              <Field label="Close Price">
                <input type="number" step="0.01" value={form.close_price} onChange={set('close_price')} style={inp} placeholder="0.00" />
              </Field>
            </Row>
          )}

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={set('notes')} style={{ ...inp, height: 56, resize: 'vertical' }} />
          </Field>

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '8px 0' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : isEdit ? 'Update Trade' : 'Add Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LegRow({ n, form, set, showExpiry }) {
  return (
    <div style={{ background: '#020817', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
      {/* Sub-row 1: label + action + type */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 8 }}>
        <span style={{
          color: '#38bdf8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          minWidth: 44, paddingBottom: 7, textTransform: 'uppercase',
        }}>
          Leg {n}
        </span>
        <Field label="Action" compact>
          <select value={form[`leg${n}_action`]} onChange={set(`leg${n}_action`)} style={{ ...inp, minWidth: 80 }}>
            <option value="SELL">SELL</option>
            <option value="BUY">BUY</option>
          </select>
        </Field>
        <Field label="Type" compact>
          <select value={form[`leg${n}_type`]} onChange={set(`leg${n}_type`)} style={{ ...inp, minWidth: 80 }}>
            <option value="P">Put</option>
            <option value="C">Call</option>
          </select>
        </Field>
      </div>
      {/* Sub-row 2: strike + premium + expiry */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', paddingLeft: 54 }}>
        <Field label="Strike">
          <input type="number" step="0.5" value={form[`leg${n}_strike`]} onChange={set(`leg${n}_strike`)} style={inp} placeholder="0.00" />
        </Field>
        <Field label="Premium">
          <input type="number" step="0.01" value={form[`leg${n}_premium`]} onChange={set(`leg${n}_premium`)} style={inp} placeholder="0.00" />
        </Field>
        {showExpiry && (
          <Field label="Expiry">
            <input type="date" value={form[`leg${n}_expiry`]} onChange={set(`leg${n}_expiry`)} style={inp} />
          </Field>
        )}
      </div>
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>{children}</div>;
}
function Field({ label, children, compact }) {
  return (
    <div style={{ flex: compact ? '0 0 auto' : 1, minWidth: 0 }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '6px 8px',
  background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
  color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box',
  fontFamily: 'inherit', outline: 'none',
};
const btnPrimary   = { background: '#0ea5e9', border: 'none', borderRadius: 6, color: '#fff', padding: '8px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnSecondary = { background: 'none', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', padding: '8px 22px', cursor: 'pointer', fontSize: 14 };
