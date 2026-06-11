CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    id_number TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    gender TEXT,
    birth_date TEXT,
    marital_status TEXT,
    source TEXT,
    occupations TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS treatments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'en_tratamiento',
    requires_referral INTEGER NOT NULL DEFAULT 0,
    supervised INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'programada',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    module_type TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clinical_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
    note_type TEXT NOT NULL DEFAULT 'general',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS neurofeedback_recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_module_id INTEGER NOT NULL REFERENCES session_modules(id) ON DELETE CASCADE,
    device TEXT,
    locations TEXT DEFAULT '[]',
    protocol TEXT,
    started_at TEXT,
    ended_at TEXT,
    duration_sec INTEGER,
    raw_data TEXT,
    results_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_treatment ON sessions(treatment_id);
CREATE INDEX IF NOT EXISTS idx_modules_session ON session_modules(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_treatment ON clinical_notes(treatment_id);
