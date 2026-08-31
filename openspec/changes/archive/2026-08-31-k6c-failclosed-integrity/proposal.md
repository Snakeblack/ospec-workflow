# Proposal: K6c Fail-Closed Integrity

## Intent

Cerrar cuatro defectos verificados de K6c que aún permiten aprobar challenges incoherentes. Remediación quirúrgica: sin rediseño ni K6d. Hasta tests negativos, K6c permanece revise / NO-GO para K6d.

## Scope

### In Scope

- Pasar la strategy seleccionada a `validateChallengeResultSet(..., { evidenceStrategy })` (verifier, projector, replay).
- Adversarial: verifier `feature` + ChallengePlan canónico `bug` → `CHALLENGE_INTEGRITY_INVALID`.
- Fail-closed (REQ-004): `missing_tests`, `mutations_tested === 0`, revert/mutación no-op nunca `passed`.
- Planner rechaza `evidenceStrategy` fuera del enum; no reinterpretar a `strict-tdd`.
- `required` único en `challenge-result/v1`; metaschema Draft 2020-12 sobre schemas publicados.

### Out of Scope

- K6d, rediseño K6c, catálogo/selección, follow-ups 4R ajenos.
- Alterar REQ-independent-verification-002 (verifier MAY usar `strict-tdd` si no hay estrategia declarada).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `adversarial-challenges`: REQ-002 rechaza estrategia de planner desconocida; REQ-004 `missing_tests` / cero mutaciones / no-op fail-closed.
- `independent-verification`: REQ-010 inyecta la strategy del verifier en el integrity gate; plan de otra estrategia → `CHALLENGE_INTEGRITY_INVALID`. Conservar fallback ausente de REQ-002.
- `assurance-graph`: REQ-009 projector/replay ligan `evidenceStrategy` igual.
- `kernel-contract-schemas`: REQ-029 `required` único; metaschema Draft 2020-12.

## Approach

`integrity.js` ya compara `bindings.evidenceStrategy` vs `plan.evidence_strategy`. El hueco es cableado: callers no pasan el campo; `verifyCandidate()` calcula `selectStrategy(...)` y no lo entrega a `evaluateChallengeEvidence`.

Runner: `missing_tests` no es fallo adversarial esperado; revert/`focal-mutation` sin cambio de bytes o `mutations_tested === 0` no incrementan defectos ni emiten `passed`. Planner: valor fuera de `bug | feature | refactor | migration | config-docs | strict-tdd` se rechaza (string desconocida y omitido/vacío), distinto del fallback del verifier por ausencia.

Schema: quitar `node_id` duplicado en `required`. Validar schemas publicados contra el metaschema 2020-12 (el chequeo de URI `$schema` en K1 no lo sustituye).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/independent-verifier/{challenge-evidence,index}.js` | Modified | Strategy al gate |
| `scripts/lib/assurance-graph/{projector,index}.js` | Modified | Binding en project/replay |
| `scripts/lib/adversarial-challenges/{runner,planner}.js` | Modified | Fail-closed y reject enum |
| `schemas/kernel/challenge-result/v1.schema.json` | Modified | `required` único |
| Schema tests (`kernel-schema-validator`, `k6c-schema-fixtures`, contract-checkers) | Modified | Metaschema 2020-12 |
| Tests verifier / challenges / assurance-graph | Modified | Casos negativos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Suites sin tests o mutación vacía que hoy “pasan” fallarán | High | Fail-closed + tests negativos |
| Metaschema revela `required` duplicados en otras familias | Med | Corregir unicidad; no rediseñar |
| Confundir reject del planner con fallback del verifier | Low | Ausencia → REQ-002; unknown planner → reject |

## Rollback Plan

Revertir atómicamente el commit/PR (runtime, schemas, tests, deltas). Restaurar comportamiento previo. K6d permanece bloqueado. Sin migración de datos.

## Dependencies

- Gate existente en `scripts/lib/adversarial-challenges/integrity.js`.
- Archivado `2026-08-30-k6c-integrity-remediation` (bindings; no reabrir).

## Success Criteria

- [ ] Verifier `feature` + plan canónico `bug` → `CHALLENGE_INTEGRITY_INVALID`; projector/replay con el mismo binding.
- [ ] `missing_tests`, `mutations_tested === 0`, o revert/mutación no-op no emiten `outcome: "passed"`.
- [ ] `createChallengePlan` con estrategia desconocida rechaza; verifier sin estrategia declarada sigue MAY `strict-tdd`.
- [ ] `required` de challenge-result sin duplicados; schemas publicados validan contra metaschema Draft 2020-12.
- [ ] K6d no comienza; `sdd-verify` terminal PASS con esos negativos.
