import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_text TEXT NOT NULL,
  to_text TEXT NOT NULL,
  depart_time TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  starting_price REAL NOT NULL,
  minutes_away INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_text TEXT NOT NULL,
  to_text TEXT NOT NULL,
  desired_time TEXT,
  max_price REAL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS negotiations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL,
  request_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  rider_id INTEGER NOT NULL,
  current_price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_updated_by INTEGER NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (offer_id) REFERENCES offers(id),
  FOREIGN KEY (request_id) REFERENCES requests(id),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (rider_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (negotiation_id) REFERENCES negotiations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  FOREIGN KEY (negotiation_id) REFERENCES negotiations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_user ON offers(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_neg_offer ON negotiations(offer_id);
CREATE INDEX IF NOT EXISTS idx_neg_request ON negotiations(request_id);
CREATE INDEX IF NOT EXISTS idx_msg_neg ON messages(negotiation_id);
CREATE INDEX IF NOT EXISTS idx_fees_user ON fees(user_id);
`);

export function one(stmt, params = []) {
  return db.prepare(stmt).get(params);
}

export function all(stmt, params = []) {
  return db.prepare(stmt).all(params);
}

export function run(stmt, params = []) {
  return db.prepare(stmt).run(params);
}

export function tx(fn) {
  const t = db.transaction(fn);
  return t();
}
