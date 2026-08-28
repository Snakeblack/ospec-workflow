# ADR-001: Publicación de assessment/v2.schema.json y Restauración Retrocompatible de assessment/v1

- Status: proposed
- Change: k6b-evidence-binding-and-schema-stability-remediation
- Date: 2026-08-28

## Context
La especificación de enlace de evidencias y satisfacción de obligaciones requiere que todo registro de evaluación (`assessment`) declare de forma determinista y obligatoria las propiedades `evidence_requirements_satisfied` con al menos un token (`minItems: 1`) para claims de satisfacción, impidiendo que arrays vacíos `[]` simulen cobertura. Asimismo, los consumidores legados del contrato v2.51.0 dependen del esquema `assessment/v1.schema.json` sin campos de cobertura obligatorios restrictivos.

## Decision
Publicar formalmente `schemas/kernel/assessment/v2.schema.json` con `$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`, `kind: "assessment/v2"`, requiriendo `evidence_requirements_satisfied` (array de strings no vacíos, `minItems: 1`, `uniqueItems: true`), `role` restringido al catálogo canónico de roles de estrategia, y `additionalProperties: false`. Restaurar `schemas/kernel/assessment/v1.schema.json` al contrato exacto v2.51.0 para preservar compatibilidad retroactiva, registrando ambas familias canónicas en `schemas/kernel/manifest.json` y `contract-claims.json`.

## Alternatives
- Mutar `assessment/v1.schema.json` in-place exigiendo `minItems: 1`: Rechazado porque rompería consumidores e historiales legados de contratos v1.
- Omitir validación de `minItems: 1` a nivel esquema y delegarla exclusivamente al verifier: Rechazado porque debilita las garantías formales fail-closed del kernel.

## Consequences
- Se garantiza que todo `assessment/v2` persistido contenga evidencia válida y verificable de cobertura.
- Se mantiene compatibilidad estricta con artefactos históricos de `assessment/v1`.
- Requiere mantener fixtures válidas e inválidas segregadas para v1 y v2.
- Reversibilidad: Alta (versionado semántico canónico aditivo).
