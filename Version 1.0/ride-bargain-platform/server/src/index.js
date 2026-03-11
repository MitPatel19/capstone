import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { PORT, CLIENT_ORIGIN, PLATFORM_FEE } from './config.js';
import { all, one, run, tx } from './db.js';
import { requireAuth, signToken } from './auth.js';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Auth ---
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(40)
});

app.post('/api/auth/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, displayName } = parsed.data;
  const exists = one('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = run(
    'INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?)',
    [email.toLowerCase(), displayName, passwordHash]
  );
  const user = one('SELECT id, email, display_name, role FROM users WHERE id = ?', [info.lastInsertRowid]);
  return res.json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = one('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const safeUser = { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
  return res.json({ token: signToken(user), user: safeUser });
});

app.get('/api/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, email: u.email, displayName: u.display_name, role: u.role });
});

// --- Offers (Drivers) ---
const offerCreateSchema = z.object({
  fromText: z.string().min(2).max(80),
  toText: z.string().min(2).max(80),
  departTime: z.string().optional().nullable(),
  seats: z.number().int().min(1).max(8).default(1),
  startingPrice: z.number().min(0),
  minutesAway: z.number().int().min(1).max(240).default(15)
});

app.get('/api/offers', (req, res) => {
  const rows = all(
    `SELECT o.*, u.display_name AS driver_display_name
     FROM offers o
     JOIN users u ON u.id = o.user_id
     WHERE o.status = 'open'
     ORDER BY o.created_at DESC
     LIMIT 200`
  );
  res.json({ offers: rows.map(mapOffer) });
});

app.post('/api/offers', requireAuth, (req, res) => {
  const parsed = offerCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const info = run(
    `INSERT INTO offers (user_id, from_text, to_text, depart_time, seats, starting_price, minutes_away)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, d.fromText, d.toText, d.departTime || null, d.seats, d.startingPrice, d.minutesAway]
  );

  const row = one(
    `SELECT o.*, u.display_name AS driver_display_name
     FROM offers o JOIN users u ON u.id = o.user_id
     WHERE o.id = ?`,
    [info.lastInsertRowid]
  );

  res.json({ offer: mapOffer(row) });
});

app.patch('/api/offers/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const offer = one('SELECT * FROM offers WHERE id = ?', [id]);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  if (offer.user_id !== req.user.id) return res.status(403).json({ error: 'Not your offer' });

  run('UPDATE offers SET status = ? WHERE id = ?', [status, id]);
  res.json({ ok: true });
});

// --- Requests (Riders) ---
const requestCreateSchema = z.object({
  fromText: z.string().min(2).max(80),
  toText: z.string().min(2).max(80),
  desiredTime: z.string().optional().nullable(),
  maxPrice: z.number().min(0).optional().nullable()
});

app.get('/api/requests', (req, res) => {
  const rows = all(
    `SELECT r.*, u.display_name AS rider_display_name
     FROM requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC
     LIMIT 200`
  );
  res.json({ requests: rows.map(mapRequest) });
});

app.post('/api/requests', requireAuth, (req, res) => {
  const parsed = requestCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const info = run(
    `INSERT INTO requests (user_id, from_text, to_text, desired_time, max_price)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, d.fromText, d.toText, d.desiredTime || null, d.maxPrice ?? null]
  );

  const row = one(
    `SELECT r.*, u.display_name AS rider_display_name
     FROM requests r JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
    [info.lastInsertRowid]
  );

  res.json({ request: mapRequest(row) });
});

app.patch('/api/requests/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const request = one('SELECT * FROM requests WHERE id = ?', [id]);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.user_id !== req.user.id) return res.status(403).json({ error: 'Not your request' });

  run('UPDATE requests SET status = ? WHERE id = ?', [status, id]);
  res.json({ ok: true });
});

// --- Negotiations (Bargaining) ---
const negotiationCreateSchema = z.object({
  offerId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  initialPrice: z.number().min(0)
});

app.post('/api/negotiations', requireAuth, (req, res) => {
  const parsed = negotiationCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { offerId, requestId, initialPrice } = parsed.data;

  const offer = one('SELECT * FROM offers WHERE id = ?', [offerId]);
  const request = one('SELECT * FROM requests WHERE id = ?', [requestId]);
  if (!offer || offer.status !== 'open') return res.status(404).json({ error: 'Offer not found/open' });
  if (!request || request.status !== 'open') return res.status(404).json({ error: 'Request not found/open' });

  // Determine driver + rider based on who owns what
  const driverId = offer.user_id;
  const riderId = request.user_id;

  // Only driver or rider can start negotiation
  if (![driverId, riderId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Only the driver or rider can start this negotiation' });
  }

  const existing = one(
    'SELECT id FROM negotiations WHERE offer_id = ? AND request_id = ? AND status IN (\'pending\',\'accepted\')',
    [offerId, requestId]
  );
  if (existing) return res.status(409).json({ error: 'Negotiation already exists for this match' });

  const info = run(
    `INSERT INTO negotiations (offer_id, request_id, driver_id, rider_id, current_price, last_updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [offerId, requestId, driverId, riderId, initialPrice, req.user.id]
  );

  const neg = getNegotiation(info.lastInsertRowid);
  res.json({ negotiation: neg });
});

app.get('/api/negotiations/mine', requireAuth, (req, res) => {
  const rows = all(
    `SELECT n.*,
            od.display_name AS driver_display_name,
            orr.display_name AS rider_display_name,
            o.from_text AS offer_from, o.to_text AS offer_to, o.depart_time AS offer_depart_time, o.minutes_away AS offer_minutes_away,
            r.from_text AS request_from, r.to_text AS request_to, r.desired_time AS request_desired_time
     FROM negotiations n
     JOIN users od ON od.id = n.driver_id
     JOIN users orr ON orr.id = n.rider_id
     JOIN offers o ON o.id = n.offer_id
     JOIN requests r ON r.id = n.request_id
     WHERE n.driver_id = ? OR n.rider_id = ?
     ORDER BY n.created_at DESC
     LIMIT 200`,
    [req.user.id, req.user.id]
  );
  res.json({ negotiations: rows.map(mapNegotiationRow) });
});

app.patch('/api/negotiations/:id/propose', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const price = Number(req.body?.price);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });

  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (n.status !== 'pending') return res.status(400).json({ error: 'Negotiation is not pending' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this negotiation' });

  run('UPDATE negotiations SET current_price = ?, last_updated_by = ? WHERE id = ?', [price, req.user.id, id]);
  res.json({ negotiation: getNegotiation(id) });
});

app.patch('/api/negotiations/:id/accept', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (n.status !== 'pending') return res.status(400).json({ error: 'Negotiation is not pending' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this negotiation' });

  tx(() => {
    run('UPDATE negotiations SET status = ?, last_updated_by = ? WHERE id = ?', ['accepted', req.user.id, id]);
    run('UPDATE offers SET status = ? WHERE id = ?', ['closed', n.offer_id]);
    run('UPDATE requests SET status = ? WHERE id = ?', ['closed', n.request_id]);
  });

  res.json({ negotiation: getNegotiation(id) });
});

app.patch('/api/negotiations/:id/reject', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (n.status !== 'pending') return res.status(400).json({ error: 'Negotiation is not pending' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this negotiation' });

  run('UPDATE negotiations SET status = ?, last_updated_by = ? WHERE id = ?', ['rejected', req.user.id, id]);
  res.json({ negotiation: getNegotiation(id) });
});

// --- Messages (simple in-app chat) ---
const msgSchema = z.object({ text: z.string().min(1).max(800) });

app.get('/api/negotiations/:id/messages', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this negotiation' });

  const rows = all(
    `SELECT m.*, u.display_name AS sender_display_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.negotiation_id = ?
     ORDER BY m.created_at ASC`,
    [id]
  );
  res.json({ messages: rows.map(r => ({
    id: r.id,
    negotiationId: r.negotiation_id,
    senderId: r.sender_id,
    senderDisplayName: r.sender_display_name,
    text: r.text,
    createdAt: r.created_at
  })) });
});

app.post('/api/negotiations/:id/messages', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = msgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this negotiation' });

  const info = run('INSERT INTO messages (negotiation_id, sender_id, text) VALUES (?, ?, ?)', [id, req.user.id, parsed.data.text]);
  const row = one(
    `SELECT m.*, u.display_name AS sender_display_name
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [info.lastInsertRowid]
  );

  res.json({ message: {
    id: row.id,
    negotiationId: row.negotiation_id,
    senderId: row.sender_id,
    senderDisplayName: row.sender_display_name,
    text: row.text,
    createdAt: row.created_at
  }});
});

// --- Ride lifecycle + Fees ---
app.post('/api/negotiations/:id/start', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (n.status !== 'accepted') return res.status(400).json({ error: 'Ride not accepted yet' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this ride' });

  if (n.started_at) return res.status(400).json({ error: 'Ride already started' });
  run('UPDATE negotiations SET started_at = datetime(\'now\') WHERE id = ?', [id]);
  res.json({ negotiation: getNegotiation(id) });
});

app.post('/api/negotiations/:id/finish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = one('SELECT * FROM negotiations WHERE id = ?', [id]);
  if (!n) return res.status(404).json({ error: 'Negotiation not found' });
  if (n.status !== 'accepted') return res.status(400).json({ error: 'Ride not accepted' });
  if (![n.driver_id, n.rider_id].includes(req.user.id)) return res.status(403).json({ error: 'Not part of this ride' });
  if (!n.started_at) return res.status(400).json({ error: 'Ride not started' });
  if (n.finished_at) return res.status(400).json({ error: 'Ride already finished' });

  tx(() => {
    run('UPDATE negotiations SET finished_at = datetime(\'now\') WHERE id = ?', [id]);

    // Create platform fees (one for driver, one for rider) - no online payment.
    run(
      `INSERT INTO fees (negotiation_id, user_id, amount, note)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        id, n.driver_id, PLATFORM_FEE, 'Platform fee (driver) - pay platform separately',
        id, n.rider_id, PLATFORM_FEE, 'Platform fee (rider) - pay platform separately'
      ]
    );
  });

  res.json({ negotiation: getNegotiation(id) });
});

app.get('/api/fees/mine', requireAuth, (req, res) => {
  const rows = all(
    `SELECT f.*, od.display_name AS driver_display_name, orr.display_name AS rider_display_name
     FROM fees f
     JOIN negotiations n ON n.id = f.negotiation_id
     JOIN users od ON od.id = n.driver_id
     JOIN users orr ON orr.id = n.rider_id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );

  res.json({ fees: rows.map(r => ({
    id: r.id,
    negotiationId: r.negotiation_id,
    userId: r.user_id,
    amount: r.amount,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    driverDisplayName: r.driver_display_name,
    riderDisplayName: r.rider_display_name
  })) });
});

// In this MVP, marking fee as paid is manual (cash/e-transfer) and can be done by the user.
app.post('/api/fees/:id/mark-paid', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const fee = one('SELECT * FROM fees WHERE id = ?', [id]);
  if (!fee) return res.status(404).json({ error: 'Fee not found' });
  if (fee.user_id !== req.user.id) return res.status(403).json({ error: 'Not your fee' });
  if (fee.status === 'paid') return res.json({ ok: true });

  run('UPDATE fees SET status = ?, paid_at = datetime(\'now\') WHERE id = ?', ['paid', id]);
  res.json({ ok: true });
});

// --- Helpers ---
function mapOffer(r) {
  return {
    id: r.id,
    userId: r.user_id,
    driverDisplayName: r.driver_display_name,
    fromText: r.from_text,
    toText: r.to_text,
    departTime: r.depart_time,
    seats: r.seats,
    startingPrice: r.starting_price,
    minutesAway: r.minutes_away,
    status: r.status,
    createdAt: r.created_at
  };
}

function mapRequest(r) {
  return {
    id: r.id,
    userId: r.user_id,
    riderDisplayName: r.rider_display_name,
    fromText: r.from_text,
    toText: r.to_text,
    desiredTime: r.desired_time,
    maxPrice: r.max_price,
    status: r.status,
    createdAt: r.created_at
  };
}

function mapNegotiationRow(r) {
  return {
    id: r.id,
    offerId: r.offer_id,
    requestId: r.request_id,
    driverId: r.driver_id,
    riderId: r.rider_id,
    driverDisplayName: r.driver_display_name,
    riderDisplayName: r.rider_display_name,
    currentPrice: r.current_price,
    status: r.status,
    lastUpdatedBy: r.last_updated_by,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
    offer: {
      fromText: r.offer_from,
      toText: r.offer_to,
      departTime: r.offer_depart_time,
      minutesAway: r.offer_minutes_away
    },
    request: {
      fromText: r.request_from,
      toText: r.request_to,
      desiredTime: r.request_desired_time
    }
  };
}

function getNegotiation(id) {
  const row = one(
    `SELECT n.*,
            od.display_name AS driver_display_name,
            orr.display_name AS rider_display_name,
            o.from_text AS offer_from, o.to_text AS offer_to, o.depart_time AS offer_depart_time, o.minutes_away AS offer_minutes_away,
            r.from_text AS request_from, r.to_text AS request_to, r.desired_time AS request_desired_time
     FROM negotiations n
     JOIN users od ON od.id = n.driver_id
     JOIN users orr ON orr.id = n.rider_id
     JOIN offers o ON o.id = n.offer_id
     JOIN requests r ON r.id = n.request_id
     WHERE n.id = ?`,
    [id]
  );
  return row ? mapNegotiationRow(row) : null;
}

app.listen(PORT, () => {
  console.log(`Ride Bargain Server running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${CLIENT_ORIGIN}`);
});
