# Proposal: Installation Engine Convergence and Hardening

## Intent

Harden the multi-target installation engine and resolve remaining convergence, self-containment, and security gaps identified in post-v2.44.0 audit:
1. Fix `destRel` omission in `install-global-opencode.js` and `install-global-copilot.js` so subfolder remappings (`agents/`, `commands/`, `skills/`) register proper relative paths in `.ospec-workflow-install.json`.
2. Make `pruneStaleFiles()` fail-closed on permissions, path safety violations, or I/O errors (ignoring only legitimate `ENOENT`).
3. Integrate Codex and VS Code into the unified ownership engine (`.ospec-workflow-install.json`, stale pruning, fail-closed config parsing).
4. Implement safe JSONC updating in `install-engine.js` (or preserving comments/formatting non-destructively) and ensure failed config parsing aborts with non-zero exit code.
5. Provide automatic runtime Go binary compilation (`ensureRuntimeBinary` / `npm run build:hooks`) during `npm run setup:*` so fresh clones are fully self-sufficient.
6. Resolve `${input:...}` placeholders in Cursor MCP configuration to avoid leaking unexpanded VS Code template variables into `~/.cursor/mcp.json`.
7. Update `openspec/specs/install/spec.md` baseline to fully document all 7 global targets, their setup scripts, and convergence guarantees.
8. Add end-to-end integration tests simulating two-version upgrade cycles with user files and stale artifact pruning.

## Scope

- Files:
  - `scripts/configure/install-engine.js` & `install-engine.test.js`
  - `scripts/configure/install-global-opencode.js` & `install-global-opencode.test.js`
  - `scripts/configure/install-global-copilot.js` & `install-global-copilot.test.js`
  - `scripts/configure/install-codex.js` & `install-codex.test.js`
  - `scripts/configure/install-vscode.js` & `install-vscode.test.js`
  - `scripts/configure/install-cursor.js` & `install-cursor.test.js`
  - `scripts/configure/install-target.js`
  - `package.json`
  - `openspec/specs/install/spec.md`
  - `tests/integration/installation-convergence.test.js`

## Capabilities & Impact

- Guaranteed multi-version convergence across all 7 targets.
- True zero-write fail-closed guarantees on corrupted user configs.
- Self-contained fresh-clone setup when Go is installed on the host.
- Preservation of user-authored custom agents, skills, and configuration comments.

## Risks & Mitigations

- **Risk**: Automated `go build` during setup fails if Go is absent.
  - *Mitigation*: Fall back to existing pre-built binary if available in `release/dist/`, or give an actionable error only when `required: true` and compilation is impossible.
- **Risk**: JSONC comment preservation complexity.
  - *Mitigation*: Use lightweight range-based property insertion or regex-aware injection for `chat.pluginLocations` array rather than JSON serialization.
