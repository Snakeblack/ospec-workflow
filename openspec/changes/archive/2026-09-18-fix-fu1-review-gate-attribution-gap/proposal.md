# Proposal: Fix FU1 — quality-review gate attribution gap for clean kernel-contract changes

## Intent

Un change que toca contrato público kernel (`schemas/kernel/**`), verifica limpio (sin findings, design sin riesgos declarados) y se clasifica `normal` no genera hechos con señal de dominio: la clasificación determinística marca `public-kernel-contract-unattributed`, el router residual no puede justificar dominios (evidencia residual sin `fact_codes`) y el gate termina en `quality-review-ambiguity-unresolved` sin dispatch ni archive, sin `blocker_type` de fase ni override de política. Se necesita un contrato de resolución de ambigüedad que cierre esta ruta de forma auditable (hallazgo FU1, `docs/roadmaps/harness-evolution.md` L117-122, observado en archive `2026-09-17-remediate-cx1-strict-string-parity`).

Descubrimiento relevante: en `classifyQualityReview` (`scripts/lib/review-dimensions.js` L624-633) la clasificación `high-risk` retorna siempre `sufficient` con override; la trampa solo dispara para cambios kernel clasificados `normal`. Este change se clasifica `high-risk` (contrato público kernel + gate de calidad) y por eso no queda atrapado en su propio gate, pero el fix debe cubrir el caso `normal`.

## Scope

### In Scope

1. **Atribución mínima por `capability_scopes`**: extender `attributeFactsFromScopes`/`buildCapabilityCoverage` (`scripts/lib/review-dimensions.js`) para que scopes de contrato público kernel (`schemas/kernel/**` como capability scope) atribuyan dominios aunque el diff no genere señales léxicas — p.ej. un fact sintético `kernel-contract-change` mapeado a un dominio canónico (trust+evolution), respetando fingerprint y validación de evidence.
2. **Override acotado con justificación** análogo al modelo de `quality_gates` (`openspec/config.yaml`): un mecanismo declarado y versionado (p.ej. `quality_review.attribution_override` con `justification`, `scope` y `applies_to`) que el clasificador/router consume para cerrar `public-kernel-contract-unattributed` de forma auditable, con registro en el gate audit.
3. **Contrato del router residual**: `validateRouterDecision`/`ROUTER_REASON` (`review-dimensions.js`) y `planQualityReviewGate` (`review-gate-state.js`) deben permitir resolver el caso con dominios justificados cuando existe override o atribución por scopes.
4. **Deuda adjunta — `createSuccessor` v2**: permitir que el sucesor herede taxonomía v2 (quality domains) vía `startReviewLineage` en `scripts/lib/review-lineage.js` L607-643, eliminando la creación manual de linajes v2.
5. **Propagación multi-target**: regenerar y validar build para claude, vscode, github-copilot y opencode (`scripts/configure/install-*.js`, `validate-*.js`), incluyendo mapeos de tools nativos. Codex/cursor/antigravity fuera.

### Out of Scope

- **Reducer de fases registrando reviewers como "fases" en `state.yaml`** (deuda CX1): follow-up. Criterio de tamaño: tocar `scripts/hooks/subagent-stop.js` + `PhaseCompletionReducer` añadiría un segundo subsistema al diff y arriesga superar el presupuesto de review de 400 líneas; se registra como follow-up en el roadmap.
- **Journal failed del archive-transaction bloqueando re-runs con plan nuevo** (`scripts/lib/archive-transaction.js`): follow-up con el mismo criterio — requiere decisión de contrato (reset de journal vs. nuevo tx id) que merece su propio change.
- Rediseño de la taxonomía de dominios, migración de linajes v1 existentes, targets codex/cursor.

## Capabilities

> Requiere confirmación contra `openspec/specs/` en sdd-spec.

### New Capabilities

- `quality-review-attribution-resolution`: contrato de resolución de ambigüedad del quality-review-gate (atribución por `capability_scopes` de contrato kernel + override acotado con justificación) y semántica de cierre auditable.

### Modified Capabilities

- (Averiguar en specs phase; candidatos: capability existente del review gate / lineage si existe spec vigente.)

## Approach

Capa 1 (kernel lib): fact sintético + atribución por scopes en `review-dimensions.js`; extensión de `validateRouterDecision` para aceptar la resolución. Capa 2 (gate): `planQualityReviewGate` consume override declarativo y cierra con dispatch/archive correctos. Capa 3 (lineage): `createSuccessor` v2 nativo. Capa 4 (proyección): regenerar dist de los 4 targets y validar con sus `validate-*.js`. TDD estricto: cada capa con tests RED→GREEN en `scripts/lib/*.test.js` (mapeo tarea→test→evidencia).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/review-dimensions.js` | Modified | Fact sintético kernel, atribución por scopes, override, contrato router |
| `scripts/lib/review-gate-state.js` | Modified | Cierre auditable del gate con override/atribución |
| `scripts/lib/review-lineage.js` | Modified | `createSuccessor` genera linajes v2 |
| `skills/_shared/gate-4r-review.md` | Modified | Documentar ruta de cierre de la ambigüedad |
| `openspec/config.yaml` | Modified | Bloque opcional de override de atribución (comentado, como `quality_gates`) |
| `scripts/configure/install-*.js`, `validate-*.js` (claude, vscode, copilot, opencode) | Modified | Regeneración/proyección multi-target |
| `docs/roadmaps/harness-evolution.md` | Modified | Marcar FU1 done; registrar 2 follow-ups |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Override se vuelve bypass silencioso del gate | Med | Override acotado: requiere `justification`, scope de paths y registro en gate audit; fail-closed si mal formado |
| Cambio de fingerprint de evidence rompe compatibilidad con gates ya persistidos | Med | Versionar/compatibilizar `fingerprintEvidence`; tests de replay con estados existentes |
| Diff supera presupuesto 400 líneas (strategy: single-pr) | Med | sdd-tasks debe forecast; si High, recomendar chained PRs por capa (lib → gate → build) |
| Regeneración multi-target diverge entre hosts | Baja | Validaciones `validate-*` por target en CI; dist tests auto-generados en temp dir |

## Rollback Plan

Revert del merge/PR: el gate vuelve al comportamiento previo (fail-closed en `public-kernel-contract-unattributed`), sin migración de estado — el override es opt-in declarativo y los facts sintéticos son computados en runtime. El linaje del propio change se crea v2; en rollback el sucesor manual sigue siendo viable.

## Dependencies

- Ninguna externa. Coherencia con schemas kernel (`schemas/kernel/**`) y mirrors Go (`internal/`) a verificar en design.

## Success Criteria

- [ ] Un change kernel-contract limpio clasificado `normal` con `capability_scopes` correctos clasifica `sufficient` (o resuelve vía override) y el gate permite dispatch/archive — reproducible por test.
- [ ] `createSuccessor` produce linaje v2 a partir de linaje v2 terminal, verificado por test.
- [ ] Build regenerado y validado para claude, vscode, github-copilot y opencode.
- [ ] Follow-ups (reducer de fases, journal failed) registrados en el roadmap con criterio de tamaño explícito.
