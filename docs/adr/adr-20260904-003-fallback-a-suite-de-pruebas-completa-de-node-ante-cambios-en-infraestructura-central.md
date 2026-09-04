# ADR-003: Fallback a suite de pruebas completa de Node ante cambios en infraestructura central

- Status: proposed
- Change: fast-precommit-remediation
- Date: 2026-09-04

## Context

`findAffectedTests` ejecutaba únicamente tests unitarios directos. Cambios en módulos compartidos del arnés (`scripts/lib/**` fuera de checkers aislados) o en el orquestador principal `scripts/check.js` podían romper dependencias indirectas en otros scripts sin ser detectados por el hook diferencial.

## Decision

Retornar el patrón de la suite completa de Node (`["scripts/**/*.test.js"]`) en `findAffectedTests` si alguno de los archivos preparados pertenece a `scripts/lib/` (excluyendo verificadores de contratos en `scripts/lib/contract-checkers/`) o es `scripts/check.js`.

## Alternatives

- Ejecutar solo el test unitario directo del módulo: No detecta roturas en consumidores indirectos de librerías compartidas.
- Mapeo estático manual de dependencias: Frágil, costoso de mantener y propenso a desactualizarse.

## Consequences

Cero regresiones no detectadas en el arnés central, ejecutando la suite nativa completa (~2-3s) solo ante cambios en infraestructura núcleo. Los commits habituales conservan su tiempo de validación inferior a 1 segundo. Reversibilidad alta.
