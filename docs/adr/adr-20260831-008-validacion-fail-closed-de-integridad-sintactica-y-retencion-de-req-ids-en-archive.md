# ADR-002: Validación Fail-Closed de Integridad Sintáctica y Retención de REQ IDs en Archive

- Status: proposed
- Change: k6c-spec-integrity-and-runner-seam-remediation
- Date: 2026-08-31

## Context
Una serialización defectuosa en archive generó la pérdida silenciosa de requisitos (`REQ-003`, `REQ-004`) y la emisión de tokens `undefined` en especificaciones canónicas (`adversarial-challenges/spec.md`). El validador de archive sólo comprobaba hashes sin validar integridad sintáctica básica ni retención de identificadores de requisitos respecto a `target_before`.

## Decision
Extender `validatePlanAgainstSnapshot` en `scripts/lib/archive-plan.js` para inspeccionar el contenido preparado contra tokens de corrupción (`corrupted-spec-content`) y asegurar la retención de todos los IDs `{#REQ-...}` presentes en `target_before` a menos que estén declarados en `## REMOVED Requirements` (`dropped-requirement-id`). Añadir ambos códigos a la lista inmutable `PLAN_REJECTION_CODES`.

## Alternatives
- Análisis sintáctico mediante parser AST Markdown completo: Rechazado por añadir dependencias externas pesadas a un validador puro sin I/O.
- Verificación manual en reporte de archive: Rechazado porque no es fail-closed y permite mutación de especificaciones antes de la detección humana.

## Consequences
Preflight en `archive-transaction.js` aborta inmediatamente antes de staging o commit si una especificación está corrupta o suprime requisitos no declarados. La carpeta de cambio en origin permanece intacta ante cualquier rechazo. Decisión de alta reversibilidad interna.
