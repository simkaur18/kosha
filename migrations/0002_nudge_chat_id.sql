-- Adds the Telegram chat ID nudges are sent to. Matches src/db/schema.ts.
ALTER TABLE settings ADD COLUMN chat_id TEXT;
