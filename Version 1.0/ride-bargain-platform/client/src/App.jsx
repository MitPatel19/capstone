import React, { useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

function currency(n) {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

function TopBar({ user, onLogout }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo" />
        <div>
          <div style={{ fontWeight: 700 }}>Ride Bargain Platform</div>
          <div className="muted" style={{ fontSize: 12 }}>A safer alternative to WhatsApp ride groups (no maps, simple bargaining)</div>
        </div>
      </div>
      <div className="row">
        {user ? (
          <>
            <span className="pill">Logged in as <b>{user.displayName}</b></span>
            <button className="btn secondary" onClick={onLogout}>Logout</button>
          </>
        ) : (
          <span className="pill">Not logged in</span>
        )}
      </div>
    </div>
  );
}

function AuthCard({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const payload = mode === 'register'
        ? { email, password, displayName }
        : { email, password };

      const data = mode === 'register'
        ? await api.register(payload)
        : await api.login(payload);

      setToken(data.token);
      onAuthed(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{mode === 'login' ? 'Login' : 'Create account'}</h2>
          <button
            className="btn secondary"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            type="button"
          >
            Switch to {mode === 'login' ? 'Register' : 'Login'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          This MVP focuses on a clean, user-friendly bargaining platform (no maps). Drivers post offers, riders post requests, and both can bargain safely inside the app.
        </p>

        <form onSubmit={submit} className="grid" style={{ marginTop: 10 }}>
          {mode === 'register' && (
            <div>
              <label>Display Name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g., Mit Patel" required />
            </div>
          )}
          <div>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" required />
          </div>
          <div>
            <button className="btn" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </div>
        </form>
        {err && <div className="alert" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}

function Tabs({ tab, setTab }) {
  const items = [
    { key: 'offers', label: 'Driver Offers' },
    { key: 'requests', label: 'Ride Requests' },
    { key: 'neg', label: 'Bargaining' },
    { key: 'fees', label: 'Platform Fees' }
  ];
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      {items.map(i => (
        <button
          key={i.key}
          className={`btn secondary ${tab === i.key ? 'active' : ''}`}
          onClick={() => setTab(i.key)}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function OfferForm({ onCreated }) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [startingPrice, setStartingPrice] = useState(10);
  const [minutesAway, setMinutesAway] = useState(15);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.createOffer({
        fromText,
        toText,
        departTime: departTime || null,
        seats: Number(seats),
        startingPrice: Number(startingPrice),
        minutesAway: Number(minutesAway)
      });
      setFromText('');
      setToText('');
      setDepartTime('');
      setSeats(1);
      setStartingPrice(10);
      setMinutesAway(15);
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Post a Driver Offer</h3>
      <form onSubmit={submit} className="grid">
        <div>
          <label>From</label>
          <input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="e.g., Dawson St" required />
        </div>
        <div>
          <label>To</label>
          <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="e.g., Arthur St" required />
        </div>
        <div>
          <label>Depart Time (optional)</label>
          <input value={departTime} onChange={(e) => setDepartTime(e.target.value)} placeholder="e.g., 7:30 PM" />
        </div>
        <div>
          <label>Seats</label>
          <input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} min={1} max={8} />
        </div>
        <div>
          <label>Starting Price</label>
          <input type="number" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} min={0} step={0.5} />
        </div>
        <div>
          <label>Minutes Away (driver enters)</label>
          <input type="number" value={minutesAway} onChange={(e) => setMinutesAway(e.target.value)} min={1} max={240} />
        </div>
        <div>
          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Posting...' : 'Post Offer'}
          </button>
        </div>
      </form>
      {err && <div className="alert" style={{ marginTop: 10 }}>{err}</div>}
      <p className="muted" style={{ marginBottom: 0 }}>
        “Minutes away” is a manual ETA (no map). Update it by closing and reposting for now (easy to add edit later).
      </p>
    </div>
  );
}

function RequestForm({ onCreated }) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [desiredTime, setDesiredTime] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.createRequest({
        fromText,
        toText,
        desiredTime: desiredTime || null,
        maxPrice: maxPrice === '' ? null : Number(maxPrice)
      });
      setFromText('');
      setToText('');
      setDesiredTime('');
      setMaxPrice('');
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Post a Ride Request</h3>
      <form onSubmit={submit} className="grid">
        <div>
          <label>From</label>
          <input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="e.g., Cumberland" required />
        </div>
        <div>
          <label>To</label>
          <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="e.g., Arthur St" required />
        </div>
        <div>
          <label>Desired Time (optional)</label>
          <input value={desiredTime} onChange={(e) => setDesiredTime(e.target.value)} placeholder="e.g., 6:00 AM shift" />
        </div>
        <div>
          <label>Max Price (optional)</label>
          <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} min={0} step={0.5} placeholder="e.g., 12" />
        </div>
        <div>
          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Posting...' : 'Post Request'}
          </button>
        </div>
      </form>
      {err && <div className="alert" style={{ marginTop: 10 }}>{err}</div>}
      <p className="muted" style={{ marginBottom: 0 }}>
        You can create a request even if you don’t know the price yet. Bargain safely inside the app.
      </p>
    </div>
  );
}

function ListCard({ title, children, right }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function OffersTab({ user }) {
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    setErr('');
    setLoading(true);
    try {
      const [o, r] = await Promise.all([api.listOffers(), api.listRequests()]);
      setOffers(o.offers);
      setRequests(r.requests);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function startNegotiation(offer, request) {
    const initialPrice = offer.startingPrice;
    try {
      await api.createNegotiation({ offerId: offer.id, requestId: request.id, initialPrice });
      alert('Bargaining started! Go to the Bargaining tab.');
    } catch (e) {
      alert(e.message);
    }
  }

  const myOffers = useMemo(() => offers.filter(o => user && o.userId === user.id), [offers, user]);

  return (
    <div className="container">
      <div className="grid">
        <OfferForm onCreated={refresh} />
        <ListCard
          title="Open Driver Offers"
          right={<button className="btn secondary" onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>}
        >
          {err && <div className="alert">{err}</div>}
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Route</th>
                  <th>Depart</th>
                  <th>ETA</th>
                  <th>Start Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {offers.map(o => (
                  <tr key={o.id}>
                    <td>{o.driverDisplayName}</td>
                    <td>{o.fromText} → {o.toText}</td>
                    <td>{o.departTime || '-'}</td>
                    <td>{o.minutesAway} min</td>
                    <td>{currency(o.startingPrice)}</td>
                    <td>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          const openReq = requests.find(r => r.userId === user.id && r.status === 'open');
                          if (!openReq) return alert('First create a Ride Request (Requests tab).');
                          startNegotiation(o, openReq);
                        }}
                      >
                        Bargain with this offer
                      </button>
                    </td>
                  </tr>
                ))}
                {!offers.length && (
                  <tr><td colSpan="6" className="muted">No open offers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Tip: For simplicity, “Bargain” uses your latest open ride request. (Easy to upgrade to choose any request.)
          </p>

          {myOffers.length ? (
            <div style={{ marginTop: 14 }}>
              <div className="divider" />
              <h4>My Offers</h4>
              {myOffers.map(o => (
                <div key={o.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="pill">{o.fromText} → {o.toText} • {currency(o.startingPrice)} • {o.minutesAway}min</span>
                  <button className="btn secondary" onClick={async () => { await api.closeOffer(o.id); refresh(); }}>Close</button>
                </div>
              ))}
            </div>
          ) : null}
        </ListCard>
      </div>
    </div>
  );
}

function RequestsTab({ user }) {
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    setErr('');
    setLoading(true);
    try {
      const [o, r] = await Promise.all([api.listOffers(), api.listRequests()]);
      setOffers(o.offers);
      setRequests(r.requests);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function startNegotiation(offer, request) {
    const initialPrice = request.maxPrice ?? offer.startingPrice;
    try {
      await api.createNegotiation({ offerId: offer.id, requestId: request.id, initialPrice });
      alert('Bargaining started! Go to the Bargaining tab.');
    } catch (e) {
      alert(e.message);
    }
  }

  const myRequests = useMemo(() => requests.filter(r => user && r.userId === user.id), [requests, user]);

  return (
    <div className="container">
      <div className="grid">
        <RequestForm onCreated={refresh} />
        <ListCard
          title="Open Ride Requests"
          right={<button className="btn secondary" onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>}
        >
          {err && <div className="alert">{err}</div>}
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Route</th>
                  <th>Desired</th>
                  <th>Max</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.riderDisplayName}</td>
                    <td>{r.fromText} → {r.toText}</td>
                    <td>{r.desiredTime || '-'}</td>
                    <td>{r.maxPrice == null ? '-' : currency(r.maxPrice)}</td>
                    <td>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          const openOffer = offers.find(o => o.userId === user.id && o.status === 'open');
                          if (!openOffer) return alert('First create a Driver Offer (Offers tab).');
                          startNegotiation(openOffer, r);
                        }}
                      >
                        Bargain with this request
                      </button>
                    </td>
                  </tr>
                ))}
                {!requests.length && (
                  <tr><td colSpan="5" className="muted">No open requests yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {myRequests.length ? (
            <div style={{ marginTop: 14 }}>
              <div className="divider" />
              <h4>My Requests</h4>
              {myRequests.map(r => (
                <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="pill">{r.fromText} → {r.toText} • {r.desiredTime || 'any time'}</span>
                  <button className="btn secondary" onClick={async () => { await api.closeRequest(r.id); refresh(); }}>Close</button>
                </div>
              ))}
            </div>
          ) : null}
        </ListCard>
      </div>
    </div>
  );
}

function BargainTab({ user }) {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const d = await api.myNegotiations();
      setList(d.negotiations);
      if (selected) {
        const latest = d.negotiations.find(n => n.id === selected.id);
        if (latest) setSelected(latest);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(id) {
    const d = await api.messages(id);
    setMessages(d.messages);
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected?.id]);

  function stepPrice(n, delta) {
    const next = Math.max(0, Math.round((Number(n) + delta) * 2) / 2);
    return next;
  }

  async function propose(delta) {
    if (!selected) return;
    const next = stepPrice(selected.currentPrice, delta);
    const res = await api.proposePrice(selected.id, next);
    setSelected(res.negotiation);
    refresh();
  }

  async function accept() {
    if (!selected) return;
    const res = await api.accept(selected.id);
    setSelected(res.negotiation);
    refresh();
  }

  async function reject() {
    if (!selected) return;
    const res = await api.reject(selected.id);
    setSelected(res.negotiation);
    refresh();
  }

  async function send() {
    if (!selected || !msg.trim()) return;
    await api.sendMessage(selected.id, msg.trim());
    setMsg('');
    loadMessages(selected.id);
  }

  async function startRide() {
    if (!selected) return;
    const res = await api.startRide(selected.id);
    setSelected(res.negotiation);
    refresh();
  }

  async function finishRide() {
    if (!selected) return;
    const res = await api.finishRide(selected.id);
    setSelected(res.negotiation);
    refresh();
    alert('Ride finished. Platform fee ($0.50) created for both sides. Check Platform Fees tab.');
  }

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>My Bargains</h3>
            <button className="btn secondary" onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Rider</th>
                  <th>Status</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {list.map(n => (
                  <tr key={n.id} onClick={() => setSelected(n)} style={{ cursor: 'pointer', background: selected?.id === n.id ? '#f0f2ff' : 'transparent' }}>
                    <td>{n.offer.fromText} → {n.offer.toText}</td>
                    <td>{n.driverDisplayName}</td>
                    <td>{n.riderDisplayName}</td>
                    <td><span className="pill">{n.status}{n.startedAt ? ' • started' : ''}{n.finishedAt ? ' • finished' : ''}</span></td>
                    <td><b>{currency(n.currentPrice)}</b></td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="5" className="muted">No bargains yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Click a row to open bargaining and chat.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bargain & Chat</h3>
          {!selected ? (
            <p className="muted">Select a bargain on the left.</p>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.offer.fromText} → {selected.offer.toText}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Driver ETA: ~{selected.offer.minutesAway} min • Driver: {selected.driverDisplayName} • Rider: {selected.riderDisplayName}
                  </div>
                </div>
                <span className="pill">Status: <b>{selected.status}</b></span>
              </div>

              <div className="divider" />

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Current Price</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{currency(selected.currentPrice)}</div>
                </div>
                <div className="row">
                  <button className="btn secondary" onClick={() => propose(-0.5)} disabled={selected.status !== 'pending'}>- $0.50</button>
                  <button className="btn secondary" onClick={() => propose(0.5)} disabled={selected.status !== 'pending'}>+ $0.50</button>
                  <button className="btn" onClick={accept} disabled={selected.status !== 'pending'}>Accept</button>
                  <button className="btn secondary" onClick={reject} disabled={selected.status !== 'pending'}>Reject</button>
                </div>
              </div>

              <div className="divider" />

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <button className="btn secondary" onClick={startRide} disabled={selected.status !== 'accepted' || !!selected.startedAt}>Mark Started</button>
                  <button className="btn secondary" onClick={finishRide} disabled={selected.status !== 'accepted' || !selected.startedAt || !!selected.finishedAt}>Mark Finished</button>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Cash is paid directly to driver. Platform fee is handled separately.
                </span>
              </div>

              <div className="divider" />

              <div className="chat">
                {messages.map(m => (
                  <div key={m.id} className={`bubble ${m.senderId === user.id ? 'me' : ''}`}>
                    <div className="muted" style={{ fontSize: 11 }}><b>{m.senderDisplayName}</b> • {new Date(m.createdAt + 'Z').toLocaleString()}</div>
                    <div>{m.text}</div>
                  </div>
                ))}
                {!messages.length && <div className="muted">No messages yet. Say hi 👋</div>}
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message (don’t drive and type!)" />
                <button className="btn" onClick={send}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FeesTab() {
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    setErr('');
    setLoading(true);
    try {
      const d = await api.myFees();
      setFees(d.fees);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ marginTop: 0 }}>My Platform Fees</h3>
          <button className="btn secondary" onClick={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>

        <p className="muted">
          Platform fee is <b>$0.50</b> per completed ride for both the driver and the rider. In this MVP it’s manual: you pay the platform owner separately (cash/e-transfer). Cash for the ride itself is always paid directly to the driver.
        </p>

        {err && <div className="alert">{err}</div>}

        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Ride</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fees.map(f => (
                <tr key={f.id}>
                  <td>
                    <div><b>{f.driverDisplayName}</b> ↔ <b>{f.riderDisplayName}</b></div>
                    <div className="muted" style={{ fontSize: 12 }}>{f.note}</div>
                  </td>
                  <td>{currency(f.amount)}</td>
                  <td><span className="pill">{f.status}</span></td>
                  <td>
                    {f.status !== 'paid' ? (
                      <button className="btn secondary" onClick={async () => { await api.markFeePaid(f.id); refresh(); }}>
                        Mark Paid
                      </button>
                    ) : (
                      <span className="muted">Paid at {new Date(f.paidAt + 'Z').toLocaleString()}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!fees.length && <tr><td colSpan="4" className="muted">No fees yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('offers');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    async function boot() {
      try {
        if (getToken()) {
          const me = await api.me();
          setUser(me);
        }
      } catch (e) {
        setToken(null);
        setBootError(e.message);
      }
    }
    boot();
  }, []);

  function logout() {
    setToken(null);
    setUser(null);
    setTab('offers');
  }

  if (!user) {
    return (
      <>
        <TopBar user={user} onLogout={logout} />
        {bootError && <div className="container"><div className="alert">{bootError}</div></div>}
        <AuthCard onAuthed={setUser} />
      </>
    );
  }

  return (
    <>
      <TopBar user={user} onLogout={logout} />
      <div className="container">
        <Tabs tab={tab} setTab={setTab} />
      </div>
      {tab === 'offers' && <OffersTab user={user} />}
      {tab === 'requests' && <RequestsTab user={user} />}
      {tab === 'neg' && <BargainTab user={user} />}
      {tab === 'fees' && <FeesTab user={user} />}
      <div className="container" style={{ paddingBottom: 30 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Safety note: This app is designed to reduce WhatsApp driving distractions, but users should still not type while driving.
        </div>
      </div>
    </>
  );
}
