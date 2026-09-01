# Propuesta SDD: TUI Dashboard & Models Hub (Hitos 3 y 4)

## 1. Intent y Contexto
Dotar a la TUI `ospec` en Go de sus dos primeras vistas interactivas esenciales:
1. **Vista 1 (Dashboard):** Pantalla de bienvenida que ofrece una radiografía instantánea del estado del ecosistema (perfil de modelos, clientes AI detectados, contexto OpenSpec) y accesos rápidos de navegación y conmutación.
2. **Vista 2 (Models Hub):** Configurador visual interactivo que permite alternar presets globales (*Cheap*, *Default*, *Premium*) y afinar granularmente la asignación de tier por cada subagente del SDD con persistencia atómica.

## 2. Alcance (Scope)
- Implementación de [`internal/tui/views/dashboard/`](file:///home/snake/repos/ospec-workflow/internal/tui/views/dashboard) con detector de targets, tarjetas informativas y botonera de acciones rápidas.
- Implementación de [`internal/tui/views/models/`](file:///home/snake/repos/ospec-workflow/internal/tui/views/models) con selector de presets y tabla de afinamiento granular por agente.
- Integración en el loop Elm raíz de [`internal/tui/app.go`](file:///home/snake/repos/ospec-workflow/internal/tui/app.go) para `TabDashboard` (1) y `TabModels` (2).
- Persistencia inmediata mediante [`internal/config/models_manager.go`](file:///home/snake/repos/ospec-workflow/internal/config/models_manager.go) y actualización del badge en la cabecera.

## 3. Riesgos y Mitigación
- **Riesgo:** Desbordamiento visual en terminales estrechas.
  - **Mitigación:** Layout adaptativo (2/3 columnas en terminales anchos, apilado vertical en terminales compactos con clamps de ancho mínimo).
- **Riesgo:** Corrupción de `models.yaml` por escrituras concurrentes o abortadas.
  - **Mitigación:** Uso de `AtomicWriteYAML` (temp file + sync + rename) y retención de mutex `RLock`.

## 4. Plan de Rollback
Revertir los commits de `internal/tui/views/dashboard/`, `internal/tui/views/models/` y los handlers asociados en `internal/tui/app.go`.
