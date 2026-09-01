# Archive Report: TUI Footer, Contextual Shortcuts, Help Modal & Binary Release (Milestone 7)

## Overview

- **Change ID**: `2026-08-30-tui-footer-help-and-binary-release`
- **Status**: Archived
- **Target**: Milestone 7 (TUI Roadmap Finalization)

## Promoted Artifacts

1. **Specs Promoted**:
   - `openspec/specs/tui-footer-and-release/spec.md` (promoted from change delta).
2. **ADRs Promoted**:
   - `docs/adr/adr-20260830-015-arquitectura-del-componente-footer-contextual-en-internal-tui-footer.md`
   - `docs/adr/adr-20260830-016-modal-de-ayuda-interactivo-y-mecanismo-de-key-trapping-seguro.md`
   - `docs/adr/adr-20260830-017-pipeline-de-compilacion-del-binario-standalone-y-criterios-de-aceptacion-globales.md`
3. **Documentation Updated**:
   - `docs/tui/roadmap.md` (100% de hitos completados).

## Deliverables Summary

- `internal/tui/footer/footer.go`: Componente de pie de página adaptado contextualmente a cada pestaña.
- `internal/tui/footer/help.go`: Modal emergente interactivo `?` con tablas de atajos e instrucciones.
- `internal/tui/footer/footer_test.go`: Tests unitarios del footer y modal de ayuda.
- `internal/tui/app.go` & `internal/tui/app_test.go`: Integración reactiva en el ciclo de vida Elm de Bubble Tea con key-trapping defensivo.
- `package.json`: Scripts `build:tui` y `build:ospec`.
- Standalone binary `./ospec` compilado y verificado.
- Verificación completa en verde para Go (`go test -race ./...`) y Node.js (`npm test`, 51 suites, 662 tests).
