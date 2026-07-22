-- FD tracking (PRD, P1): "one-time manual entry (amount, rate, maturity
-- date); value calculated via interest math." Matches src/db/schema.ts.
-- Also usable later for any formula-backed investment type, not just FD.
ALTER TABLE investments ADD COLUMN principal REAL;
ALTER TABLE investments ADD COLUMN interest_rate REAL;
ALTER TABLE investments ADD COLUMN start_date TEXT;
ALTER TABLE investments ADD COLUMN maturity_date TEXT;
