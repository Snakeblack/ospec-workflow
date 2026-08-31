# Archive Report: k6c-failclosed-integrity

**Archive destination (planned)**: `openspec/changes/archive/2026-08-31-k6c-failclosed-integrity/`
**Verified**: 2026-08-31
**Verify verdict**: PASS WITH WARNINGS (33/33 MUST; 15/15 tasks; `npm test` 2881 pass / 1 fail pre-existing / 3 skipped)
**Working branch**: `fix/k6c-failclosed-integrity`
**4R lineage**: approved (`terminal_reason: no-unresolved-blocking-findings`; `archive_allowed: true`)

## Summary

Remediación quirúrgica K6c fail-closed: el planner rechaza `evidenceStrategy` omitida/vacía/fuera de enum (TypeError, sin coerción a `strict-tdd`); el runner emite `outcome: "error"` con `MISSING_TESTS` / `NO_MUTATION_APPLIED` / `CHALLENGE_NOOP` y nunca `passed`; verifier, projector y replay ligan la strategy seleccionada al integrity gate (`CHALLENGE_INTEGRITY_INVALID` / `GRAPH_DIVERGENCE` ante plan canónico de otra strategy); `challenge-result` `required` único y validación de schemas publicados contra metaschema Draft 2020-12 (uniqueItems local, sin Ajv). K6d permanece bloqueado. Este informe es Plan-and-Report: el runtime aplica specs live, ADRs y el move.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| `phases.verify.verdict` (state.yaml) | PASS WITH WARNINGS (written for runtime gate; was missing) |
| CRITICAL issues (verify) | None |
| WARNING issues (verify) | 1 pre-existing harness EISDIR — explicitly accepted, not a K6c defect |
| Apply tasks complete | 15/15 |
| 4R review gate | approved (`no-unresolved-blocking-findings`; `archive_allowed: true`) |
| 4R blocking findings | None (0 BLOCKER, 0 CRITICAL; 2 readability WARNING advisory) |
| Baseline fingerprints | Match live `openspec/specs/{domain}/spec.md` bytes for all four delta domains |
| Destructive delta | No (5 MODIFIED requirements; 0 REMOVED; other requirements preserved) |

Close-gate: PASS WITH WARNINGS proceeds because the three listed warnings are explicitly accepted as follow-ups (orchestrator + this report + `accepted_warnings[]`).

## Spec Preparation (change-local)

Copy-full-then-edit of live specs; deltas applied by requirement name. Unmodified requirements preserved, including pre-existing `### Requirement:### Requirement:` heading duplication on kernel-contract-schemas REQ-002..026 (out of scope; not rewritten).

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `adversarial-challenges` | Prepared merge | — | REQ-002, REQ-004 (2) | — |
| `independent-verification` | Prepared merge | — | REQ-010 (1) | — |
| `assurance-graph` | Prepared merge | — | REQ-009 (1) | — |
| `kernel-contract-schemas` | Prepared merge | — | REQ-029 (1) | — |

New scenarios merged into those requirements (planner reject; missing-tests/no-op fail-closed; selected-strategy mismatch; wrong-strategy graph; unique `required` + metaschema). No new domain files.

Prepared bytes:

- `prepared-specs/adversarial-challenges/spec.md` (`sha256:2de45224deb54da3c3cb87f24fd41d8be1cca549b293cad692743a7fedaa2409`)
- `prepared-specs/independent-verification/spec.md` (`sha256:bb4367b45d23c8cc4a4d22840a40a978672164a405d8b5ba4f0a2ed9155f864a`)
- `prepared-specs/assurance-graph/spec.md` (`sha256:7b5e1fdb349fd54eb6dfd5dc5075e4d4bb785fa2625fd2f129767e3949cf5b54`)
- `prepared-specs/kernel-contract-schemas/spec.md` (`sha256:33ec7b355ed81c320cc23a381976cfb574390d62ad0975cfc583b900e0484a29`)

Live `openspec/specs/**` writes are runtime-owned. `source_delta` points at `prepared-specs/` so the runtime copies merged bytes, not the audit-trail deltas under `specs/`.

`target_before_sha256` (live, matches `baseline_fingerprints`):

- adversarial-challenges `sha256:d0304135fb98c6402ec301a1d209529ea571febffac52c4d34c16d0fe9c80361`
- independent-verification `sha256:274c3d3e7c135cb7e4aee9a61e2ad1995ba3b326f827f6cc1aff375feca712b8`
- assurance-graph `sha256:0aba79cad7e517afd4e6089bdbc2190edb46d514b8a84f7504d9886d22ad774b`
- kernel-contract-schemas `sha256:f4787efc0a7302d47ebd1c42d527e1476213210035d69acce994a47415a50ce6`

## ADR Promotions (planned)

No `docs/adr/adr-20260831-*` collision. NNN starts at 001.

| Source | Planned target | content_sha256 |
|--------|----------------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260831-001-planner-rejects-invalid-strategy-with-typeerror.md` | `sha256:78f37040278b4d9434e110de420dcb9843925f856c3ea67f6ac9946bc588b6f3` |
| `decisions/adr-002.md` | `docs/adr/adr-20260831-002-no-evidence-challenges-emit-outcome-error.md` | `sha256:ebf2bfc743e5cc1a74bb53e3c1ad30421a2a5b76d2c9898da3e970b12440e3ca` |
| `decisions/adr-003.md` | `docs/adr/adr-20260831-003-evaluation-requires-the-selected-strategy-binding.md` | `sha256:912921fa6a969d44cc3aa14044a49e6bcba9681b0dc61ed050faa0335809c282` |
| `decisions/adr-004.md` | `docs/adr/adr-20260831-004-constrained-draft-2020-12-metaschema-without-ajv.md` | `sha256:cec9b5f37b58ddb73ebd54dd67d6f5bece5e79d1a857065f3c28c9eba5a07834` |

Change-local copies under `decisions/` travel with the archive folder as audit trail. Live `docs/adr/**` writes are runtime-owned. ADRs were not invalidated during verify.

## Accepted Risks / Follow-ups

Verify WARNINGs and 4R advisory WARNINGs are **explicitly accepted** as follow-ups (`accepted_warnings[]`). Close gate satisfied.

| ID | Severity | Origin | Summary | Disposition |
|----|----------|--------|---------|-------------|
| verify-cli-eisdir | WARNING | verify / `code-bug` harness | Pre-existing `scripts/configure/cli.test.js` after-hook `ERR_FS_EISDIR` on leftover `openspec/changes/evidence-link`. `npm test` exit 1. Documented in `openspec/memory/known-issues.md`. Not caused by this change. | accepted-follow-up; do not treat as K6c defect |
| F-18269a599e0c7bb8 | WARNING | 4R readability | `runIsolatedMutation` focal-mutation nesting (if→for→for→try→if). New fail-closed reasons sit inside that nest. | advisory follow-up; non-blocking |
| F-d014622245a8b2bf | WARNING | 4R readability | `CHALLENGE_NOOP` dual flow: revert accumulates `bytesChanged` then fails; focal returns on first identity mutation. | advisory follow-up; non-blocking |

Verify SUGGESTION (not a close-gate warning): leftover untracked symlink `openspec/changes/evidence-link` after the failing after-hook. Clean before commit; do not add it to this change.

K6d remains blocked. Do not promote K6d. K6c stays DONE only after this archive's spec merge.

**Orchestrator follow-up (docs, not this executor):** `docs/roadmaps/harness-evolution.md` and `docs/architecture/harness-evolution.md` already mark K6c `done` and K6d `next-eligible` after `k6c-integrity-remediation`. After runtime commit, record `k6c-failclosed-integrity` as the fail-closed closure of K6c. Do not rewrite those live docs in this phase; do not promote K6d.

`open_decisions` absent in `state.yaml` — no write to `openspec/memory/decisions.md`.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint identity): proposal, design, tasks, apply/verify/archive reports, delta specs, prepared-specs, four decisions, state, `.4r/` review lineage artifacts. Exact list is `archive_inventory[]` in `archive-plan.json` (computed after this report and the state.yaml archive-phase update).

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6c-failclosed-integrity`
- Source directory `openspec/changes/k6c-failclosed-integrity/` still exists until runtime receipt confirms full match and delete-after-commit.
- This executor did not write live `openspec/specs/**` or `docs/adr/**`, did not copy/move the change into `archive/`, and did not delete the source directory.

## Discoveries

1. `phases.verify.verdict` was missing from `state.yaml`. `readArchiveGateFacts` requires `PASS` or `PASS WITH WARNINGS` or preflight fails `gate-not-satisfied`. Added `verdict: "PASS WITH WARNINGS"` under `phases.verify` as part of the archive state update.
2. Prepared merged bytes must live under change-local `prepared-specs/` even under Plan-and-Report. The runtime copies `spec_writes[].source_delta` verbatim onto live specs. Pointing `source_delta` at `specs/{domain}/spec.md` would replace main specs with delta-only Markdown (destructive). Same class of failure as the archived k4b-correctness-remediation stub incident.
3. Live `openspec/specs/kernel-contract-schemas/spec.md` has duplicated `### Requirement:### Requirement:` headings on REQ-002 through REQ-026. Copy-full preserved them; repairing would be an unrelated rewrite.
4. `.ospec/session/k6c-failclosed-integrity/phase-costs.jsonl` is absent. Cost incompleteness does not gate archive.
5. `openspec/memory/decisions.md` does not exist; `open_decisions` is absent. Step 4 skipped.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6c-failclosed-integrity/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
