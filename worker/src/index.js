// ─── JWT helpers (Web Crypto API — no external deps) ─────────────────────────

function b64url(s) {
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(payload));
  const input  = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${input}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [header, body, sig] = parts;
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(b64urlDecode(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(input));
  if (!valid) throw new Error('Invalid signature');
  const payload = JSON.parse(b64urlDecode(body));
  if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Expired');
  return payload;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data, status = 200) => Response.json(data, { status, headers: CORS });
const err  = (msg,  status = 400) => Response.json({ error: msg }, { status, headers: CORS });

// ─── Trade field list (matches schema exactly) ────────────────────────────────

const TRADE_FIELDS = [
  'ticker', 'strategy', 'account', 'open_date', 'exp_date',
  'leg1_strike', 'leg1_type', 'leg1_action', 'leg1_premium', 'leg1_expiry',
  'leg2_strike', 'leg2_type', 'leg2_action', 'leg2_premium', 'leg2_expiry',
  'leg3_strike', 'leg3_type', 'leg3_action', 'leg3_premium',
  'leg4_strike', 'leg4_type', 'leg4_action', 'leg4_premium',
  'contracts', 'net_premium', 'stock_price',
  'close_date', 'close_price', 'status',
  'target_close', 'stop_loss', 'notes',
];

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleLogin(request, env) {
  const { username, password } = await request.json();
  if (username !== env.USERNAME || password !== env.PASSWORD) {
    return err('Invalid credentials', 401);
  }
  const token = await signJWT(
    { sub: username, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, // 7 days
    env.JWT_SECRET
  );
  return json({ token });
}

async function handleGetTrades(request, env) {
  const url = new URL(request.url);
  const account = url.searchParams.get('account');
  const status  = url.searchParams.get('status');

  let query = 'SELECT * FROM trades';
  const conditions = [], params = [];
  if (account) { conditions.push('account = ?'); params.push(account); }
  if (status)  { conditions.push('status = ?');  params.push(status); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ trades: results });
}

async function handleCreateTrade(request, env) {
  const body = await request.json();
  const id   = crypto.randomUUID();
  const cols  = TRADE_FIELDS.join(', ');
  const placeholders = TRADE_FIELDS.map(() => '?').join(', ');
  const values = TRADE_FIELDS.map(f => body[f] ?? null);
  await env.DB.prepare(
    `INSERT INTO trades (id, ${cols}) VALUES (?, ${placeholders})`
  ).bind(id, ...values).run();
  return json({ id }, 201);
}

async function handleUpdateTrade(request, env, id) {
  const body   = await request.json();
  const sets   = TRADE_FIELDS.map(f => `${f} = ?`).join(', ');
  const values = TRADE_FIELDS.map(f => body[f] ?? null);
  const result = await env.DB.prepare(
    `UPDATE trades SET ${sets} WHERE id = ?`
  ).bind(...values, id).run();
  if (result.changes === 0) return err('Trade not found', 404);
  return json({ success: true });
}

async function handleDeleteTrade(env, id) {
  const result = await env.DB.prepare(
    'DELETE FROM trades WHERE id = ?'
  ).bind(id).run();
  if (result.changes === 0) return err('Trade not found', 404);
  return json({ success: true });
}

// ─── Option quote proxy (Yahoo Finance, ~15-min delayed) ─────────────────────

async function handleOptionQuote(request) {
  const url     = new URL(request.url);
  const symbols = url.searchParams.get('symbols');
  if (!symbols) return err('symbols param required');

  const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  let res;
  try {
    res = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
      },
    });
  } catch (e) {
    return err(`Upstream fetch failed: ${e.message}`, 502);
  }

  if (!res.ok) return err(`Yahoo Finance returned ${res.status}`, 502);

  const data = await res.json();
  const results = {};

  for (const q of data?.quoteResponse?.result || []) {
    const hasBidAsk = q.bid != null && q.ask != null && q.bid > 0 && q.ask > 0;
    const mid = hasBidAsk ? (q.bid + q.ask) / 2 : (q.regularMarketPrice ?? null);
    results[q.symbol] = {
      bid:  q.bid  ?? null,
      ask:  q.ask  ?? null,
      last: q.regularMarketPrice ?? null,
      mid,
    };
  }

  return json(results);
}

// ─── Morning Brief handlers ───────────────────────────────────────────────────

const BRIEF_FIELDS = [
  'es_high','es_low','es_dir','vix_input','gex_regime',
  'gex_plus','gex_minus','gex_wall','gex_trans','synthesis','steps',
];

async function handleGetBrief(request, env) {
  const url  = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('date param required (YYYY-MM-DD)');
  const row = await env.DB.prepare('SELECT * FROM morning_briefs WHERE date = ?').bind(date).first();
  return json({ brief: row ?? null });
}

async function handleGetBriefDates(env) {
  const { results } = await env.DB.prepare(
    'SELECT date FROM morning_briefs ORDER BY date DESC'
  ).all();
  return json({ dates: results.map(r => r.date) });
}

async function handleSaveBrief(request, env) {
  const body = await request.json();
  const date = body.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('date required (YYYY-MM-DD)');
  const values = BRIEF_FIELDS.map(f => body[f] ?? null);
  const sets   = BRIEF_FIELDS.map(f => `${f} = ?`).join(', ');
  await env.DB.prepare(
    `INSERT INTO morning_briefs (date, ${BRIEF_FIELDS.join(', ')}, updated_at)
     VALUES (?, ${BRIEF_FIELDS.map(() => '?').join(', ')}, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET ${sets}, updated_at = datetime('now')`
  ).bind(date, ...values, ...values).run();
  return json({ success: true });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      // Public routes
      if (url.pathname === '/api/health')
        return json({ status: 'ok' });

      if (url.pathname === '/api/login' && request.method === 'POST')
        return handleLogin(request, env);

      // Auth guard
      const auth = request.headers.get('Authorization') ?? '';
      if (!auth.startsWith('Bearer ')) return err('Unauthorized', 401);
      try {
        await verifyJWT(auth.slice(7), env.JWT_SECRET);
      } catch (e) {
        return err(e.message, 401);
      }

      // Protected: option quotes proxy
      if (url.pathname === '/api/option-quote' && request.method === 'GET')
        return handleOptionQuote(request);

      // Protected: morning briefs
      if (url.pathname === '/api/morning-brief/dates' && request.method === 'GET')
        return handleGetBriefDates(env);
      if (url.pathname === '/api/morning-brief') {
        if (request.method === 'GET')  return handleGetBrief(request, env);
        if (request.method === 'POST') return handleSaveBrief(request, env);
      }

      // Protected: trades collection
      if (url.pathname === '/api/trades') {
        if (request.method === 'GET')  return handleGetTrades(request, env);
        if (request.method === 'POST') return handleCreateTrade(request, env);
      }

      // Protected: single trade
      const m = url.pathname.match(/^\/api\/trades\/([^/]+)$/);
      if (m) {
        if (request.method === 'PUT')    return handleUpdateTrade(request, env, m[1]);
        if (request.method === 'DELETE') return handleDeleteTrade(env, m[1]);
      }

      return err('Not Found', 404);
    } catch (e) {
      console.error(e);
      return err('Internal server error', 500);
    }
  },
};
