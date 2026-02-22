CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  telegram_id TEXT UNIQUE,
  name TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL CHECK (domain IN ('restaurant', 'doctor', 'salon')),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  booked INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  UNIQUE(domain, date, time)
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  time_slot_id INTEGER NOT NULL REFERENCES time_slots(id),
  domain TEXT NOT NULL CHECK (domain IN ('restaurant', 'doctor', 'salon')),
  party_size INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
