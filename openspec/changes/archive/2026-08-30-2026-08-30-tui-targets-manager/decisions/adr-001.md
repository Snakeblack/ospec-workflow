# ADR-001: Desacoplamiento del motor de inspección de targets en internal/system/targets.go

- Status: proposed
- Change: 2026-08-30-tui-targets-manager
- Date: 2026-08-30

## Context
El dashboard de la TUI contaba con una detección preliminar acoplada en `views/dashboard/detector.go`. La incorporación del Targets Manager requiere diagnósticos profundos (rutas de configuración, matriz de capacidades, sincronización declarativa) que deben ser independientes de la capa visual y reutilizables por otros comandos y componentes.

## Decision
Extraer y centralizar la lógica de inspección, diagnóstico de capacidades y sincronización declarativa en un nuevo paquete headless `internal/system/targets.go`, estructurado con tipos canónicos (`TargetSpec`, `TargetStatusKind`, `ConfigFileCheck`, `CapabilityMatrix`) y funciones puras (`InspectTargets`, `InspectTarget`, `SyncTarget`).

## Alternatives
- Mantener la detección dentro de `views/dashboard` y referenciarla desde `views/targets`: rechazada por acoplamiento indebido entre vistas y violación del principio de responsabilidad única.
- Embeber la lógica directamente en `views/targets`: rechazada porque duplicaría código con el dashboard y dificultaría pruebas unitarias aisladas sin dependencias de Lip Gloss.

## Consequences
- Facilita pruebas unitarias puras y exhaustivas sin instanciar componentes Bubbletea.
- Permite que el Dashboard y el Targets Manager compartan una única fuente de verdad para la inspección del sistema.
- Alta reversibilidad; la interfaz pública expuesta (`system.InspectTargets`) es concisa y estable.
