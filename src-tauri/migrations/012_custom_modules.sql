-- Módulos creados por el terapeuta y módulos importados desde un .telarpack.
-- Antes vivían en localStorage (`telar.practitioner.customModules`), pero los
-- HTML de experiencias interactivas no caben ahí. El JSON completo del módulo
-- va en `payload`; las columnas sueltas son solo para listar y filtrar.
CREATE TABLE IF NOT EXISTS custom_modules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'simple',      -- simple | questionnaire | interactive
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  pack_id TEXT NOT NULL DEFAULT '',
  pack_label TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_modules_pack ON custom_modules(pack_id);
CREATE INDEX IF NOT EXISTS idx_custom_modules_kind ON custom_modules(kind);
