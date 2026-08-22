# ADR-002: Strict Fail-Closed Authoritative Controlled Permit Issuer without input.state Fallback

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En `createKernelRuntime().issuePermitForSelectedTransition()`, cuando `store.snapshot(subject_id)` retornaba null o el store no estaba disponible, la implementación utilizaba `input.state` como fallback, permitiendo que llamadores externos presentaran estados no verificados para acuñar permisos de operación.

## Decision
Eliminar completamente el fallback a `input.state`. Exigir que la emisión de permisos consulte exclusivamente un snapshot autoritativo de `AuthorityStore`. Si el snapshot es nulo o el store no está presente, la función falla inmediatamente cerrado con `{ ok: false, code: "authoritative-snapshot-required" }`.

## Alternatives
- Mantener fallback a `input.state` cuando `store` no esté configurado: Rechazado porque rompe el principio autoritativo de K5 y permite a workers auto-otorgarse permisos sin validación de revisión ni cuotas.
- Validar únicamente en `runKernelOperation`: Rechazado porque los permisos deben ser autoritativamente válidos en el momento de emisión.

## Consequences
- Cierre total de la superficie de acuñación de permisos contra estados no autoritativos.
- Requerimiento de que todo test o harness inicialice un AuthorityStore válido.
- Reversibilidad: Alta.
