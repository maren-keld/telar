CREATE TABLE IF NOT EXISTS treatment_space_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_space_checks_unique
ON treatment_space_checks(treatment_id, category, label);

