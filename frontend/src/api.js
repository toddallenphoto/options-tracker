const BASE = 'https://options-tracker-worker.tcx86-dev.workers.dev';

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.reload();
  }
  return res;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function fetchTrades(filters = {}) {
  const params = new URLSearchParams();
  if (filters.account) params.set('account', filters.account);
  if (filters.status)  params.set('status',  filters.status);
  const qs = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/trades${qs}`);
  return res.json();
}

export async function createTrade(trade) {
  const res = await apiFetch('/api/trades', {
    method: 'POST',
    body: JSON.stringify(trade),
  });
  return res.json();
}

export async function updateTrade(id, trade) {
  const res = await apiFetch(`/api/trades/${id}`, {
    method: 'PUT',
    body: JSON.stringify(trade),
  });
  return res.json();
}

export async function deleteTrade(id) {
  const res = await apiFetch(`/api/trades/${id}`, { method: 'DELETE' });
  return res.json();
}
