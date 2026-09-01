# Tareas de Implementación: TUI Dashboard & Models Hub (Hitos 3 y 4)

## Fase 1: Componente Dashboard
- [x] **1.1 Types y Detector:** Crear `internal/tui/views/dashboard/types.go` y `detector.go`.
- [x] **1.2 Cards Renderers:** Implementar `internal/tui/views/dashboard/cards.go` (Model Profile, Targets, OpenSpec, Quick Actions).
- [x] **1.3 Dashboard Model:** Implementar `internal/tui/views/dashboard/dashboard.go` con responsive rendering.
- [x] **1.4 Dashboard Tests:** Crear `internal/tui/views/dashboard/dashboard_test.go`.

## Fase 2: Componente Models Hub
- [x] **2.1 Models Types:** Crear `internal/tui/views/models/types.go`.
- [x] **2.2 Models Cards & Views:** Crear `internal/tui/views/models/cards.go` (SubNav, Presets cards, Granular table).
- [x] **2.3 Models Hub Model:** Implementar `internal/tui/views/models/models.go` con soporte de atajos directos.
- [x] **2.4 Models Hub Tests:** Crear `internal/tui/views/models/models_test.go`.

## Fase 3: Integración y Verificación
- [x] **3.1 Integración en AppModel:** Conectar `dashboard.Model` y `models.Model` en `internal/tui/app.go`.
- [x] **3.2 Tests de Integración:** Actualizar `internal/tui/app_test.go`.
- [x] **3.3 Revisión 4R y Validación:** Ejecutar `review-change` y `review-correction`.
