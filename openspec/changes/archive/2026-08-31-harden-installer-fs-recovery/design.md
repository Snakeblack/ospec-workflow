# Design: Harden Installer Filesystem Recovery

## Technical Approach

Host applications (IDEs, background language servers, file watchers) frequently hold temporary locks on configuration, agent, and hook files during installation, triggering transient operating system errors (`EPERM`, `EACCES`, `EBUSY`). Previous implementations either failed immediately without retrying or failed during rollback because recovery mechanisms used unretried direct filesystem mutations.

This design implements a centralized, resilient filesystem recovery architecture in `scripts/configure/install-engine.js` and applies it across all seven installer targets (`antigravity`, `cursor`, `codex`, `vscode`, `opencode`, `github-copilot`, and repository targets).

Key technical principles:
1. **Centralized Primitive**: Single authoritative retry implementation (`withTransientFsRetries` and `mutateFs`) with bounded attempts (0–5, default 3 retries) and incremental backoff.
2. **Minimal Leaf Mutation Idempotency**: Only atomic leaf filesystem operations (`mkdirSync`, `writeFileSync`, `copyFileSync`, `rmSync`, `rmdirSync`, `chmodSync`, `symlinkSync`, `renameSync`) are wrapped. Merges, parsing, and external processes (`spawnSync`) execute strictly outside retry loops.
3. **Resilient Rollback**: Both `createRollbackJournal` and Codex's `createFilesystemTransaction.rollback()` / `restorePath` apply the retry policy to every individual restoration step, preventing partial rollbacks caused by temporary locks.
4. **Target Identity & Actionable Diagnostics**: Stale file pruning (`pruneStaleFiles`) and mutation failures retain explicit installer target identifiers and attach structured metadata (`code`, `cause`, `target`, `operation`, `path`, `attempts`) with clear remediation advice.
5. **Deterministic Testability**: Injectable `sleep` functions eliminate artificial test delays while verifying exact attempt counts and backoff intervals.

## Architecture Decisions

| Decision Area | Options Considered | Trade-offs | Selected Choice & Rationale |
|---|---|---|---|
| **Retry Primitive** | 1. Centralized helper in `install-engine.js`<br>2. Per-target ad-hoc retry loops<br>3. Global retry on entire installer runs | • Option 2 causes logic drift and inconsistent error reporting.<br>• Option 3 risks repeating non-idempotent operations and external CLI calls. | **Option 1**: Centralize `withTransientFsRetries` / `mutateFs` in `install-engine.js` for atomic leaf operations only. |
| **Rollback Resilience** | 1. Resilient step-by-step rollback in Journal and Codex Transaction<br>2. Ignore errors during rollback<br>3. Directory staging and swap | • Option 2 leaves corrupt/untracked destination files.<br>• Option 3 fails across cross-device filesystem boundaries in user homes. | **Option 1**: Wrap every rollback action in `createRollbackJournal` and `restorePath` with `mutateFs`, surfacing unrestored paths if retries exhaust. |
| **Diagnostics & Target Identity** | 1. Pass `retryOptions` with explicit `target` across all calls including `pruneStaleFiles`<br>2. Infer target from path inspection<br>3. Generic installer error messages | • Option 2 is brittle with custom destination paths.<br>• Option 3 obscures the affected tool for the user. | **Option 1**: Explicitly propagate `retryOptions` (`{ target: "antigravity" | "cursor" | ... }`) down to `pruneStaleFiles` and mutation helpers. |

### Decision: Centralized Leaf Mutation Retry Primitive

**Choice**: Implement `withTransientFsRetries(operation, options)` and `mutateFs(operation, targetPath, action, options)` in `install-engine.js`.
**Alternatives considered**: Ad-hoc `try/catch` retries in each installer target; full installer invocation retries.
**Rationale**: Centralizing ensures consistent handling of `TRANSIENT_FS_CODES = new Set(["EPERM", "EACCES", "EBUSY"])`, uniform backoff calculation (`retryDelay * (attempt + 1)`), bounded retry caps (`Math.min(5, Math.max(0, maxRetries))`), and structured error enrichment.

### Decision: Resilient Rollback in Journals and Codex Transactions

**Choice**: Integrate `mutateFs` with retry options into `createRollbackJournal` and `createFilesystemTransaction.rollback()` (via `restorePath`).
**Alternatives considered**: Best-effort unretried rollback; filesystem directory staging.
**Rationale**: When an installation aborts due to an error, destination files may still be momentarily locked by host processes. Retrying individual restoration and cleanup steps guarantees clean rollback without leaving orphaned artifacts. Persistent failures collect and surface unrestored paths.

### Decision: Target Identity Preservation in Stale File Pruning

**Choice**: Pass `retryOptions` containing `{ target: "<name>", ... }` to `pruneStaleFiles` in `install-antigravity.js`, `install-cursor.js`, and `install-codex.js`. Preserve enriched error properties when re-throwing.
**Alternatives considered**: Generic "installer" error message; path pattern matching.
**Rationale**: Allows users and test harnesses to identify immediately which tool installation failed and which specific file remained locked.

## Data Flow

### 1. Installation Flow with Transient Retry

```
Caller (e.g. install-antigravity / install-codex)
   │
   ├─► Read / Parse JSON / Compute Content (Outside retry loop)
   │
   ├─► mutateFs(operation, path, () => fs.write(...), retryOptions)
   │      │
   │      ├─► Attempt 1 ──► [Success] ──► Return result
   │      │         │
   │      │         └─► [Transient Error: EPERM/EACCES/EBUSY]
   │      │                   │
   │      │                   ├─► attempt < maxRetries ──► sleep(delay * (attempt + 1)) ──► Retry
   │      │                   │
   │      │                   └─► attempt == maxRetries ──► Throw Enriched Error (with target & remedy)
   │      │
   │      └─► [Non-Transient Error: ENOENT/ENOSPC] ──► Throw immediately (No retry)
   │
   └─► Failure triggers Rollback Flow
```

### 2. Resilient Rollback Flow

```
Installation Error Encountered
   │
   ├─► Catch Block invokes journal.rollback() OR fileTransaction.rollback()
   │      │
   │      ├─► For each captured entry (in reverse order):
   │      │      ├─► mutateFs("rollback mkdir / write / remove / chmod", path, action, retryOptions)
   │      │      └─► Collect any exhausted failure into `failures` list
   │      │
   │      └─► For newly created directories:
   │             └─► mutateFs("rollback remove directory", dir, action, retryOptions)
   │
   └─► If failures exist: Surface list of unrestored paths in error diagnostic
```

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/configure/install-engine.js` | Modify | Provide `withTransientFsRetries` and `mutateFs`. Update `createRollbackJournal` and `pruneStaleFiles` to propagate `retryOptions` and rethrow enriched errors cleanly. |
| `scripts/configure/install-codex.js` | Modify | Update `restorePath` and `removePathIfPresent` to wrap all filesystem mutations with `mutateFs(..., { target: "codex", ...retryOptions })`. Propagate `retryOptions` in `createFilesystemTransaction.rollback()`, `pruneStaleFiles`, and export `createFilesystemTransaction`. |
| `scripts/configure/install-antigravity.js` | Modify | Pass `retryOptions` to `pruneStaleFiles` call so target identity is preserved on pruning failures. |
| `scripts/configure/install-cursor.js` | Modify | Pass `retryOptions` to `pruneStaleFiles` call so target identity is preserved on pruning failures. |
| `scripts/configure/install-vscode.js` | Modify | Ensure settings mutations and rollback journal pass `{ target: "vscode" }` retry options. |
| `scripts/configure/install-target.js` | Modify | Ensure repository sync binary copy and rollback pass `{ target: "target" }` retry options. |
| `scripts/configure/install-global-copilot.js` | Modify | Propagate `{ target: "github-copilot" }` in journal and pruning operations. |
| `scripts/configure/install-global-opencode.js` | Modify | Propagate `{ target: "opencode" }` in journal and pruning operations. |
| `scripts/configure/cli.js` | Modify | Re-export `withTransientFsRetries` and `mutateFs` from `install-engine.js`. |
| `scripts/configure/install-engine.test.js` | Modify | Unit tests for transient codes (`EPERM`, `EACCES`, `EBUSY`), bounded backoff, non-transient immediate failure, rollback retry, and pruning error preservation. |
| `scripts/configure/install-codex.test.js` | Modify | Tests for Codex `createFilesystemTransaction.rollback()` and `restorePath` transient recovery across `EPERM`, `EACCES`, and `EBUSY`. |
| `scripts/configure/install-antigravity.test.js` | Modify | Tests verifying target name preservation during stale file pruning exhaustion. |
| `scripts/configure/install-cursor.test.js` | Modify | Tests verifying target name preservation during stale file pruning exhaustion. |
| `openspec/changes/harden-installer-fs-recovery/decisions/adr-001.md` | Create | ADR for centralized transient filesystem retry policy. |
| `openspec/changes/harden-installer-fs-recovery/decisions/adr-002.md` | Create | ADR for resilient rollback in journals and Codex transactions. |
| `openspec/changes/harden-installer-fs-recovery/decisions/adr-003.md` | Create | ADR for target context propagation in pruning and diagnostics. |

## Interfaces / Contracts

### `withTransientFsRetries(operation, options)`

```javascript
/**
 * @param {() => any} operation - Idempotent leaf filesystem operation.
 * @param {Object} [options]
 * @param {string} [options.target="installer"] - Identifier of installer target.
 * @param {string} [options.operation="filesystem mutation"] - Operation name.
 * @param {string} [options.path="unknown path"] - Target file path.
 * @param {number} [options.maxRetries=3] - Max retries (bounded [0, 5]).
 * @param {number} [options.retryDelay=10] - Initial delay in ms.
 * @param {(ms: number) => void} [options.sleep] - Sleep implementation for backoff.
 * @returns {any} Result of operation.
 */
function withTransientFsRetries(operation, options = {})
```

### `mutateFs(operation, targetPath, action, options)`

```javascript
/**
 * Convenience wrapper passing operation and path into withTransientFsRetries.
 */
function mutateFs(operation, targetPath, action, options = {}) {
  return withTransientFsRetries(action, { ...options, operation, path: targetPath });
}
```

### Enriched Error Properties on Exhaustion

When retries exhaust, the thrown `Error` satisfies:
- `error.message`: `"${target}: ${operation} failed for ${path} after ${attempts} attempts (${code}). Close the application or process using this path, then retry the installation."`
- `error.code`: `string` (`"EPERM"` | `"EACCES"` | `"EBUSY"`)
- `error.cause`: `Error` (the original caught filesystem error)
- `error.attempts`: `number` (total attempts executed)
- `error.operation`: `string` (e.g. `"rollback write"`, `"remove stale file"`)
- `error.path`: `string` (target path)
- `error.target`: `string` (e.g. `"antigravity"`, `"cursor"`, `"codex"`)

### `createFilesystemTransaction(fsImpl, retryOptions)` & `restorePath`

```javascript
function restorePath(targetPath, snapshot, fsImpl, retryOptions = {})
function createFilesystemTransaction(fsImpl = fs, retryOptions = {})
```

`createFilesystemTransaction` wraps filesystem writes through a Proxy with `mutateFs`, captures snapshots of pre-existing state, and in `rollback()` delegates to `restorePath(targetPath, snapshot, fsImpl, retryOptions)` ensuring every restore step is retried.

### `pruneStaleFiles(targetRoot, previousManifest, currentFiles, fsImpl, journal, retryOptions)`

```javascript
function pruneStaleFiles(
  targetRoot,
  previousManifest,
  currentFiles,
  fsImpl = fs,
  journal = null,
  retryOptions = {},
)
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| **Unit** (`install-engine.test.js`) | Matrix of transient error codes (`EPERM`, `EACCES`, `EBUSY`). | Simulate transient failures with custom `sleep` spy to verify attempt counts and backoff progression (`[10, 20]`). |
| **Unit** (`install-engine.test.js`) | Permanent errors (`ENOENT`, `ENOSPC`, syntax errors) fail immediately. | Verify zero retries, no sleep calls, and preservation of original error instance. |
| **Unit** (`install-engine.test.js`) | Exhaustion enrichment. | Check `code`, `cause`, `attempts`, `target`, `path`, and message advice on max retry breach. |
| **Unit** (`install-engine.test.js`) | Rollback journal transient retry. | Proxy filesystem throwing `EBUSY` on first rollback write and ensure recovery succeeds. |
| **Unit** (`install-codex.test.js`) | Codex transaction rollback resilience. | Trigger `createFilesystemTransaction.rollback()` under transient `EPERM`, `EACCES`, and `EBUSY` locks across file, mode, and directory restorations. |
| **Unit** (`install-antigravity.test.js` & `install-cursor.test.js`) | Target identity preservation during pruning exhaustion. | Simulate persistent lock during `pruneStaleFiles` and assert thrown error identifies `antigravity` or `cursor`. |
| **Integration** (`npm test`) | Full test suite across all 20 test files. | Execute complete test suite ensuring no regressions across target builds, validations, or configurations. |

## Migration / Rollout

No migration or configuration schema upgrade required. Changes are internal to the installer scripts in `scripts/configure/` and are fully backward-compatible with existing configuration manifests and host environments.

## Open Questions

None. All technical decisions are fully specified and aligned with proposal and spec requirements.
