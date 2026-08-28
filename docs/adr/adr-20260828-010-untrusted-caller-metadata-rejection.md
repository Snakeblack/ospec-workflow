# ADR-001: Segregación física estricta de rawEvidence (UNTRUSTED_CALLER_METADATA)

- Status: proposed
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
Los llamadores y workers no confiables podían inyectar propiedades semánticas (`role`, `obligation_ids`, `evidence_requirements_satisfied`) directamente en el objeto `rawEvidence`, eludiendo la verificación independiente y comprometiendo la frontera de confianza.

## Decision
Rechazar de forma inmediata y fail-closed con `UNTRUSTED_CALLER_METADATA` en `normalizeEvidence` cualquier payload `rawEvidence` que contenga `role`, `obligation_ids`, `obligation_id` o `evidence_requirements_satisfied`. La observación física sólo admite `bytes`/`rawBytes`, `provenance`, `origin`, `node_id` y `execution_sequence`.

## Alternatives
- Filtrar o ignorar silenciosamente las propiedades semánticas del caller — rechazado: enmascara bugs en el harness y potenciales intentos de inyección maliciosa.
- Aceptar metadatos de caller como sugerencias no vinculantes — rechazado: debilita la frontera de confianza del verificador independiente.

## Consequences
- Facilita: Garantía estricta de que las observaciones físicas no contienen aserciones semánticas no verificadas.
- Dificulta: Requiere que todos los harnesses y generadores de fixtures envíen exclusivamente cargas físicas puras.
- Reversibilidad: Alta (ajustable en `normalizeEvidence`).
