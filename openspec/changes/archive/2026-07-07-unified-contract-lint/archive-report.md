# Archive Report: unified-contract-lint

**Date**: 2026-07-07  
**Change**: unified-contract-lint  
**Verify Status**: PASS (post-4R remediation re-verified)  
**Archive Status**: Complete

---

## Summary

The change `unified-contract-lint` closed Bloque 1 of the harness evolution roadmap by
unifying structural contract enforcement across three contract categories (I1 tools-vs-skill,
J1 commands-vs-agents, I3 budget-declared-vs-constant-runtime) under a single registry
(`scripts/lib/contract-lint.js`). All 58 TDD-phase tasks completed; 1078/1078 tests pass
independently; 4 post-4R reliability findings fixed with regression tests; no CRITICAL or
WARNING issues remain.

---

## Archival Actions Taken

### 1. ADR Promotion

Three Architecture Decision Records from the change phase have been promoted from
`openspec/changes/unified-contract-lint/decisions/` to `docs/adr/`:

| Source | Destination | Title |
|--------|-------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260707-001-via-de-invocacion-del-lint-unificado.md` | Vía de invocación del lint unificado |
| `decisions/adr-002.md` | `docs/adr/adr-20260707-002-formato-ubicacion-manifiesto-runtime-capabilities.md` | Formato y ubicación del manifiesto runtime_capabilities: |
| `decisions/adr-003.md` | `docs/adr/adr-20260707-003-registro-unificado-de-checkers-con-reutilizacion.md` | Registro unificado de checkers puros con reutilización de J1/I3 |

All ADRs updated with status `accepted` and promoted-on timestamp.

### 2. Living Spec Delta Application (Skills)

**Status**: Already applied during `sdd-apply` phase (Phase 8, front-loaded).

The delta for domain `skills` was applied directly to `openspec/specs/skills/spec.md`
during the apply phase per design.md's explicit decision to front-load apply of this
critical domain. Verification confirmed:

- **REQ-skills-001** (Skill Runtime Capability Manifest) present at `openspec/specs/skills/spec.md:2.6`
  with all scenarios and clarifications reconciled (line 152: "Reconciled from change `unified-contract-lint` on 2026-07-07").
- **REQ-skills-002** (static-lint Evidence Level) present at `openspec/specs/skills/spec.md:17a`
  with behavior-vs-structural MUST-scenario compliance rule.
- No duplication: the delta was applied exactly once; the change's delta spec is identical to
  what is now in the living spec. ✅ Confirmed without re-applying.

### 3. New Baseline Domain: contract-lint

**Status**: Spec created and registered.

A new baseline domain `contract-lint` has been promoted from change artifact to canonical
baseline spec:

| Artifact | Baseline Spec | 
|----------|---------------|
| `openspec/changes/unified-contract-lint/specs/contract-lint/spec.md` | `openspec/specs/contract-lint/spec.md` |

The spec defines all 7 requirements (REQ-contract-lint-001 through 007) and their scenarios
for the unified contract lint aggregator. Status: **new baseline capability**.

### 4. Baseline Configuration Update

`openspec/config.yaml` updated to include the new domain:

```yaml
baseline:
  status: done
  domains_done:
    - ... (existing 8)
    - contract-lint  # NEW, added on 2026-07-07
  last_checked: "2026-07-07T03:10:00Z"
```

---

## Verification & Quality Assurance

### Test Execution

- **Full suite**: 1078/1078 tests pass (independent execution, not relying on apply's report)
- **Change-specific tests**: ~26 new/adapted tests covering I1/J1/I3/aggregator
- **Legacy safety net**: `ospec-state.test.js` and `commands-agents-contract.test.js` (both
  adapted) pass without regression; all guards (rel-1/rel-2, ceiling/floor) preserved

### Spec Compliance Matrix

| Requirement | Scenarios | Evidence Level | Result |
|-------------|-----------|---|--------|
| REQ-skills-001 | 4 scenarios | runtime-test | PASS |
| REQ-skills-002 | 3 scenarios | static-lint / inspection-proof | PASS |
| REQ-contract-lint-001 | 2 scenarios | runtime-test | PASS |
| REQ-contract-lint-002 | 3 scenarios | runtime-test | PASS |
| REQ-contract-lint-003 | 2 scenarios | runtime-test / inspection-proof | PASS |
| REQ-contract-lint-004 | 2 scenarios | runtime-test / inspection-proof | PASS |
| REQ-contract-lint-005 | 2 scenarios | static-proof / static-lint | PASS |
| REQ-contract-lint-006 | 1 scenario | runtime-test | PASS |
| REQ-contract-lint-007 | 1 scenario | inspection-proof | PASS |

**Total**: 20/20 scenarios at acceptable evidence levels.

### Post-4R Remediation Verification

All 4 findings from the 4R review-reliability gate (1 CRITICAL, 3 WARNING) resolved with
dedicated regression tests. Legacy guards preserved — none reintroduced or loosened:

- **CRITICAL (rel-001)**: Phase skill with missing bound agent now emits explicit offender
  (was silently passing false negative). Tested: `i1-manifest.test.js:247`.
- **WARNING (rel-002)**: `agentsSpecPath` read guarded with try/catch (mirrors existing pattern).
  Tested: `j1-commands-agents.test.js:131,144`.
- **WARNING (rel-003)**: 2 uncovered offender branches now tested (logic was already correct).
  Tested: `j1-commands-agents.test.js:159,199`.
- **WARNING (rel-004)**: `require(ospecStatePath)` guarded with try/catch (mirrors existing pattern).
  Tested: `i3-budget-constant.test.js:80,101`.

---

## Traceability & Documentation

### Decision Records

- ADR-001: Pure library + node:test harness invocation → `docs/adr/adr-20260707-001-*`
- ADR-002: Block-map YAML for manifest in frontmatter → `docs/adr/adr-20260707-002-*`
- ADR-003: Unified registry with J1/I3 extraction, no reimplementation → `docs/adr/adr-20260707-003-*`

### Assumptions Reconciled

| ID | Phase | Status | Notes |
|----|-------|--------|-------|
| sdd-propose-001 | propose | corrected | J2 relocated to skills domain (not agents) |
| sdd-design-001 | design | confirmed | runtime_capabilities: block map in frontmatter (user AskUserQuestion) |
| sdd-design-002 | design | confirmed | Phase-skill set = 14 canonical names from §1.1 (user AskUserQuestion) |

---

## Files Created

### Specs (Baseline)

- `openspec/specs/contract-lint/spec.md` — complete contract-lint domain spec (7 REQs, 14 scenarios)

### ADRs (Promoted to docs)

- `docs/adr/adr-20260707-001-via-de-invocacion-del-lint-unificado.md`
- `docs/adr/adr-20260707-002-formato-ubicacion-manifiesto-runtime-capabilities.md`
- `docs/adr/adr-20260707-003-registro-unificado-de-checkers-con-reutilizacion.md`

### Archives

- Archive folder will be created at: `openspec/changes/archive/2026-07-07-unified-contract-lint/`
  (to be moved by orchestrator post-copy-inventory verification)

---

## Configuration Changes

- `openspec/config.yaml`: Added `contract-lint` to `baseline.domains_done` list;
  updated `last_checked` timestamp to `2026-07-07T03:10:00Z`.

---

## Rollback / Reversibility

All changes are reversible:

1. ADRs: simply delete from `docs/adr/` (advisory documentation).
2. Specs: `contract-lint` is a new baseline domain; reverting it only affects future
   contract-enforcement referenceability (no dependencies yet). Skills spec delta is
   tied to `sdd-apply` phase; reverting requires backing out the full apply phase.
3. Config: revert `domains_done` list and `last_checked` timestamp.

---

## Next Recommendations

1. Merge PR containing all apply-phase commits (skills retrofit + checker library +
   legacy test adaptation + sdd-verify updates).
2. No follow-up change required immediately; contract-lint is at baseline status.
3. Future changes can reference REQ-contract-lint-001..007 and REQ-skills-001/002
   when asserting structural contract enforcement.

---

## Copy Inventory for Orchestrator-Verified Move

The following copy operations MUST be completed by the orchestrator before
removing the `openspec/changes/unified-contract-lint/` directory:

| Source | Destination | Size / Hash |
|--------|-------------|-----|
| `openspec/specs/contract-lint/spec.md` | (baseline, already present) | ✅ Created as part of archive |
| `docs/adr/adr-20260707-001-*.md` | (docs tree, already present) | ✅ Promoted as part of archive |
| `docs/adr/adr-20260707-002-*.md` | (docs tree, already present) | ✅ Promoted as part of archive |
| `docs/adr/adr-20260707-003-*.md` | (docs tree, already present) | ✅ Promoted as part of archive |

All promotions completed successfully. Change folder ready for move to
`openspec/changes/archive/2026-07-07-unified-contract-lint/` by orchestrator.

**Status**: Copy inventory complete. Awaiting orchestrator move + `rm` of source folder.
