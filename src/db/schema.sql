CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,  --  UUID
  phone TEXT UNIQUE,
  telegram_id TEXT UNIQUE,
  name TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client (
  id TEXT PRIMARY KEY,  --  UUID
  name TEXT
);

CREATE TABLE IF NOT EXISTS time_slots (
  id TEXT PRIMARY KEY,  --  UUID
  client_id TEXT NOT NULL REFERENCES client(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  booked INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  UNIQUE(client_id, date, time)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,  --  UUID
  client_id TEXT NOT NULL REFERENCES client(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  time_slot_id TEXT NOT NULL REFERENCES time_slots(id),
  party_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT CHECK (length(notes) <= 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
