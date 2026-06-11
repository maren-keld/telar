-- Move selector_modulo to the end of sessions where it was created first
-- (sort_order = 0) but other modules exist alongside it.
UPDATE session_modules
SET sort_order = (
    SELECT MAX(sm2.sort_order) + 1
    FROM session_modules sm2
    WHERE sm2.session_id = session_modules.session_id
      AND sm2.id != session_modules.id
)
WHERE module_type = 'selector_modulo'
  AND sort_order = 0
  AND (
    SELECT COUNT(*) FROM session_modules sm3
    WHERE sm3.session_id = session_modules.session_id
  ) > 1;
