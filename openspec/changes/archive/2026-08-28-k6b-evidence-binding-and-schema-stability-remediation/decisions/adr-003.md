# ADR-003: Validación Fail-Closed de Digest Canónico, Replay Integral de Evidencias/Verificaciones y Proyección Condicional en Assurance Graph

- Status: proposed
- Change: k6b-evidence-binding-and-schema-stability-remediation
- Date: 2026-08-28

## Context
La proyección del Assurance Graph y la verificación de replay requerían robustecimiento contra divergencia de entradas canónicas (`openspec_input_digest`), reutilización no válida de evidencias entre roles conflictivos (ej. `red` ↔ `green`, `characterization-before` ↔ `characterization-after`), y emisión espuria de aristas `satisfies` hacia obligaciones no cubiertas efectivamente.

## Decision
1. Exigir validación estricta y autoritativa de `openspec_input_digest` en `resolveCanonicalInputDigests()`, fallando con `GRAPH_DIVERGENCE` ante cualquier discordancia con el digest recomputado o ausencia de entradas canónicas requeridas.
2. Implementar una matriz formal de incompatibilidad de roles que prohíba que una misma observación física satisfaga roles mutuamente excluyentes (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`), permitiendo reuso legítimo no conflictivo (ej. `integration` + `acceptance`).
3. Validar exhaustivamente en `replayAssuranceGraph` los esquemas, firmas, bindings de candidate y suficiencia de evidencias `evidence/v2`, `verification/v2` y `assessment/v2`.
4. Proyectar aristas `satisfies` en el Assurance Graph única y exclusivamente cuando `evidence_requirements_satisfied.length > 0`.

## Alternatives
- Permitir divergencia de digest de OpenSpec con warning: Rechazado porque compromete la inmutabilidad y reproducibilidad del Assurance Graph.
- Prohibir totalmente el reuso de `evidence_id` entre cualquier par de roles: Rechazado porque bloquea patrones válidos donde una prueba de integración satisface a la vez un criterio de aceptación.
- Proyectar `satisfies` de forma incondicional para todo `assessment` emitido: Rechazado porque permitiría grafos con aristas de satisfacción falsas basadas en arrays vacíos.

## Consequences
- El Assurance Graph se vuelve matemáticamente determinista y libre de aristas de satisfacción infundadas.
- Replay rechaza de inmediato cualquier intento de manipulación o corrupción de artefactos intermedios.
- Reversibilidad: Baja a Media (define la integridad criptográfica y relacional del grafo).
