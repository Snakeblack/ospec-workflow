# Arquitectura de ospec-workflow

Esta carpeta queda reservada para la arquitectura **vigente** de ospec: `technical-baseline.md`, los ADR de arquitectura en `decisions/` y los registros tecnológicos en `technology/`. Los generará la foundation de ospec aplicada a este mismo repositorio ([E2.6](../roadmaps/harness-evolution.md#e26--dogfood-ospec-foundation)).

El modelo de esos registros es `ospec-decision-record/v1` ([E2.4](../roadmaps/harness-evolution.md#e24--decision-records-model), `schemas/foundation/decision-records/`): ADR, TSR y DC, con plantillas y un lint de avisos. En un repositorio existente la foundation recupera además el mapa de componentes `ospec-component-map/v1` (`component-map.yaml`) y ADR `inferred` con evidencia `ruta:línea` ([E2.5](../roadmaps/harness-evolution.md#e25--brownfield-architecture-recovery), `schemas/foundation/component-map/`). Esta carpeta aún no contiene los ADR de ospec.

Mientras tanto, la referencia técnica vigente es:

- [`../harness-runtime.md`](../harness-runtime.md): hooks, runtime y guards.
- [`../target-capabilities.md`](../target-capabilities.md): capacidades y degradación por target.
- [`../sdd-routing.md`](../sdd-routing.md) y [`../sdd-fases.md`](../sdd-fases.md): rutas y contratos de cada fase.
- `openspec/specs/`: el comportamiento especificado.

La arquitectura objetivo del programa K1–K12 y su investigación están [archivadas](../roadmaps/archive/2026-10-03-arquitectura/README.md). Son historia, no la arquitectura vigente.
