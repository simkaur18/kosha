-- Adds dashboard PIN-auth columns to settings. Matches src/db/schema.ts.
ALTER TABLE settings ADD COLUMN pin_salt TEXT;
ALTER TABLE settings ADD COLUMN session_secret TEXT;
ALTER TABLE settings ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN locked_until TEXT;
