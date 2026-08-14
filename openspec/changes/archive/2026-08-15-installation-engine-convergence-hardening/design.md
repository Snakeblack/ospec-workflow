# Design: Installation Engine Convergence and Hardening

## Architecture Decisions

### 1. `destRel` Forwarding in Subfolder Remappings
In `install-global-opencode.js` and `install-global-copilot.js`, calls to `syncTargetTree` will pass `remap.destRel` as `relPrefix` to ensure all entries in `result.ownedFiles` are properly prefixed (e.g. `agents/sdd-apply.md`, `skills/context7-mcp/SKILL.md`).

### 2. Fail-Closed Stale Pruning
`pruneStaleFiles` in `install-engine.js` will catch errors during `assertPathSafe` or `fsImpl.rmSync` and re-throw immediately if `error.code !== "ENOENT"`.

### 3. Codex Ownership Integration
`install-codex.js` will read/write `.ospec-workflow-install.json` in global Codex directory (`~/.codex/`), record all installed agent TOMLs, skills, schemas, and runtime scripts, and invoke `pruneStaleFiles()` during setup.

### 4. Non-Destructive VS Code JSONC Updating
Implement `updateVsCodeSettingsJsonc(content, newLocation)` using token-aware or comment-preserving string insertion for `chat.pluginLocations` array, and fail-closed if JSONC cannot be parsed safely.

### 5. Automated Go Binary Provisioning
Create `ensureRuntimeBinary(sourceDir, deps)` in `scripts/configure/install-target.js` that checks for the platform binary in `release/dist/`. If absent and `go` is on PATH, it spawns `go build -o <binaryPath> ./cmd/ospec-hooks`. Add `build:hooks` and `ensure:hooks` to `package.json`.

### 6. Cursor MCP Placeholder Sanitization
In `install-cursor.js`, transform `.mcp.json` environment variables: if an `env` value matches `${input:VAR}`, look up `process.env[VAR]`. If set, use the value; if unset, omit the environment key rather than leaking `${input:...}` syntax.

### 7. Baseline Spec Alignment
Update `openspec/specs/install/spec.md` with complete documentation for all 7 targets and setup workflows.
