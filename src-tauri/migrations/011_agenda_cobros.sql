ALTER TABLE sessions ADD COLUMN scheduled_at TEXT;
ALTER TABLE sessions ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 50;
ALTER TABLE sessions ADD COLUMN attendance TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE sessions ADD COLUMN fee_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'por_pagar';
ALTER TABLE sessions ADD COLUMN paid_at TEXT;
ALTER TABLE sessions ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN receipt_number TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_scheduled ON sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_payment ON sessions(payment_status);
