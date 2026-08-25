# ADR-003: Comparador shadow estrictamente pasivo con telemetría no bloqueante

- Status: proposed
- Change: k4b-repair-shadow-execution
- Date: 2026-08-25

## Context

La vertical shadow evalúa el nuevo pipeline de Repair comparándolo frente a la baseline fija de control (`fixed`). Es imperativo que esta evaluación no altere flujos de producción ni mute configuraciones activas.

## Decision

Diseñar `shadow-comparator.js` como un observador pasivo de sólo lectura (`read-only`). Evalúa múltiples dimensiones (steps, diffs, obligaciones, invariantes, inventario) y registra telemetría de discrepancias sin mutar git branches, journals ni defaults, respetando el gate de promoción K9.

## Alternatives

- Auto-promover candidatos que coincidan con la baseline: descartado porque eludiría el gate formal K9 y de autorización K10.
- Bloquear la ejecución de producción si la vertical shadow diverge: descartado para evitar impactos operativos en rutas activas estables.

## Consequences

Asegura cero impacto en producción y visibilidad completa del comportamiento shadow mediante telemetría estructurada. Reversible vía `git revert`.
