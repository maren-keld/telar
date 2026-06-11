CREATE TABLE IF NOT EXISTS convenios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    org_type TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    contacts TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS practice_goals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    goals_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO practice_goals (id, goals_json) VALUES (1, '{}');

ALTER TABLE treatments ADD COLUMN convenio_id INTEGER REFERENCES convenios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_treatments_convenio ON treatments(convenio_id);
