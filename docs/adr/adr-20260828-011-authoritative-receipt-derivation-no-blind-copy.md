# ADR-002: Derivación autoritativa de satisfacción desde Runner Receipts

- Status: superseded by ADR-005
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
El verificador independiente permitía un fallback de copia ciega de `node.required_evidence` hacia `evidence_requirements_satisfied` cuando el payload no declaraba cobertura, aprobando obligaciones críticas sin que un recibo de ejecución hubiera atestiguado la prueba efectiva.

## Decision
Derivar `evidence_requirements_satisfied` en `verifyCandidate` exclusivamente a partir de runner receipts emitidos por el harness de ejecución. Se prohíbe explícitamente la copia automática o por defecto de `node.required_evidence`; si no hay recibo que lo atestigüe, el conjunto de satisfacción es vacío y la obligación MUST falla con `UNFULFILLED_MUST`.

La decisión original no definió cómo demostrar la autoridad del receipt ni su binding exacto a Evidence. ADR-005 sustituye esa parte con `runner-receipt/v1` y un canal opaco; conserva la prohibición de blind copy.

## Alternatives
- Mantener la copia por defecto de `node.required_evidence` cuando no se especifica satisfacción — rechazado: genera falsos positivos donde la mera existencia de un archivo da por probada una obligación.
- Asumir satisfacción completa si el nodo del grafo está vinculado — rechazado: viola el principio de evidencia fail-closed sin atestación.

## Consequences
- Facilita: Verificación infalsificable donde cada token satisfecho está respaldado por un recibo de ejecución real.
- Dificulta: Exige que el harness y los tests pasen explícitamente recibos de runner para que las obligaciones MUST alcancen `PASS`.
- Reversibilidad: Alta (ajustable en `verifyCandidate`).
