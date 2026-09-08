-- Check manual de sesión en el índice (no confundir con session_modules.status).
ALTER TABLE sessions ADD COLUMN done INTEGER NOT NULL DEFAULT 0;
