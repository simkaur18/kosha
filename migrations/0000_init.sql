-- Kosha initial schema. Matches src/db/schema.ts — keep both in sync.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL,
  masked_identifier TEXT,
  current_balance REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  vendor TEXT,
  category TEXT,
  redacted_raw_text TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_pattern TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  invested_amount REAL,
  current_value REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin_hash TEXT,
  notification_cadence TEXT DEFAULT 'daily',
  language TEXT DEFAULT 'en',
  toolkit_version TEXT
);

-- Starter Smart Rules, so day one doesn't look empty (per Product Discovery).
INSERT INTO categories (id, name, match_pattern) VALUES
  ('food', 'Food', 'swiggy|zomato|dominos|mcdonald'),
  ('groceries', 'Groceries', 'bigbasket|blinkit|zepto|dmart'),
  ('transport', 'Transport', 'uber|ola|rapido|irctc'),
  ('shopping', 'Shopping', 'amazon|flipkart|myntra'),
  ('subscriptions', 'Subscriptions', 'netflix|spotify|hotstar|prime'),
  ('income', 'Income', 'salary|credited');
