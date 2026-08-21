# ADR-003: Scope Obligatorio en Preflight de Repair con Cero Ejecuciones

- Status: accepted
- Change: k5-authoritative-enforcement-and-cas-remediation
- Date: 2026-08-20

## Context
En las operaciones `repair`, `runKernelOperation` no exigía `args.scope` en preflight de manera obligatoria y permitía un fallback hacia `effectRecords[0]?.payload?.scope`, posibilitando que se invocara a `effectExecutor` sin haber validado previamente los límites de mutación de archivos y nodos.

## Decision
Hacer obligatorio `args.scope` (con `node_ids`, `allowed_paths` y `finding_ids`) en preflight fail-closed para toda operación `repair` dentro de `runKernelOperation`. Si `args.scope` está ausente, no es un objeto válido, o falla `validateRepairScope()`, la ejecución debe abortar inmediatamente con `repair-scope-violation` y realizar exactamente 0 llamadas a `effectExecutor`, eliminando todo fallback a payloads históricos.

## Alternatives
- Inferencia retroactiva de scope desde `effectRecords`: Rechazado porque es un fallback muerto que permite ejecutar código antes de validar los límites permitidos.
- Permitir scope vacío `{}` con permisos globales: Rechazado porque destruye el principio de mínimo privilegio en la reparación.

## Consequences
- Blindaje total contra mutaciones accidentales o no autorizadas fuera de los paths permitidos del nodo fallido.
- Todas las invocaciones de `repair` deben proporcionar obligatoriamente un descriptor de scope explícito.
- Reversibilidad: Alta (endurecimiento de validación de argumentos en preflight).
