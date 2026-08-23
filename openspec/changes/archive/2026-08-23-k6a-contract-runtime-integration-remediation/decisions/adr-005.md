# ADR-005: Captura de baselineInventory, Validación sobre Mutation Delta y Diff Unified Verificable

- Status: proposed
- Change: k6a-contract-runtime-integration-remediation
- Date: 2026-08-23

## Context
La validación de contención inspeccionaba el inventario completo del workspace en lugar de aislar las escrituras realizadas durante la ejecución del comando, y el parche emitido era un stub sintético no aplicable.

## Decision
Capturar un `baselineInventory` previo a la ejecución, calcular el delta exacto de mutaciones (`created`, `modified`, `deleted`), evaluar `validateAllowedPaths` exclusivamente sobre el delta y generar un parche unified diff aplicable con reconstrucción verificable.

## Alternatives
- Validar inventario estático completo: Rechazado porque penaliza archivos preexistentes inmutables proyectados en la cápsula.
- Diff sintético de nombres de archivos: Rechazado porque no contiene los cambios textuales necesarios para aplicar el parche en K4b o pipelines posteriores.

## Consequences
Precisión en la contención de escrituras y cumplimiento estricto del formato `work-result/v1`; requiere lectura de contenidos para generar diffs línea a línea. Reversibilidad alta.
