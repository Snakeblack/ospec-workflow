# Verification Report — codex-target-phase-2

- **Change**: codex-target-phase-2
- **Mode**: openspec (standard route)
- **Strict TDD**: ACTIVE (runner: `npm test` → `node scripts/check.js`)
- **Date**: 2026-07-10
- **Final verdict**: **PASS WITH WARNINGS**

## Task Completeness

| Phase | Tasks | Status |
|-------|-------|--------|
| 1 Generation | 1.1–1.5 | ✅ complete |
| 2 Validation | 2.1–2.4 | ✅ complete |
| 3 Hooks runtime | 3.1–3.7 | ✅ complete |
| 4 Install | 4.1–4.4 | ✅ complete |
| 5 Agents autodetection | 5.1–5.2 | ✅ complete |
| 6 Smoke + integration | 6.1–6.3 | ✅ complete |

20/20 tasks marked `[x]`; every coding task has a matching TDD Cycle Evidence row across the three apply batches.

## Build / Test Evidence

| Command | Result |
|---------|--------|
| `npm test` (`node scripts/check.js`) | ✅ exit 0 — "All checks passed. 0 errors, 0 warnings." |
| `go test ./...` | ✅ exit 0 — all packages pass, `internal/hooks` ran fresh (1.759s) |

Runtime execution is authoritative here and both suites are green.

## Spec Compliance Matrix

| Requirement | Scenario | Evidence | Level | Verdict |
|-------------|----------|----------|-------|---------|
| REQ-generator-004 | safe `./` paths | `target-transform.test.js` (`./`-prefix, `..`/absolute reject); `toSafeRelativePath` L194 | runtime-test | ✅ |
| REQ-generator-004 | MCP id violates pattern → fail | `validate-codex.test.js` (id w/ `/`, space); `validateMcpIds` L176 | runtime-test | ✅ |
| REQ-generator-004 | conformant payload passes | `validate-codex.test.js` no-false-positive cases | runtime-test | ✅ |
| REQ-generator-001 | frontmatter → TOML fields | `real-repo.test.js` TOML parse sweep (name/description/developer_instructions/sandbox_mode) | runtime-test | ✅ |
| REQ-generator-001 | TOML excluded from bundle / safe path | manifest keepFields branch + validator RELATIVE_PATH_KEYS | runtime-test | ✅ |
| REQ-hooks-004 | wrapper for exactly 5 events, no 6th | `target-transform.test.js` (five-event + `SomeFutureEvent`-dropped) | runtime-test | ✅ |
| REQ-hooks-004 | POSIX + Windows command resolve | `target-transform.test.js` asserts both `command` and `commandWindows` strings | runtime-test | ✅ |
| REQ-hooks-004 | PLUGIN_DATA propagated intact | inspection: no wrapper layer touches env; `codexHooks` only rewrites command strings | inspection-proof | ⚠️ WARNING |
| REQ-hooks-005 | ASK-class → allow + advisory | `pre-tool-use.test.js` + `pretooluse_test.go` (`OSPEC_TARGET=codex`) | runtime-test | ✅ |
| REQ-hooks-005 | DENY still blocks | `pre-tool-use.test.js` + `pretooluse_test.go` deny-never-degraded | runtime-test | ✅ |
| REQ-hooks-006 | codex transcript resolves skill_resolution | `subagent-stop.test.js` + `subagentstop_test.go` (`agent_transcript_path`) | runtime-test | ✅ |
| REQ-hooks-007 | SessionStart standard contract | `session-start.test.js` + `codex-smoke.test.js` (status/ospecDetected/registry) | runtime-test | ✅ |
| REQ-install-001 | separate idempotent channels, config.toml untouched | `install-codex.test.js` (re-run convergence, byte-for-byte config.toml) | runtime-test | ✅ |
| REQ-install-002 | 4 doc sections present | `docs/codex/README.md` §§ Instalación/actualización, Revisar y confiar en hooks `/hooks`, Flujo de tarea nueva, Rollback | static-lint (declarative contract) | ✅ |
| REQ-install-003 | smoke over published payload in npm test | `codex-smoke.test.js` (build→validate→install→orchestrator TOML→runSessionStart) | runtime-test | ✅ |
| REQ-agents-010 | orchestrator TOML autodetectable, no warnings | `real-repo.test.js` orchestrator dispatch + zero-validator-errors | runtime-test | ✅ |

All 10 MUST requirements satisfied; one MUST *scenario* (PLUGIN_DATA propagation) is proven by inspection rather than a runtime test — see WARNING-1.

## Design & ADR Coherence

| Contract | Implementation | Verdict |
|----------|----------------|---------|
| ADR-001: keepFields += name/version/description, `./` prefix | `codex.js` keepFields + `relativePathFields`; `reshapeManifest` L230; validator `ALLOWED_BUNDLE_KEYS` + `RELATIVE_PATH_KEYS` | ✅ matches |
| ADR-002: MCP ids fixed at source + regex at validator | `.mcp.json` renamed to `context7`/`markitdown`; `validateMcpIds` `^[a-zA-Z0-9_-]+$` | ✅ matches |
| ADR-003: wrapper matcher `.*`/commandWindows; PreToolUse via `OSPEC_TARGET=codex` reusing `applyPermissionMode`; `agent_transcript_path` alias; Go parity | `codexHooks` L343, `applyPermissionMode` L300, `resolveTranscriptPath` L38; Go mirrors `pretooluse.go:286` / `subagentstop.go:238` | ✅ matches |
| design timeout normalization = fixed 10 | `codexHooks` emits `timeout: 10` (source fixtures use 5) | ✅ matches sample |

No design deviations. `validate-codex.js` `validateHooks` nested-shape update was load-bearing maintenance of an already-in-scope file, not a new requirement.

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Present in all 3 apply batches |
| All coding tasks have tests | ✅ | Every RED/GREEN row references an existing, passing test file |
| RED confirmed | ✅ | Batches document pre-change failures; regression-only tasks (1.4, 3.2, 4.x, 5.x) honestly marked GREEN-on-first-run |
| GREEN confirmed | ✅ | `npm test` + `go test ./...` both exit 0 |
| Triangulation adequate | ✅ | ASK vs DENY, `/` vs space MCP ids, `..` vs absolute paths, both transcript field names |
| Safety net for modified files | ✅ | Existing hook/validator suites re-run before modification |

**TDD Compliance**: 6/6 checks passed

### Assertion Quality
Audited: `target-transform.test.js`, `validate-codex.test.js`, `pre-tool-use.test.js`, `subagent-stop.test.js`, `install-codex.test.js`, `real-repo.test.js`, `codex-smoke.test.js`, Go `pretooluse_test.go`/`subagentstop_test.go`.

- No tautologies, no zero-assertion tests, no mock-heavy cases.
- Ghost-loop check: the `.codex/agents/*.toml` sweep (`real-repo.test.js` L96) is guarded by `assert.ok(tomlFiles.length > 0, ...)` at L94 — loop cannot vacuously pass.
- All cases call real production code (`evaluateToolUse`, `transform`, `validateCodex`, `runSessionStart`, `installMain`) with distinct expected values.

**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter/Type checker**: ➖ Not configured beyond `scripts/check.js` (which passed). Coverage tool: ➖ not detected — coverage analysis skipped (not a failure).

---

## Assumption Reconciliation

All 10 ledger entries were `reversibility: high` (sdd-apply-004 is `n/a`). Per the Decision Gates, high-reversibility unresolved entries do not escalate. Each was cross-checked against the implementation and **confirmed**:

| ID | Statement | Cross-check | Resolution |
|----|-----------|-------------|------------|
| sdd-design-001 | `OSPEC_TARGET=codex` env flag drives bypass-degradation | `pre-tool-use.js:300`, `pretooluse.go:286` | confirmed |
| sdd-design-002 | wrapper matcher is `.*` | `target-transform.js:363` + tests | confirmed |
| sdd-design-003 | smoke drives Node hook, not codex binary | `codex-smoke.test.js:100` `runSessionStart` | confirmed |
| sdd-design-004 | wrapper timeout fixed at 10 | `target-transform.js:360` | confirmed |
| sdd-apply-001 | internal helper/field names follow existing convention | present as described | confirmed |
| sdd-apply-002 | missing `.mcp.json` treated non-fatal | `validate-codex.js:178-179` | confirmed |
| sdd-apply-003 | fixed `timeout:10` overrides source | `target-transform.js:360` | confirmed |
| sdd-apply-004 | PLUGIN_DATA task is verification-only (no wrapper layer) | no code touches env | confirmed |
| sdd-apply-005 | Phase 4/5 are regression-only | `install-codex.js` unchanged; tests added | confirmed |
| sdd-apply-006 | smoke calls `runSessionStart` directly | `codex-smoke.test.js` | confirmed |

No unresolved `reversibility: low` entries → no assumption-derived WARNING.

## Issues

### CRITICAL
None.

### WARNING
- **WARNING-1 [design-gap]** — REQ-hooks-004 scenario "PLUGIN_DATA propagated intact" has no runtime test; it is satisfied by architectural absence (the design intentionally interposes no wrapper layer between the Codex host and the Node hook process, so env inheritance is guaranteed by the runtime, not by project code). This is a legitimate senior-level inspection-proof, but the MUST scenario's text describes runtime behavior and no automated evidence exercises it. Low residual risk; consider a thin integration test that spawns `ospec-hooks-launch.js` with `PLUGIN_DATA` set and asserts the child observes the unmodified value if a future batch adds process-boundary fidelity (aligns with the deferred live-CLI smoke).

### SUGGESTION
- **SUGGESTION-1** — `parseAgentToml()` is duplicated between `real-repo.test.js` and `codex-smoke.test.js`. Harmless (self-contained test helpers match repo convention); extract to a shared helper if a third caller appears.

## Final Verdict

**PASS WITH WARNINGS** — All 20 tasks complete, all 10 MUST requirements met with runtime-test evidence (one scenario on inspection-proof), both test suites green, implementation faithful to design.md and the three ADRs, Go/JS parity intact, assertion quality clean. One non-blocking WARNING and one suggestion recorded.

---

## Addendum — Targeted 4R Remediation Re-Verification (2026-07-10)

Scope: confirm ONLY the two 4R CRITICAL remediations (approval-003). Phases 1-6 and the 10 original MUST requirements were verified PASS above and are out of scope here.

### CRITICAL-1 — Dual-signal ASK→allow degradation (`OSPEC_TARGET=codex` + `OSPEC_CODEX_WRAPPER=1`)

- **Gate condition (both JS and Go verified as equivalent):** degradation now requires BOTH signals.
  - `scripts/hooks/pre-tool-use.js:306-308` — `process.env.OSPEC_TARGET === "codex" && process.env.OSPEC_CODEX_WRAPPER === "1"`.
  - `internal/hooks/pretooluse.go:329-330` — `os.Getenv("OSPEC_TARGET") == "codex" && os.Getenv("OSPEC_CODEX_WRAPPER") == "1"`.
  - `bypassPermissions` remains the independent legacy path; DENY is never degraded in either implementation.
- **Marker injection into all five wrapped hooks:** `scripts/lib/target-transform.js:359-380` — `codexHooks` maps every entry through `withCodexWrapperMarker` (POSIX: `OSPEC_CODEX_WRAPPER=1 <cmd>`) and `withCodexWrapperMarkerWindows` (`set OSPEC_CODEX_WRAPPER=1&& <cmd>`) for all `CODEX_WRAPPER_EVENTS` (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop), on both `command` and `commandWindows`. Golden fixture `scripts/configure/__fixtures__/golden/codex/hooks/hooks.json` reflects the marker on every event.
- **Runtime evidence (executed, not just read):**
  - JS `pre-tool-use.test.js`: env var alone (no marker) → ASK preserved; marker alone (no env) → ASK preserved; both present → allow+systemMessage; DENY under both → still deny. Passed via `npm test`.
  - Go `pretooluse_test.go`: `TestPreToolUse_OspecTargetCodex_DegradesAskToAllow`, `..._DenyNeverDegraded`, `..._OspecTargetCodexAlone_DoesNotDegradeAsk`, `..._OspecCodexWrapperAlone_DoesNotDegradeAsk` — all PASS (verbose run confirmed).
  - `target-transform.test.js` asserts the exact marker prefix on POSIX and Windows commands for every event. Passed via `npm test`.

### CRITICAL-2 — AI-attribution DENY guard ported to Go

- **Regex equivalence (compared literally, not trusted):** JS `FORBIDDEN_ATTRIBUTION_RE` (`pre-tool-use.js:28-29`) and Go `forbiddenAttributionRE` (`pretooluse.go:27-29`) are byte-for-byte identical in alternation and anchoring; the only difference is the flag form (`/i` vs inline `(?i)`), which is semantically equivalent. Both use ASCII `\b` word boundaries and the same `🤖` alternative. The `-m/--message` extraction pattern (`commitMessageArgRE`) also mirrors the JS `matchAll` pattern.
- **Runtime evidence (Go tests executed):** `TestPreToolUse_CommitAttribution_DeniesCoAuthoredBy` (Co-Authored-By → deny), `..._DeniesModelNames` (plain model-name mentions → deny), `..._WordBoundaryFalsePositiveAvoidance` ("coherente"/"bombardeo"/"llaman" → NOT denied), `..._CleanMessagePasses` and `..._NonCommitCommandsPass` — all PASS.

### Test-quality audit (both fixes)

Tests are non-tautological and cover the negative case that the old behavior would have failed:
- The "env var alone" / "marker alone" cases assert ASK is preserved — the pre-remediation single-signal gate would have wrongly degraded these to allow, so they directly guard the fix.
- The attribution word-boundary test proves the DENY guard does not over-fire; the Co-Authored-By/model-name tests prove the Go port (which did not exist before) now enforces the deny that only JS enforced previously.

### Build/test execution

- `npm test` (`node scripts/check.js`) → **All checks passed. 0 errors, 0 warnings.**
- `go build ./...` → clean; `go test ./...` → all packages **ok**.

### Verdict (remediation scope)

**PASS — clean.** Both CRITICAL remediations are correct, complete, backed by genuine runtime evidence, and introduce no regression. No new CRITICAL, WARNING, or SUGGESTION for the remediation scope. Assumptions `sdd-apply-007` and `sdd-apply-008` (`pending-verify`) are confirmed against the implementation. The prior WARNING-1 (PLUGIN_DATA inspection-proof) is unchanged and outside this pass.
