import { useState, useEffect } from 'react';
import { fetchTrades } from './api';

// ─── Payoff computation ───────────────────────────────────────────────────────
// Each leg: pnl = (premium - intrinsic) if SELL, (intrinsic - premium) if BUY
// Scaled by contracts × 100 for dollar P&L

function computePayoff(trade, prices) {
  const legs = [];
  for (let i = 1; i <= 4; i++) {
    const strike  = parseFloat(trade[`leg${i}_strike`]);
    const type    = trade[`leg${i}_type`];
    const action  = trade[`leg${i}_action`];
    const premium = parseFloat(trade[`leg${i}_premium`]) || 0;
    if (!strike || !type || !action) continue;
    legs.push({ strike, type, action, premium });
  }
  if (!legs.length) return prices.map(() => 0);
  const multiplier = (parseFloat(trade.contracts) || 1) * 100;
  return prices.map(S => {
    let pnl = 0;
    for (const { strike, type, action, premium } of legs) {
      const intrinsic = type === 'P' ? Math.max(0, strike - S) : Math.max(0, S - strike);
      pnl += action === 'SELL' ? (premium - intrinsic) : (intrinsic - premium);
    }
    return pnl * multiplier;
  });
}

function getStrikes(trade) {
  const s = [];
  for (let i = 1; i <= 4; i++) {
    const v = parseFloat(trade[`leg${i}_strike`]);
    if (v) s.push(v);
  }
  return s;
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────

function PayoffChart({ trade }) {
  const strikes = getStrikes(trade);
  const center  = trade.stock_price
    ? parseFloat(trade.stock_price)
    : strikes.length ? (Math.min(...strikes) + Math.max(...strikes)) / 2 : 100;
  const buffer   = center * 0.4;
  const minPrice = Math.max(0.01, center - buffer);
  const maxPrice = center + buffer;

  const N = 300;
  const prices  = Array.from({ length: N }, (_, i) => minPrice + (i / (N - 1)) * (maxPrice - minPrice));
  const payoffs = computePayoff(trade, prices);

  // Theoretical extremes: include S=0 (full put assignment) and S=maxPrice×4 (unbounded call)
  // These are kept separate so the visual chart range stays centered on the stock price.
  const statPrices  = [0, ...prices, maxPrice * 2, maxPrice * 4];
  const statPayoffs = computePayoff(trade, statPrices);
  const maxPnl = Math.max(...statPayoffs, 0);
  const minPnl = Math.min(...statPayoffs, 0);

  // Y-axis scale uses only the visible range payoffs so the chart isn't squashed
  const visMaxPnl = Math.max(...payoffs, 0);
  const visMinPnl = Math.min(...payoffs, 0);
  const pnlRange = (visMaxPnl - visMinPnl) || 1;

  const W = 580, H = 280;
  const pL = 72, pR = 20, pT = 24, pB = 44;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  const xS = p  => pL + ((p - minPrice) / (maxPrice - minPrice)) * cW;
  const yS = v  => pT + (1 - (v - visMinPnl) / pnlRange) * cH;
  const zeroY   = yS(0);

  const pts     = prices.map((p, i) => `${xS(p).toFixed(1)},${yS(payoffs[i]).toFixed(1)}`).join(' ');
  const closed  = `${pts} ${xS(maxPrice).toFixed(1)},${zeroY.toFixed(1)} ${xS(minPrice).toFixed(1)},${zeroY.toFixed(1)}`;

  // Breakevens (sign changes)
  const breakevens = [];
  for (let i = 1; i < payoffs.length; i++) {
    if (payoffs[i - 1] * payoffs[i] < 0) {
      const t = -payoffs[i - 1] / (payoffs[i] - payoffs[i - 1]);
      const be = prices[i - 1] + t * (prices[i] - prices[i - 1]);
      if (be >= minPrice && be <= maxPrice) breakevens.push(be);
    }
  }

  // P&L axis grid (5 lines) — uses visible range so grid isn't squashed
  const gridVals = Array.from({ length: 5 }, (_, i) => visMinPnl + (i / 4) * pnlRange);

  const fmtY = (v) => {
    const abs = Math.abs(v);
    const s = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : abs.toFixed(0);
    return v < 0 ? `-$${s}` : `$${s}`;
  };

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 28, marginBottom: 18, flexWrap: 'wrap' }}>
        <Stat label="Max Profit" value={`$${Math.max(...payoffs).toFixed(0)}`}  color="#4ade80" />
        <Stat label="Max Loss"   value={`-$${Math.abs(Math.min(...payoffs)).toFixed(0)}`} color="#f87171" />
        {breakevens.map((b, i) => (
          <Stat key={i} label={breakevens.length > 1 ? `Breakeven ${i + 1}` : 'Breakeven'}
            value={`$${b.toFixed(2)}`} color="#fbbf24" />
        ))}
        {trade.stock_price && (
          <Stat label="Stock Price" value={`$${parseFloat(trade.stock_price).toFixed(2)}`} color="#94a3b8" />
        )}
      </div>

      {/* SVG */}
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id="cp-profit">
            <rect x={pL} y={pT} width={cW} height={Math.max(0, zeroY - pT)} />
          </clipPath>
          <clipPath id="cp-loss">
            <rect x={pL} y={zeroY} width={cW} height={Math.max(0, pT + cH - zeroY)} />
          </clipPath>
        </defs>

        {/* Grid lines + Y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={pL} y1={yS(v)} x2={pL + cW} y2={yS(v)} stroke="#1e293b" strokeWidth="1" />
            <text x={pL - 6} y={yS(v)} textAnchor="end" fill="#475569" fontSize="10" dominantBaseline="middle">
              {fmtY(v)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        <line x1={pL} y1={zeroY} x2={pL + cW} y2={zeroY} stroke="#334155" strokeWidth="1.5" />

        {/* Strike vertical guides */}
        {strikes.map((s, i) => (
          <g key={i}>
            <line x1={xS(s)} y1={pT} x2={xS(s)} y2={pT + cH} stroke="#1e3a5f" strokeWidth="1" strokeDasharray="3,3" />
            <text x={xS(s)} y={pT - 8} textAnchor="middle" fill="#334155" fontSize="9">${s}</text>
          </g>
        ))}

        {/* Stock price line */}
        {trade.stock_price && (
          <line
            x1={xS(parseFloat(trade.stock_price))} y1={pT}
            x2={xS(parseFloat(trade.stock_price))} y2={pT + cH}
            stroke="#64748b" strokeWidth="1" strokeDasharray="5,3"
          />
        )}

        {/* Profit fill */}
        <polygon points={closed} fill="rgba(74,222,128,0.12)" clipPath="url(#cp-profit)" />
        {/* Loss fill */}
        <polygon points={closed} fill="rgba(248,113,113,0.12)" clipPath="url(#cp-loss)" />

        {/* Payoff line — green above zero, red below */}
        <polyline points={pts} fill="none" stroke="rgba(74,222,128,0.9)"  strokeWidth="2" clipPath="url(#cp-profit)" />
        <polyline points={pts} fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2" clipPath="url(#cp-loss)" />

        {/* Breakeven markers */}
        {breakevens.map((b, i) => (
          <g key={i}>
            <line x1={xS(b)} y1={pT} x2={xS(b)} y2={pT + cH} stroke="#fbbf24" strokeWidth="1" strokeDasharray="4,3" />
            <circle cx={xS(b)} cy={zeroY} r="3" fill="#fbbf24" />
            <text x={xS(b)} y={pT + cH + 14} textAnchor="middle" fill="#fbbf24" fontSize="10">
              ${b.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X axis price labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const price = minPrice + t * (maxPrice - minPrice);
          return (
            <text key={t} x={xS(price)} y={pT + cH + 28} textAnchor="middle" fill="#475569" fontSize="10">
              ${price.toFixed(0)}
            </text>
          );
        })}

        {/* Axis labels */}
        <text x={pL + cW / 2} y={H - 2} textAnchor="middle" fill="#334155" fontSize="10">
          Underlying Price at Expiration
        </text>
        <text
          x={14} y={pT + cH / 2} textAnchor="middle" fill="#334155" fontSize="10"
          transform={`rotate(-90, 14, ${pT + cH / 2})`}
        >
          P&amp;L ($)
        </text>
      </svg>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUSES = ['open', 'closed', 'expired'];

export default function OptionsChart() {
  const [trades,        setTrades]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedId,    setSelectedId]    = useState('');
  const [filterStatus,  setFilterStatus]  = useState('open');

  useEffect(() => {
    setLoading(true);
    fetchTrades({ status: filterStatus }).then(data => {
      const t = data.trades || [];
      setTrades(t);
      setSelectedId(t.length > 0 ? t[0].id : '');
      setLoading(false);
    });
  }, [filterStatus]);

  const trade   = trades.find(t => t.id === selectedId);
  const hasLegs = trade && getStrikes(trade).length > 0;

  const STRATEGY_LABELS = {
    CSP: 'CSP', covered_call: 'Covered Call', put_spread: 'Put Spread',
    call_spread: 'Call Spread', iron_condor: 'Iron Condor',
    calendar: 'Calendar', diagonal: 'Diagonal', seagull: 'Seagull', risk_reversal: 'Risk Reversal',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: '#e2e8f0', fontSize: 20 }}>P&amp;L Diagrams</h2>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '6px 10px', fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {!loading && trades.length > 0 && (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              color: '#e2e8f0', padding: '7px 12px', fontSize: 13, minWidth: 280,
            }}
          >
            {trades.map(t => (
              <option key={t.id} value={t.id}>
                {t.ticker} · {STRATEGY_LABELS[t.strategy] || t.strategy} · {t.open_date || 'N/A'}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading trades…</p>}

      {!loading && trades.length === 0 && (
        <p style={{ color: '#64748b' }}>No open trades. Add trades with leg data in the Trade Tracker.</p>
      )}

      {!loading && trade && !hasLegs && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 24 }}>
          <p style={{ color: '#f59e0b', margin: 0 }}>
            This trade has no leg strikes entered. Edit the trade in the Trade Tracker to add strike prices and premiums.
          </p>
        </div>
      )}

      {!loading && trade && hasLegs && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', color: '#38bdf8', fontSize: 15, fontWeight: 600 }}>
            {trade.ticker} · {STRATEGY_LABELS[trade.strategy] || trade.strategy}
            {trade.exp_date && <span style={{ color: '#64748b', fontWeight: 400 }}> · exp {trade.exp_date}</span>}
            <span style={{ color: '#334155', fontWeight: 400, fontSize: 13 }}> · {trade.contracts || 1} contract{(trade.contracts || 1) !== 1 ? 's' : ''}</span>
          </h3>
          <PayoffChart trade={trade} />
          <p style={{ color: '#334155', fontSize: 11, marginTop: 12, marginBottom: 0 }}>
            Chart shows P&amp;L at expiration. Calendar and diagonal spreads show front-month expiration approximation.
          </p>
        </div>
      )}
    </div>
  );
}
