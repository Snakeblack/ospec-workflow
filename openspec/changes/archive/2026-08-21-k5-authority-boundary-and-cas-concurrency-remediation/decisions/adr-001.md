# ADR-001: Controlled Permit Issuer with Authority Store Query, Budget Preflight & Causal Matrix Validation

- Status: proposed
- Change: k5-authority-boundary-and-cas-concurrency-remediation
- Date: 2026-08-20

## Context
La emisión de permisos en `createKernelRuntime().issuePermitForSelectedTransition()` operaba con validación desacoplada del `AuthorityStore`, posibilitando que se emitieran permisos sobre revisiones obsoletas, con presupuestos agotados o para operaciones no permitidas por la taxonomía causal.

## Decision
Hacer que el controlled issuer consulte el snapshot autoritativo de `AuthorityStore` (`snapshot`/`load`), evalúe `isBudgetExhausted()` sobre el estado autoritativo de nodo y autoridad, y verifique fail-closed `validateRecoveryTransition()` antes de emitir cualquier `OperationPermit`.

## Alternatives
- Emisión de permisos puramente en memoria: Rechazado porque permite autorizar mutaciones sobre revisiones desfasadas o presupuestos agotados en el store.
- Delegar toda la validación a `runKernelOperation`: Rechazado porque viola el principio de que los permisos emitidos deben ser válidos en el momento de emisión.

## Consequences
- Garantía estricta de que ningún permiso es emitido si la revisión head no coincide, el presupuesto está agotado o la operación viola la matriz causal.
- Reversibilidad: Alta (lógica encapsulada en el emisor de permisos del runtime).
