# ADR-003: Verificación Estricta de Formato Digest y Expansión Canónica de Payloads

- Status: proposed
- Change: k3-identities-remediation
- Date: 2026-08-07

## Context
Las funciones de cálculo de digest (`computeWorkOrderId`, `computeCandidateId`, etc.) aceptaban inputs incompletos o digests de referencia fuera de formato `sha256:<64 hex>`, y `computeWorkOrderId` no incluía canónicamente campos críticos de alcance como `dependencies`, `ownership` y `required_evidence`. Además, `freezeCandidate` no desambiguaba limpiamente entre diff crudo y hash precalculado.

## Decision
1. Exigir validación regex `^sha256:[a-f0-9]{64}$` en todos los digests referenciados en las 4 funciones `compute*`, lanzando error fail-closed si no cumplen.
2. Incorporar de forma canónica y ordenada `dependencies`, `ownership` y `required_evidence` dentro de `computeWorkOrderId`.
3. Establecer `freezeCandidate()` como constructor exclusivo de `candidate/v2`, hasheando siempre `diffText` e imponiendo validación digest si se provee `diff_hash`.

## Alternatives
- Aceptar identificadores de string arbitrarios como digests (rechazado: permite estados inconsistentes o maleables).
- Excluir ownership y dependencies del cálculo de WorkOrderId (rechazado: permite la alteración no detectada de responsabilidades o dependencias del worker).

## Consequences
- Garantiza identidades criptográficamente sólidas e inmutables.
- Invalida WorkOrders que dependan de campos no canónicos previos.
