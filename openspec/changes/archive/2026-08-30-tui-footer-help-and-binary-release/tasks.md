# Implementation Tasks: TUI Footer, Contextual Shortcuts, Help Modal & Binary Release (Milestone 7)

## Traceability Matrix

| Requirement | Task(s) | Verification |
|-------------|---------|--------------|
| `REQ-tui-footer-001` | `TASK-tui-footer-001`, `TASK-tui-footer-002` | `internal/tui/footer/footer_test.go` |
| `REQ-tui-footer-002` | `TASK-tui-footer-001`, `TASK-tui-footer-002` | `internal/tui/footer/footer_test.go` |
| `REQ-tui-footer-003` | `TASK-tui-footer-003`, `TASK-tui-footer-004` | `internal/tui/app_test.go` |
| `REQ-tui-footer-004` | `TASK-tui-footer-005`, `TASK-tui-footer-006` | `package.json`, `go build -o ospec ./cmd/ospec`, `./ospec` |
| `REQ-tui-footer-005` | `TASK-tui-footer-007`, `TASK-tui-footer-008`, `TASK-tui-footer-009` | `go test -race ./...`, `npm test`, `docs/tui/roadmap.md` |

---

## Phase 1: Contextual Footer & Help Modal Component (`internal/tui/footer`)

- [ ] `TASK-tui-footer-001` [TDD Red]: Escribir tests unitarios en `internal/tui/footer/footer_test.go` para `RenderContextualFooter` (todas las pestañas 0..3, comportamiento responsivo con anchos $<80$ y $\ge 80$) y `RenderHelpModal` (contenido de secciones, atajos, clamps de tamaño).
- [ ] `TASK-tui-footer-002` [TDD Green]: Implementar `internal/tui/footer/footer.go` y `internal/tui/footer/help.go` con Lip Gloss, colores del tema y tarjetas estilizadas.

---

## Phase 2: Root App Shell Integration (`internal/tui/app.go`)

- [ ] `TASK-tui-footer-003` [TDD Red]: Escribir tests de integración en `internal/tui/app_test.go` que certifiquen:
  - Apertura del modal con `?`.
  - Cierre del modal con `?`, `esc`, `q`, `Enter`.
  - Key-trapping seguro: otras teclas no alteran pestañas ni ejecutan comandos cuando la ayuda está abierta.
  - Inclusión del footer contextual en `View()`.
- [ ] `TASK-tui-footer-004` [TDD Green]: Modificar `internal/tui/app.go` integrando `showHelp`, el interceptor de teclado en `Update`, el renderizado en `View` y el uso de `footer.RenderContextualFooter`.

---

## Phase 3: Standalone Binary Build Pipeline & Packaging

- [ ] `TASK-tui-footer-005`: Configurar scripts `build:tui` y `build:ospec` en `package.json`.
- [ ] `TASK-tui-footer-006`: Compilar `./ospec` mediante `go build -o ospec ./cmd/ospec`, validar que genera el binario standalone sin errores, arranca instantáneamente (<50ms) y ejecuta la suite de tests de `cmd/ospec`.

---

## Phase 4: Non-Regression Verification & Roadmap Closure

- [ ] `TASK-tui-footer-007`: Ejecutar la suite completa de Go con detector de carreras (`go test -race ./...`).
- [ ] `TASK-tui-footer-008`: Ejecutar el arnés de verificación completo de Node.js (`npm test`) certificando que el 100% de las suites (51 suites, 662 tests) continúan en verde.
- [ ] `TASK-tui-footer-009`: Actualizar `docs/tui/roadmap.md` marcando el Hito 7 y todos los criterios de aceptación globales completados (`[x]`).

---

## Review Workload Forecast

- **Total Tasks**: 9
- **Files Modified**: `internal/tui/footer/*.go`, `internal/tui/app.go`, `internal/tui/app_test.go`, `package.json`, `docs/tui/roadmap.md`
- **Estimated Risk**: Low (cambios desacoplados en capa TUI y scripts de build)
