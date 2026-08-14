# Proposal: Installation Engine Surgical Refinement

## Intent

Surgically resolve the remaining edge-cases and consistency gaps in the multi-target installation engine:
1. **Codex Skills Convergence**: Implement ownership manifest tracking and stale file pruning under `~/.agents/skills/` (`.ospec-workflow-codex-install.json`) so removed skills are pruned on upgrade while user-created custom skills are preserved.
2. **Robust JSONC State-Machine Scanner**: Replace naive regex stripping with a robust character-by-character scanner in `install-engine.js` that correctly preserves string literals containing `//` or `/* ... */`, handles trailing commas, and provides robust JSONC parsing without external runtime dependencies.
3. **VS Code Scalar Property Handling & Directory Detection**: Support converting scalar `"chat.pluginLocations": "string"` into arrays without key duplication in `updateSettingsJsoncPreservingComments`, auto-create `settings.json` if the user settings directory exists, and exit with non-zero code if no VS Code installation is found.
4. **Hooks Build Exit Code**: Ensure `npm run build:hooks` exits with code 1 if `ensureRuntimeBinary()` fails or returns `null`.
5. **Spec & Path Alignment**: Update `openspec/specs/install/spec.md` to reference `~/.copilot/` and accurate npm script commands (`install:global:copilot`, `setup:copilot`).
6. **Complete Edge-Case Test Matrix**: Add regression tests covering all edge cases (Codex skill pruning, JSONC string literals with slashes, scalar VS Code location conversion, missing binary failure).

## Scope

- Files:
  - `scripts/configure/install-engine.js` & `install-engine.test.js`
  - `scripts/configure/install-codex.js` & `install-codex.test.js`
  - `scripts/configure/install-vscode.js` & `install-vscode.test.js`
  - `scripts/configure/install-target.js` & `install-target.test.js`
  - `package.json`
  - `openspec/specs/install/spec.md`
  - `tests/integration/installation-convergence.test.js`

## Capabilities & Impact

- 100% convergence across both agent and skill directories in Codex.
- Safe JSONC parsing and modification that never misidentifies URLs or string values as comments.
- Reliable VS Code installation that never creates duplicate keys or produces false success.
- Accurate OpenSpec documentation aligned byte-for-byte with the codebase.
