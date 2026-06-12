# Cursor Automations — Telar

Guía para configurar automations en Cursor Cloud. El backlog oficial sigue en `docs/SCRUM.md` (no en los 103 issues viejos de GitHub).

---

## Dónde ver y crear automations

1. **En Cursor:** `Cmd+Shift+P` → **Open Agents Window**
2. Panel lateral → pestaña **Automations**
3. Botón **New Automation**
4. También en web: [cursor.com/dashboard](https://cursor.com/dashboard) → pestaña **Cloud Agents** / **Automations**

Ahí ves:
- Lista de automations activas
- **Run history** (cada ejecución)
- Editar / pausar / borrar

---

## Automation #1 — SCRUM en PR (recomendada, configurar primero)

Revisa que `docs/SCRUM.md` se actualizó cuando abres un Pull Request.

### Configuración en el editor

| Campo | Valor |
|-------|--------|
| **Name** | `SCRUM — revisar PR` |
| **Description** | Comprueba actualización de SCRUM.md al abrir PRs con cambios de código. |
| **Trigger** | GitHub → **Pull request opened** |
| **Repository** | `maren-keld/telarapp` |
| **Tools** | ✅ **Comment on pull request** (solo esto; read-only) |
| **Scope** | Single repository, branch `main` como base del PR |

### Prompt (copiar y pegar)

```
Eres el revisor de backlog de Telar. Solo comenta en el PR; no edites archivos ni abras PRs nuevos.

Contexto del proyecto:
- App de escritorio Tauri 2, 100% local, datos clínicos nunca en el repo.
- Backlog oficial: docs/SCRUM.md (secciones En curso, Backlog, Hecho, Deuda técnica, Changelog).
- Regla del equipo (CLAUDE.md): al terminar tareas de producto hay que actualizar SCRUM.

Tarea:
1. Lee el diff del PR.
2. Si el PR toca código o producto en alguna de estas rutas, exige coherencia con SCRUM:
   - src/
   - src-tauri/
   - python/
   - server/
   - docs/ (excepto typos menores sin impacto en backlog)
3. Comprueba en docs/SCRUM.md (en el diff o en el repo):
   - ¿Ítems completados movidos a **Hecho**?
   - ¿Línea nueva en **Changelog** con fecha YYYY-MM-DD si hubo entrega?
   - ¿Nuevos ítems en **Backlog** o **Deuda técnica** si corresponde?
   - ¿**En curso** refleja lo que el PR realmente hace?
4. Si el PR es solo docs menores, chore, o .gitignore sin feature, responde brevemente que no aplica revisión SCRUM estricta.

Formato del comentario en el PR (markdown):

## Revisión SCRUM

**Veredicto:** ✅ Cumple | ⚠️ Falta actualizar SCRUM | ℹ️ No aplica

**Qué cambió en el PR:** (1–3 bullets)

**SCRUM:**
- Hecho / Changelog / Backlog / En curso: (ok o qué falta)

**Acción sugerida:** (solo si falta algo; concreta, ej. "Mover UX-9 a Hecho y agregar línea en Changelog 2026-06-11")

Sé conciso. Español.
```

### Guardar

Click **Create** / **Save** en el editor de Automations.

### Probar

1. En terminal, desde el repo:
   ```bash
   git checkout -b test/automation-scrum
   echo "# test" >> README.md
   git add README.md
   git commit -m "test: probar automation SCRUM"
   git push -u origin test/automation-scrum
   ```
2. En GitHub: **Compare & pull request** → base `main`
3. En 1–3 minutos debería aparecer un comentario del agente en el PR
4. Ver ejecución en **Agents Window → Automations → Run history**
5. Cierra el PR de prueba sin mergear (o bórralo después)

---

## Requisitos previos

- [x] Repo en GitHub: `maren-keld/telarapp`
- [ ] Cursor conectado a GitHub (Settings → GitHub → autorizar org/repo)
- [ ] Plan con **Cloud Agents** activo (Automations corren en la nube)

Si la automation no dispara: revisa que GitHub esté conectado en Cursor y que el repo privado esté autorizado.

---

## Automation #2 (siguiente, opcional)

**Nombre:** `Seguridad — revisar PR`  
**Trigger:** Pull request opened  
**Tools:** Comment on pull request  
**Prompt:** auditoría de `server/`, `secure_db.rs`, secrets, webhooks MP — ver recomendación en conversación de producto o pedir al agente que la redacte.

---

## Notas

- Las automations **no reemplazan** commits directos a `main`: solo corren cuando abres un **Pull Request**.
- Mientras trabajes solo en `main` sin PRs, esta automation no se ejecutará. Para activarla, usa ramas + PR (aunque merges tú solo).
- Los 103 issues viejos en GitHub son referencia; **SCRUM.md manda**.
