-- Refund/reversal detection. Matches src/db/schema.ts.

-- On the transaction being refunded: which credit netted against it, once
-- confirmed (kept for traceability/export; not required for aggregation —
-- the debit's own `amount` is reduced in place when the refund is confirmed).
ALTER TABLE transactions ADD COLUMN refund_of TEXT;

-- Holds the single in-flight "is this a refund?" question while we wait for
-- a yes/no reply in Telegram. Single-tenant bot, so one pending question at
-- a time is enough — a second credit landing before the first is answered
-- just skips detection rather than queuing.
ALTER TABLE settings ADD COLUMN pending_refund_credit_id TEXT;
ALTER TABLE settings ADD COLUMN pending_refund_debit_id TEXT;
