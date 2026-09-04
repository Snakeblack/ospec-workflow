# Tasks: Invalidación Completa de Targets y Modo Fail-Closed en Pre-commit

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Fallo de Git en enumeración de archivos staged (fail-closed) | MUST | `scripts/hooks/lib/staged-validator.js` (`getStagedFiles`) | covered-by-design | Lanza `Error` descriptivo ante `res.error` o `res.status !== 0` |
| Fallo de Git al leer blob staged (fail-closed) | MUST | `scripts/hooks/lib/staged-validator.js` (`getStagedContent`) | covered-by-design | Lanza `Error` descriptivo ante ruta vacía, `res.error` o `res.status !== 0` |
| Modificación en validador o instalador de target aislado [REQ-git-precommit-hook-001] | MUST | `scripts/hooks/lib/staged-validator.js` (`findAffectedTargets`) | covered-by-design | Retorna arreglo con target único aislado |
| Fallback a ALL_TARGETS por cambio en generador compartido o librerías auxiliares [REQ-git-precommit-hook-001] | MUST | `scripts/hooks/lib/staged-validator.js` (`findAffectedTargets`, `CANONICAL_SHARED_FILES`) | covered-by-design | Retorna copia de `ALL_TARGETS` |
| Fallback a ALL_TARGETS por cambio en perfil o models.yaml [REQ-git-precommit-hook-001] | MUST | `scripts/hooks/lib/staged-validator.js` (`findAffectedTargets`, `CANONICAL_SHARED_PREFIXES`) | covered-by-design | Retorna copia de `ALL_TARGETS` |
| Fallback a ALL_TARGETS por modificación en entradas canónicas del generador [REQ-git-precommit-hook-001] | MUST | `scripts/hooks/lib/staged-validator.js` (`findAffectedTargets`, `CANONICAL_SHARED_PREFIXES`) | covered-by-design | Retorna `ALL_TARGETS` para `agents/`, `skills/`, `rules/`, `commands/`, `hooks/`, etc. |
| Fallback a ALL_TARGETS por modificación en hooks distribuidos de runtime [REQ-git-precommit-hook-001] | MUST | `scripts/hooks/lib/staged-validator.js` (`findAffectedTargets`, `CANONICAL_SHARED_PREFIXES`) | covered-by-design | Retorna `ALL_TARGETS` para `scripts/hooks/**` |
| Bloqueo de commit por secreto preparado en el índice de Git [REQ-agent-shield-security-001] | MUST | `scripts/hooks/pre-commit-hook.js` (`runPreCommit`, AgentShield) | covered-by-design | Bloquea commit con código 1 y banner descriptivo |
| Commit permitido cuando el secreto solo existe en el working tree [REQ-agent-shield-security-001] | MUST | `scripts/hooks/pre-commit-hook.js` (`runPreCommit`, AgentShield) | covered-by-design | Evalúa exclusivamente blob del índice vía `getStagedContent` |
| Integración en Git temporal detectando secreto staged con working tree limpio [REQ-agent-shield-security-001, REQ-git-precommit-hook-003] | MUST | `scripts/hooks/lib/staged-validator.integration.test.js` | covered-by-design | Prueba contra repositorio Git efímero real |
| Bloqueo de commit por fallo al leer blob staged en escaneo de secretos (fail-closed) [REQ-agent-shield-security-001] | MUST | `scripts/hooks/pre-commit-hook.js` (`runPreCommit`, AgentShield) | covered-by-design | Captura error de `getStagedContent`, emite banner `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"` y sale con código 1 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120-180 líneas |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | feature-branch-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Invalidación canónica de targets y política fail-closed en Git y escaneo de secretos | PR 1 | Base: feature branch; incluye tests unitarios, de integración y suite completa |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Canonical Generator Input Invalidation in findAffectedTargets

- [x] 1.1 [RED] Add unit tests in `scripts/hooks/lib/staged-validator.test.js` asserting `findAffectedTargets` returns `ALL_TARGETS` for staged canonical inputs (`agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`), generator helpers (`frontmatter.js`, `model-resolver.js`, `target-transform.js`, `target-profiles/**`), and runtime hooks (`scripts/hooks/**`) [REQ-git-precommit-hook-001]
- [x] 1.2 [GREEN] Expand `CANONICAL_SHARED_FILES` and `CANONICAL_SHARED_PREFIXES` in `scripts/hooks/lib/staged-validator.js` so `findAffectedTargets` returns `[...ALL_TARGETS]` when any staged file matches [REQ-git-precommit-hook-001]
- [x] 1.3 [REFACTOR] Clean up path normalization helper and deduplicate target resolution paths in `scripts/hooks/lib/staged-validator.js` [REQ-git-precommit-hook-001]

## Phase 2: Fail-Closed Staged Files Retrieval in getStagedFiles

- [x] 2.1 [RED] Update unit tests in `scripts/hooks/lib/staged-validator.test.js` to assert `getStagedFiles` throws descriptive `Error` when `git diff --cached` fails (`res.status !== 0` or `res.error`) instead of returning `[]` [REQ-git-precommit-hook-001]
- [x] 2.2 [GREEN] Modify `getStagedFiles` in `scripts/hooks/lib/staged-validator.js` to throw `Error` on spawn errors or non-zero exit codes [REQ-git-precommit-hook-001]
- [x] 2.3 [REFACTOR] Standardize error message formatting and child process handling in `scripts/hooks/lib/staged-validator.js` [REQ-git-precommit-hook-001]

## Phase 3: Fail-Closed Staged Content Retrieval in getStagedContent

- [x] 3.1 [RED] Update unit tests in `scripts/hooks/lib/staged-validator.test.js` to assert `getStagedContent` throws descriptive `Error` on invalid/empty relative paths, spawn errors, or non-zero exit codes from `git show :<path>` instead of returning `null` [REQ-git-precommit-hook-001]
- [x] 3.2 [GREEN] Modify `getStagedContent` in `scripts/hooks/lib/staged-validator.js` to throw `Error` when relativePath is empty/invalid or `git show` exits non-zero or errors [REQ-git-precommit-hook-001]
- [x] 3.3 [REFACTOR] Streamline POSIX path resolution and buffer constraints in `scripts/hooks/lib/staged-validator.js` [REQ-git-precommit-hook-001]

## Phase 4: Fail-Closed Secret Scanning in pre-commit-hook.js

- [x] 4.1 [RED] Add unit tests in `scripts/hooks/pre-commit-hook.test.js` verifying that when `getStagedContent` throws during secret scanning, `runPreCommit` exits with code 1 and emits the diagnostic banner `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"` [REQ-agent-shield-security-001]
- [x] 4.2 [GREEN] Update `scripts/hooks/pre-commit-hook.js` secret scanning loop to catch errors from `getStagedContent`, emit the diagnostic banner with bypass instructions (`DISABLE_AGENT_SHIELD=true`, `--no-verify`), and abort via `process.exit(1)` [REQ-agent-shield-security-001]
- [x] 4.3 [REFACTOR] Ensure `diffResult` failure in AgentShield and Strict TDD sections of `scripts/hooks/pre-commit-hook.js` consistently halts execution with exit code 1 instead of silent pass or warning continue [REQ-agent-shield-security-001]

## Phase 5: Ephemeral Git Integration Tests

- [x] 5.1 [RED] Add integration tests in `scripts/hooks/lib/staged-validator.integration.test.js` verifying fail-closed behavior (exit 1 with descriptive error) when Git commands fail or staged blobs are unreadable in an ephemeral Git repo [REQ-git-precommit-hook-003, REQ-agent-shield-security-001]
- [x] 5.2 [GREEN] Add integration test in `scripts/hooks/lib/staged-validator.integration.test.js` verifying that staging canonical generator inputs triggers full target generation in ephemeral repo [REQ-git-precommit-hook-001, REQ-git-precommit-hook-003]
- [x] 5.3 [REFACTOR] Clean up ephemeral test helpers, fixture setup, and repo cleanup routines in `scripts/hooks/lib/staged-validator.integration.test.js` [REQ-git-precommit-hook-003]

## Phase 6: Verification & End-to-End Validation

- [x] 6.1 Run unit test suite `node --test scripts/hooks/lib/staged-validator.test.js scripts/hooks/pre-commit-hook.test.js` and verify 100% pass rate [REQ-git-precommit-hook-001, REQ-agent-shield-security-001]
- [x] 6.2 Run integration test suite `node --test scripts/hooks/lib/staged-validator.integration.test.js` and verify ephemeral repo scenarios pass cleanly [REQ-git-precommit-hook-003, REQ-agent-shield-security-001]
- [x] 6.3 Run full project verification `npm test` ensuring all contract lints, unit tests, and integration tests pass without regression [REQ-git-precommit-hook-001, REQ-agent-shield-security-001, REQ-git-precommit-hook-003]
