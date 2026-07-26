# Design: Hybrid Transactional Archive Runtime

Mode: `design-after-spec` (four change-local specs read). Roadmap O6A; architecture `docs/architecture/harness-evolution.md` §9.

## Technical Approach

Two dependency-free CommonJS modules split along the §9 semantic/deterministic boundary, plus a thin CLI so the orchestrator can invoke the runtime the same way it already invokes `node scripts/configure/validate-phase.js`.

- `scripts/lib/archive-plan.js` — pure. Parses `archive-plan.json`, validates schema v1 and (against a caller-supplied snapshot object) every hash and reference. No `fs`, never throws, returns `{valid, codes[], errors[]}` in the `result-envelope.js` validator style.
- `scripts/lib/archive-transaction.js` — the only module that touches the filesystem. Owns preflight, staging, three-way compare, atomic commit, delete-after-full-match, journal, rollback, resume and receipt. Its decision core `nextTransactionAction(journal, facts)` is a pure reducer (review-lineage style) exported for unit tests; the I/O shell only executes what the reducer returns.
- `scripts/archive-transaction-run.js` — CLI wrapper printing the receipt as JSON on stdout, exit `0` only on `success` / `resumed-success`.

Agent-side work is prose-only: `sdd-archive` emits the plan (REQ-skills Plan-and-Report), the orchestrator invokes the runtime and treats the receipt as the sole close authority (REQ-agents-008).

## Architecture Decisions

Each row is mirrored by an ADR under `decisions/`.

| # | Decision | Rejected option (tradeoff) | Rationale |
|---|----------|----------------------------|-----------|
| 001 | `journal.json`, `staging/`, `receipt.json` live in `.ospec/archive-tx/{change}/` | Inside the origin folder (staging travels into the audit trail); inside `archive/` (litters history); OS temp dir (`EXDEV` on commit) | `.ospec/` is the existing gitignored ephemeral-runtime root, survives process death for resume, and shares a volume with `openspec/`, which is what makes `rename` atomic |
| 002 | `validatePlanAgainstSnapshot(plan, snapshot)` receives pre-computed hashes | Validator reads the filesystem itself (two I/O owners, fixture-heavy tests) | REQ-archive-plan-contract-001 forbids I/O in the pure validator; keeps one auditable I/O owner |
| 003 | Additive `renameWithFallback` export in `atomic-write.js`, reused for files and directories | Duplicating the fallback in the runtime; widening `writeFileAtomic` to directories | One proven `EPERM`/`EEXIST` path, zero blast radius on `state.yaml` persistence |
| 004 | `rejection_codes[]` keeps only the v1 plan allowlist; runtime causes go in `failure_reason` | Extending the allowlist with I/O causes | REQ-archive-plan-contract-003 makes the allowlist the authoritative *plan* failure identity; mixing causes breaks "unknown code ⇒ fail closed" |
| 005 | Runtime preflight re-reads verdict, `gates.quality-gates`, override approvals and `baseline_fingerprints` from `state.yaml` | Trusting a gate summary embedded in the plan; adding a YAML dependency | §9.1 assigns fingerprints to the deterministic plane; a self-asserted plan is self-certification |
| 006 | JS only, no `internal/archivetransaction` mirror | Mirroring transactional FS logic with no caller | `cmd/ospec-hooks` has no archive responsibility; parity recorded as N/A in the receipt and roadmap |

## Data Flow

```
Orchestrator            sdd-archive          archive-plan.js       archive-transaction.js
     │  dispatch ──────────>│
     │                      │ interpret deltas, prepare content, hash
     │<── envelope + archive-plan.json (change-local, no live writes)
     │
     │  node scripts/archive-transaction-run.js {change}
     │────────────────────────────────────────────────────────>│
     │                                    validate(plan,snapshot)│  (1) preflight
     │                                    <───── {valid, codes} ─│
     │                                                           │  (2) journal: preflighted
     │                                                           │  (3) staging/  ← inventory + spec writes + ADRs
     │                                                           │  (4) compare A: origin ↔ staging
     │                                                           │  (5) commit: rename staging → archive/, specs/, docs/adr/
     │                                                           │  (6) compare B: origin ↔ live destination
     │                                                           │  (7) delete origin  ← only after (6) full match
     │<──────────────── receipt.json {outcome, inventory, cost} ─│
     │ closes the route ONLY on outcome success|resumed-success
```

State machine persisted in `journal.state`:

```
init → preflighted → staged → compared → committed → confirmed → done
  └────────┴──────────┴──────────┴───────────┴──────────┴──> failed | rolled-back
```

Resume semantics per state on re-invocation: `init|preflighted` → restart from preflight; `staged|compared` → re-verify staging hashes, continue; `committed` → run compare B, then delete; `confirmed` → delete origin (or no-op if already absent); `done` → `outcome: success` with `already_complete: true`; `failed|rolled-back` → terminal, requires explicit re-plan.

Identity guard: the journal stores `plan_sha256`. A re-invocation carrying a different plan digest against a non-terminal journal fails closed with `journal-plan-conflict` — it never silently resets the transaction.

Rollback (`--rollback`, strategy `staging-rename`): before commit it deletes `staging/` only; during commit it restores each `{target}.bak` and removes destination directories the journal marked `created_by_tx: true`; after `done` it is a no-op — archived history is never rewritten.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/archive-plan.js` | Create | Schema v1 parse/validate, allowlisted codes, snapshot hash/reference checks |
| `scripts/lib/archive-plan.test.js` | Create | Pure unit tests (no filesystem) |
| `scripts/lib/archive-transaction.js` | Create | Reducer + I/O shell: preflight, staging, compare, commit, delete, journal, rollback, receipt |
| `scripts/lib/archive-transaction.test.js` | Create | Reducer unit tests + filesystem fixtures |
| `scripts/archive-transaction-run.js` | Create | CLI entry point; prints the receipt, exit code from `outcome` |
| `scripts/lib/atomic-write.js` | Modify | Additive `renameWithFallback` export; `writeFileAtomic` unchanged |
| `scripts/lib/atomic-write.test.js` | Modify | Coverage for `renameWithFallback` (files and directories) |
| `skills/sdd-archive/SKILL.md` | Modify | Copy-and-Report → Plan-and-Report; Step 4b proposes ADRs in the plan; Step 5 emits the plan; Cost stays human-readable only |
| `skills/_shared/gate-archive-quality.md` | Modify | Post-Return Move Completion → runtime invocation + receipt; keeps "halt with the source directory left intact" |
| `agents/sdd-archive.agent.md` | Modify | Required artifacts: plan emission, no live spec/ADR writes, no move |
| `agents/sdd-orchestrator.agent.md` | Modify | Reads/Writes row for `sdd-archive` (plan + receipt) |
| `scripts/archive-move-fingerprint-contract.test.js` | Modify | Re-anchor `recursively diff the destination` / `copy inventory` to the new contract strings |
| `scripts/mentor-adr-contract.test.js` | Modify | A5.2/A5.3/G.1 anchor removed Step 4b/Step 5 prose — re-anchor to plan-based ADR promotion |
| `scripts/configure/real-repo.test.js` | Modify | Replace the `recursively diff the destination` sentinel (keep the halt sentinel) |
| `docs/roadmaps/harness-evolution.md` | Modify | O4.2 done / O6A in progress |
| `dist/**` (six targets) | Regenerate | Distribution sync after prompt edits |

## Interfaces / Contracts

```js
// scripts/lib/archive-plan.js
module.exports = {
  PLAN_SCHEMA_VERSION: 1,
  PLAN_REJECTION_CODES,                       // frozen v1 allowlist
  parsePlan(text),                            // -> {parsed: boolean, value|null}
  validatePlanShape(plan, { changeName }),    // -> {valid, codes[], errors[]}
  validatePlanAgainstSnapshot(plan, snapshot),// -> {valid, codes[], errors[]}
  isKnownRejectionCode(code),
};

// snapshot (built by the runtime, POSIX-separated relative paths)
{ changeName, sourceFingerprint, originInventory: [{path, sha256}],
  targets: { "openspec/specs/routing/spec.md": "sha256:…" | null },
  preparedContent: { "specs/routing/spec.md": "sha256:…" },
  adrSources: { "decisions/adr-001.md": "sha256:…" } }
```

`source_fingerprint` = SHA-256 over the origin inventory serialized as `"{sha256}  {posixPath}\n"` lines sorted by path. Hashes are taken over raw bytes, so a plan is valid only within the working tree that produced it (line-ending normalization would otherwise make Windows and Linux disagree).

```js
// scripts/lib/archive-transaction.js
runArchiveTransaction({ workspace, changeName, planPath, now, fsImpl })  // -> receipt
nextTransactionAction(journal, facts)   // pure reducer, exported for tests
computeInventory(rootDir)               // -> [{path, sha256}] sorted, POSIX paths
readArchiveGateFacts(stateYamlText)     // pure: verdict, quality-gates, override, fingerprints
rollbackTransaction({ workspace, changeName })
```

```json
// .ospec/archive-tx/{change}/receipt.json  (also printed to stdout)
{ "schema_version": 1, "change": "…", "plan_sha256": "sha256:…",
  "outcome": "success | failed | rolled-back | resumed-success",
  "already_complete": false,
  "destination": "openspec/changes/archive/2026-07-26-…",
  "committed_inventory": [{ "path": "proposal.md", "sha256": "…" }],
  "origin_deleted": true,
  "cost": { "available": true, "phases": [ … ], "total_questions_asked": 3 },
  "rejection_codes": [], "failure_reason": null, "parity": { "go": "n/a" } }
```

Cost aggregation reads `.ospec/session/{change}/phase-costs.jsonl` with the REQ-skills rules (group by phase, sum the four estimated token fields, `invocations - 1` floored at 0, questions from `gates.*.questions_asked`); a missing or empty file yields `{"available": false}` and never fails the transaction.

## Testing Strategy

Strict TDD is active: every task starts RED with a failing test, and `npm test` (`node --test scripts/**/*.test.js`) picks new files up automatically.

| Layer | What to test | Approach |
|-------|--------------|----------|
| Unit (pure) | Schema v1 acceptance, unknown `schema_version`, bad `rollback.strategy`, each allowlisted code, unknown-code fail-closed, snapshot hash/reference mismatches | `archive-plan.test.js`, plain objects, no filesystem |
| Unit (pure) | `nextTransactionAction` per state, resume matrix, `journal-plan-conflict`, terminal idempotence | `archive-transaction.test.js` reducer block, journal objects only |
| Unit (pure) | `readArchiveGateFacts` over `state.yaml` text variants (missing block, override present, absent fingerprints) | String fixtures |
| Integration (FS) | Pre-commit failure leaves origin intact; post-staging resume; hash mismatch blocks; full match commits then deletes; rollback; idempotent re-run | `fs.mkdtemp(os.tmpdir()/'ospec-archive-tx-')` building a complete fake workspace (`openspec/`, `.ospec/`, `docs/adr/`) so staging and destination share one volume; `t.after` cleanup — the pattern already used by `atomic-write.test.js` and `federation-marker.test.js` |
| Integration (FS) | Windows `EPERM`/`EEXIST` commit fallback | `fsImpl` seam injecting a fake `rename` that throws `EPERM` once, then `EEXIST`, asserting exactly one live target and origin still present; runs identically on both OSes |
| Contract (static) | Re-anchored prose strings in the three affected contract test files | String assertions, no LLM |

Cross-OS rules for fixtures: compare relative paths as POSIX strings derived from `readdir` entries (never re-cased), hash `Buffer`s not decoded text, assert invariants ("exactly one live target", "origin exists") rather than `process.platform` branches, and reject symlinks/junctions in the inventory fail-closed as `io-error`.

## Migration / Rollout

Single authority, no dual path and no data migration. The prose edits and the contract-test re-anchors land in the same change, so the old copy-and-diff wording cannot survive a green `npm test`. Because the removed prose is currently pinned by three test files, they must be updated in the same slice as the prose. Rollback is a branch revert: the new modules are additive and `writeFileAtomic` is untouched.

## Open Questions

None.
