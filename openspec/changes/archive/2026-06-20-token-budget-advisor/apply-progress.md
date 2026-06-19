# Apply Progress: token-budget-advisor

**Change**: token-budget-advisor
**Mode**: Strict TDD (Node native test runner — `node --test scripts/**/*.test.js` and Go `go test ./...`)
**Apply date**: 2026-06-20
**Applies to commits**: (cambios locales aplicados)

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T1.1 — Habilidad del advisor | n/a (Documentación) | n/a | n/a | n/a | ✅ Creada en `skills/token-budget-advisor/SKILL.md` | n/a | Ninguno |
| T1.2 — Detección automática | n/a (Registro de habilidades) | n/a | n/a | n/a | ✅ Verificada en SessionStart | n/a | Ninguno |
| T1.3 — Esqueletos de test y TDD | `scripts/hooks/pre-tool-use.test.js` y `internal/hooks/pretooluse_test.go` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.1 — Respetar bypass en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.2 — Extracción de rutas en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.3 — Estimación heurística en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.4 — Bloqueo individual en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.5 — Acumulado de sesión en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T2.6 — Registro atómico de tokens en JS | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T3.1 — Respetar bypass en Go | `internal/hooks/pretooluse_test.go` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T3.2 — Estimación y bloqueo Go | `internal/hooks/pretooluse_test.go` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T3.3 — Acumulado y append Go | `internal/hooks/pretooluse_test.go` | Unit | n/a | ✅ Escrito RED | ✅ Completado | ✅ Completado | Ninguno |
| T3.4 — Compilación binario Go | n/a (Build Go) | Build | n/a | n/a | ✅ Exitoso | n/a | Ninguno |
| T4.1 — Completar tests Node | `scripts/hooks/pre-tool-use.test.js` | Unit | n/a | ✅ Completado | ✅ Exitoso | ✅ Exitoso | Ninguno |
| T4.2 — Completar tests Go | `internal/hooks/pretooluse_test.go` | Unit | n/a | ✅ Completado | ✅ Exitoso | ✅ Exitoso | Ninguno |
| T4.3 — Correr npm test suite | Full suite | Integration | n/a | n/a | ✅ Exitoso | n/a | Ninguno |

---

## Test Summary

- **Net new tests retained this batch**: 6 tests (3 in JS, 3 in Go)
- **Total tests passing after all changes**: 15 tests in JS suite, and all Go tests passing.
- **Layers used**: Unit and Integration (workspace generation testing).

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `skills/token-budget-advisor/SKILL.md` | Created | Nueva habilidad documentada de directivas de tokens para el agente en inglés. |
| `scripts/hooks/pre-tool-use.js` | Modified | Lógica de estimación de tokens y alertas agregada; exportación de helper. |
| `scripts/hooks/pre-tool-use.test.js` | Modified | Pruebas unitarias para bypass, límites de archivo y consumo acumulativo. |
| `internal/hooks/pretooluse.go` | Modified | Lógica en Go para estimación de tokens y alertas con soporte para workspace root. |
| `internal/hooks/pretooluse_test.go` | Modified | Pruebas unitarias en Go para bypass, límites y acumulado con soporte para workspace root. |
| `openspec/changes/token-budget-advisor/apply-progress.md` | Modified | Este archivo |
