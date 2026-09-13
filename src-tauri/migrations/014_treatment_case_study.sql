CREATE TABLE IF NOT EXISTS treatment_case_study (
  treatment_id INTEGER PRIMARY KEY NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE CASCADE
);
