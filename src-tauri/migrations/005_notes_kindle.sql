ALTER TABLE clinical_notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'comment';
ALTER TABLE clinical_notes ADD COLUMN quote_text TEXT NOT NULL DEFAULT '';
ALTER TABLE clinical_notes ADD COLUMN source_label TEXT NOT NULL DEFAULT '';
ALTER TABLE clinical_notes ADD COLUMN session_id INTEGER;
ALTER TABLE clinical_notes ADD COLUMN module_id INTEGER;
