# Proposal: Close PP2/CX1 Preflight Guarantees

## Intent

Cerrar las dos garantías que `2.68.2` dejó abiertas y acotar el replay histórico v2.67. El comando del orquestador debe invocar `validate-phase` con la ruta real del plugin y `--workspace` del proyecto; el dispatcher no puede sustituir `route.actual_route` persistido; el noop de replay acepta solo el orden de claves congelado. Correctivo acotado — no rediseño PP2/CX1.

## Scope

### In Scope
- Comando generado del orquestador: ruta real de instalación del plugin + `--workspace` explícito del proyecto.
- Prueba de aceptación: proceso Node independiente cuyo `cwd` es un proyecto que no contiene el script.
- `route-dispatch-run`: no sustituir `actual_route` persistido con `--persisted-route` ni con `actual_route` fuera del bloque `route:`; parsers del dispatcher y de `validate-phase` coincidentes (cierra F-66efe8421b856f34).
- Noop de replay v2.67.0–v2.67.3: solo orden de claves congelado (`schema_version` primero; `question_gate` y opciones en el orden ya fijado). Otro orden de inserción no es compatibilidad prometida.

### Out of Scope
- Conservar bytes JSON originales.
- Rediseñar PP2/CX1; `adaptive-operation-identity-binding`.
- Cambiar `status: proposed` del archivo `2026-09-25-remediate-pp2-cx1-preflight-gaps` (no-objetivo).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `agents`: el comando pre-delegación del orquestador MUST invocar `validate-phase` con la ruta real de instalación del plugin y pasar el workspace del proyecto de forma explícita (`--workspace`).
- `install`: REQ-install-027 — prueba de aceptación con proceso Node independiente (`cwd` = proyecto sin el script); roots plugin vs proyecto no colapsan.
- `routing`: REQ-routing-016 — `route.actual_route` persistido es autoridad; `--persisted-route` y `actual_route` fuera de `route:` no lo sustituyen; parsers dispatcher/`validate-phase` alineados (F-66efe8421b856f34).
- `lifecycle-kernel-runtime`: REQ-lifecycle-kernel-029 — noop v2.67 acotado al orden de claves congelado; sin promesa de otros órdenes ni conservación de bytes.

## Approach

1. Actualizar el comando en `agents/sdd-orchestrator.agent.md` (y proyección normativa en agents) para usar la ruta de instalación del plugin y `--workspace <projectRoot>`.
2. Añadir prueba de proceso hijo con `cwd` ajeno al árbol del script; no basta `main({ scriptDir })` en-proceso.
3. En `route-dispatch-run.js`, priorizar `state.yaml` `route.actual_route`; alinear `readPersistedRouteInfo` con el parser del dispatcher (solo bloque `route:`).
4. Documentar y fijar en Node/Go el orden congelado de claves para el hash legacy; rechazar otros órdenes como no-compatibilidad.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modified | Comando validate-phase con plugin path + `--workspace` |
| `scripts/validate-phase.js` + tests | Modified | Roots + prueba proceso independiente |
| `scripts/route-dispatch-run.js` + dispatcher | Modified | Autoridad de `actual_route`; parsers alineados |
| `phase-completion-reducer.js` / `.go` | Modified | Replay noop solo orden congelado |
| Specs agents / install / routing / lifecycle-kernel-runtime | Modified | Deltas de requisitos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Comando con ruta de plugin incorrecta en targets | Med | Contratos por target + prueba con cwd ajeno |
| Fallback global de `actual_route` rompe legacy | Low | Solo bloquear sustitución; excepción pre-policy intacta |
| Fixtures v2.67 con otro orden dejan de noop | Med | Congelar orden documentado; fixtures al orden fijado |

## Rollback Plan

Revertir commits del branch `fix/close-pp2-cx1-preflight-guarantees` (comando, parsers, replay acotado y pruebas). No toca el archivo `2026-09-25` ni bytes JSON históricos.

## Dependencies

- Main post-`2.68.2` / remediación PP2-CX1 previa aplicada.
- Decisiones cerradas: intent-briefing-001; tres garantías de `approval-context` (no reabrir).
- TDD focused; runner `node --test` vía `npm test`.

## Success Criteria

- [ ] Orquestador invoca `validate-phase` con ruta real del plugin y `--workspace`; proceso Node con cwd ajeno pasa.
- [ ] `--persisted-route` / `actual_route` fuera de `route:` no sustituyen el persistido; parsers coinciden (F-66efe8421b856f34).
- [ ] Noop v2.67 solo con orden congelado; otro orden no es replay idempotente prometido.
- [ ] Specs agents, install, routing y lifecycle-kernel-runtime reflejan las tres garantías.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
