# ADR-001: Versionado y Discriminador `kind` en Schemas v2 preservando Inmutabilidad v1

- Status: proposed
- Change: k3-identities-remediation
- Date: 2026-08-07

## Context
Las estructuras `candidate` y `work-order` v1 carecían de discriminadores de tipo explícitos (`kind`), lo que permitía confusión de aliasing entre tipos incompatibles (ej. evaluar un `WorkResult` como `Candidate`). Además, la especificación de línea base K1 exige mantener inalterados los esquemas v1 existentes.

## Decision
Crear `schemas/kernel/candidate/v2.schema.json` y `schemas/kernel/work-order/v2.schema.json` agregando los campos explícitos `kind: "candidate/v2"` y `kind: "work-order/v2"` junto a patrones estrictos `^sha256:[a-f0-9]{64}$`, mientras `candidate/v1.schema.json` y `work-order/v1.schema.json` permanecen intactos y pineados en `K1_SCHEMA_BASELINE`.

## Alternatives
- Modificar los esquemas v1 directamente (rechazado: rompe la compatibilidad e inmutabilidad de la línea base K1).
- Permitir esquemas v2 sin campo `kind` explícito (rechazado: mantiene la vulnerabilidad de confusión de tipos).

## Consequences
- Facilita la discriminación cerrada de tipos en tiempo de ejecución.
- Garantiza cumplimiento estricto con los tests de regresión K1 de compatibilidad.
