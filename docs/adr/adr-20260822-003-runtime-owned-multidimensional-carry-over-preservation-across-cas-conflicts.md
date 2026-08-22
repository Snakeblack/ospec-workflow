# ADR-003: Runtime-Owned Multidimensional Carry-Over Preservation Across CAS Conflicts

- Status: proposed
- Change: k5-core-remediation
- Date: 2026-08-22

## Context
Cuando una operación ejecutaba efectos y posteriormente perdía una carrera CAS (`cas-conflict`), el runtime acumulaba únicamente cuotas escalares simples (`turns` y `effect_attempts`), perdiendo el registro de otras dimensiones consumidas (`commands`, `patches`, `changed_lines`, `wall_time_minutes`, etc.), lo que permitía la reposición espuria de cuotas en reintentos.

## Decision
Extender el acumulador de carry-over en el runtime (`pendingCarryOver`) para rastrear exhaustivamente las 6 dimensiones de nodo (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `allowed_paths`) y las 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). Ante `cas-conflict`, `runKernelOperation` retorna el delta ejecutado real y el runtime lo acumula y aplica monótonamente en el siguiente despacho contra la revisión ganadora.

## Alternatives
- Carry-over limitado solo a turnos e intentos: Rechazado porque vulnera la monotonicidad estricta y permite inflación de cuotas de patches y comandos.
- Exigir al llamador computar y pasar manualmente `args.consumed`: Rechazado porque delega invariantes del kernel a llamadores externos.

## Consequences
- Cumplimiento estricto de monotonicidad de presupuestos en reintentos concurrentes.
- El llamador reintenta sin necesidad de inyectar argumentos fabricados.
- Reversibilidad: Alta.
