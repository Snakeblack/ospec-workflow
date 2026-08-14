# Design: Installation Engine Surgical Refinement

## Architecture Decisions

### 1. Codex Skills Ownership Manifest
In `install-codex.js`, maintain an independent ownership manifest at `path.join(globalSkillsRoot, ".ospec-workflow-codex-install.json")`. Collect all skill files from `outDir/skills` recursively (e.g. `sdd-apply/SKILL.md`), run `pruneStaleFiles(globalSkillsRoot, previousSkillsManifest, currentSkillFiles, writeFs)`, copy skills via `syncCodexSkills()`, and write the skills manifest. This gives exact two-version convergence for skills without breaking single-root safety checks.

### 2. State-Machine JSONC Scanner
In `install-engine.js`, implement `stripJsoncComments(content)` using a character-by-character scanner that tracks:
- Inside double-quoted strings (handling escape sequences `\"` and `\\`)
- Single-line comments (`// ... \n`)
- Multi-line block comments (`/* ... */`)
- Trailing commas before `}` or `]`
This avoids external runtime dependencies while strictly avoiding false comment matches inside string literals like `"url": "https://example.com"`.

### 3. VS Code Scalar Value Handling & Directory Creation
In `install-vscode.js`:
- Check for `"chat.pluginLocations"\s*:\s*"([^"]*)"` or scalar value. If found, replace the scalar property with an array containing the previous scalar value and the new plugin path.
- In `main()`: check if `path.dirname(file.path)` exists. If the directory exists but `settings.json` is absent, initialize `settings.json`. If none of the candidate VS Code settings directories exist, exit with code 1.

### 4. Build Hooks Exit Status
In `package.json`, update `"build:hooks"` to:
`"node -e \"const res = require('./scripts/configure/install-target.js').ensureRuntimeBinary(process.cwd()); if (!res) process.exit(1);\""`

### 5. Spec Alignment
Update `openspec/specs/install/spec.md`:
- Replace `~/.config/github-copilot/` with `~/.copilot/`.
- Replace `install:copilot` with `install:global:copilot` and `setup:copilot`.
