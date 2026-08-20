# ADR-001: Transiciones Canónicas de Recuperación y Armonización Taxonómica

- Status: proposed
- Change: k5-authoritative-enforcement-and-cas-remediation
- Date: 2026-08-20

## Context
El selector de transiciones degradaba fallos de categoría `code_defect` a la operación genérica `recover` en lugar de `repair`, sustituía silenciosamente `escalate` por `decide`, y `escalate` abortaba la ejecución sin consolidar el estado terminal en el CAS del Authority Store.

## Decision
Emitir canónicamente `{ kind: "execute", operation: "repair" }` ante `code_defect` cuando existan intentos disponibles, armonizar la taxonomía emitiendo `{ kind: "escalate", operation: "escalate" }` explícitamente sin sustituciones por `decide`, y procesar `escalate` como una transición terminal consolidada y persistida vía CAS.

## Alternatives
- Mantener `operation: "recover"` para `code_defect`: Rechazado porque oculta la semántica de reparación de código y rompe la causalidad formal.
- Emitir `kind: "decide"` para `escalate`: Rechazado porque confunde solicitudes de decisión humana con escalación terminal del ciclo de vida.
- Abortar `escalate` en memoria sin commit CAS: Rechazado porque deja el Authority Store en un estado inconsistente no terminal.

## Consequences
- Auditoría determinista y unívoca del ciclo de vida con distinción clara entre reparación, replanificación y escalación.
- Los tests y fixtures que asumían `recover` para `code_defect` deben actualizarse a la matriz canónica `repair`.
- Reversibilidad: Alta (ajuste interno a la matriz de transiciones y al reducer).
