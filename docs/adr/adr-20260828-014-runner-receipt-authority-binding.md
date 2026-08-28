# ADR-005: Autoridad y binding exacto de RunnerReceipt

- Status: accepted
- Change: k6b-receipt-binding-and-replay-finalization
- Date: 2026-08-28

## Context
`verifyCandidate` aceptaba `runner_receipts` como DTOs ordinarios del mismo caller que aportaba `rawEvidence`. Además, un receipt sin `evidence_id` podía asociarse por nodo o posición. Mover las aserciones semánticas fuera de `rawEvidence` no establecía por sí solo una frontera de confianza.

## Decision
Introducir `runner-receipt/v1` con `receipt_id` content-addressed, `candidate_id`, `evidence_id` obligatorio, `node_id`, `role`, `satisfied_tokens`, `outcome`, `issuer_id`, `transport` y secuencia temporal cuando aplique. El verifier solo consume receipts desde un `runnerReceiptChannel` opaco registrado en un `WeakMap` privado del runtime; copiar sus campos públicos no reproduce la capacidad.

Rechazar propiedades caller-owned `receipts` y `runner_receipts`, recomputar `receipt_id`, validar issuer/transport contra el canal y exigir igualdad exacta de Evidence, Candidate y nodo. No se permite matching por posición, por nodo ni fallback de role a `node.kind`. `outcome: failed` con tokens satisfechos es un receipt inválido.

## Alternatives
- Confiar en `issuer_id` y `transport` como strings del DTO: rechazado porque el caller puede copiarlos.
- Firmar receipts con PKI: rechazado por no existir un trust root operativo y por ser desproporcionado para una frontera in-process.
- Mantener matching por índice dentro del verifier: rechazado porque no demuestra `R proves E`.

## Consequences
- Facilita: cada claim semántico queda ligado content-addressed a una Evidence concreta y a una capacidad de runtime no serializable.
- Dificulta: runners y tests deben emitir receipts completos mediante el canal; los DTOs legacy fallan cerrados y deben regenerarse.
- Reversibilidad: Media; relajar el canal o `evidence_id` reabriría la frontera de confianza cerrada por K6b.
