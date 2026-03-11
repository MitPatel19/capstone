const TOKEN_KEY = 'rb_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  health: () => request('/api/health', { auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/api/me'),

  listOffers: () => request('/api/offers', { auth: false }),
  createOffer: (payload) => request('/api/offers', { method: 'POST', body: payload }),
  closeOffer: (id) => request(`/api/offers/${id}/status`, { method: 'PATCH', body: { status: 'closed' } }),

  listRequests: () => request('/api/requests', { auth: false }),
  createRequest: (payload) => request('/api/requests', { method: 'POST', body: payload }),
  closeRequest: (id) => request(`/api/requests/${id}/status`, { method: 'PATCH', body: { status: 'closed' } }),

  createNegotiation: (payload) => request('/api/negotiations', { method: 'POST', body: payload }),
  myNegotiations: () => request('/api/negotiations/mine'),
  proposePrice: (id, price) => request(`/api/negotiations/${id}/propose`, { method: 'PATCH', body: { price } }),
  accept: (id) => request(`/api/negotiations/${id}/accept`, { method: 'PATCH' }),
  reject: (id) => request(`/api/negotiations/${id}/reject`, { method: 'PATCH' }),
  messages: (id) => request(`/api/negotiations/${id}/messages`),
  sendMessage: (id, text) => request(`/api/negotiations/${id}/messages`, { method: 'POST', body: { text } }),
  startRide: (id) => request(`/api/negotiations/${id}/start`, { method: 'POST' }),
  finishRide: (id) => request(`/api/negotiations/${id}/finish`, { method: 'POST' }),

  myFees: () => request('/api/fees/mine'),
  markFeePaid: (id) => request(`/api/fees/${id}/mark-paid`, { method: 'POST' })
};
