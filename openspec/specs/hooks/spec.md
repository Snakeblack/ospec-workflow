# Spec: hooks

## Domain
Runtime lifecycle event hooks — registration, dispatch, and per-event handler behaviour.

## Scope
Five Claude lifecycle hooks are registered in `hooks/hooks.json` and implemented in
`scripts/hooks/`. Each hook runs as a standalone Node.js 22+ CommonJS script invoked
by the Claude host process. Hooks read a JSON payload from stdin and write a JSON
response to stdout. Support logic lives in `scripts/lib/ospec-state.js` and
`scripts/lib/artifact-store.js`.

---

## 1. Hook Registration

### 1.1 Registration file
`hooks/hooks.json` is the single source of truth for hook binding. It MUST list all
five lifecycle events under the top-level `hooks` key.

### 1.2 Registered events and scripts

| Event | Script | Timeout |
|---|---|---|
| `SessionStart` | `scripts/hooks/session-start.js` | none |
| `PreToolUse` | `scripts/hooks/pre-tool-use.js` | 5 s |
| `PreCompact` | `scripts/hooks/pre-compact.js` | 5 s |
| `SubagentStop` | `scripts/hooks/subagent-stop.js` | 5 s |
| `Stop` | `scripts/hooks/stop.js` | 5 s |

All entries are of type `"command"`. The host resolves the plugin root via the
`CLAUDE_PLUGIN_ROOT` environment variable, so the command template is
`node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<name>.js"`.

### 1.3 Stdin / stdout contract
Every hook MUST:
- Read its input payload as UTF-8 JSON from stdin (empty stdin resolves to `{}`).
- Write exactly one UTF-8 JSON line to stdout before exiting.
- Never crash silently; errors MUST produce a valid JSON stdout line.

---

## 1.4 Domain Drift Detection Helper

`scripts/lib/ospec-state.js` MUST expose a domain-drift helper that, given a baseline domain's recorded manifest commit hash (from `openspec/specs/_baseline/manifest.md`'s Entries table) and that domain's source globs (from the manifest Domain Map), determines whether the domain has drifted since that hash.

The helper MUST:
- Compare `git diff --name-only <hash>..HEAD`, filtered by the domain's source globs; a non-empty filtered result means the domain is drifted.
- Resolve each domain's source globs by parsing the existing `sources: ...` list already present in that domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (format: `- {domain}: {description} | sources: {glob1}, {glob2}, ...`) — split on `,` after the `sources:` marker, trim whitespace per entry. No new manifest field or schema change is required; all 7 recorded domains already carry this list.
- Exclude a domain from the drifted result when any currently active (non-terminal) OpenSpec change's declared scope already covers that domain — an active change already tracks it.
- Run all git probes inside a single shared timeout budget, mirroring the 5 s deadline pattern used by `resolveGitState` in `scripts/hooks/lib/git-state.js`.
- Fail-safe on any git failure (missing hash, empty repo, detached HEAD, missing git binary, non-zero exit): return "no drift data" for the affected domain rather than throwing. Callers (SessionStart, PreToolUse) MUST NOT crash or block on this failure.

### Scenarios

- **Domain has in-scope changes since hash — drifted**: GIVEN domain `hooks` was last recorded at commit `59fbfe8` AND `git diff --name-only 59fbfe8..HEAD` includes a file matching the `hooks` domain's source globs WHEN the drift helper evaluates `hooks` THEN it MUST report `hooks` as drifted
- **Domain has only out-of-scope changes — not drifted**: GIVEN `git diff --name-only <hash>..HEAD` returns files, none of which match the domain's source globs WHEN the drift helper evaluates the domain THEN it MUST report the domain as NOT drifted
- **Drift covered by an active change's declared scope — suppressed**: GIVEN a domain has in-scope changes since its recorded hash AND an active (non-terminal) OpenSpec change's declared file scope already covers that domain WHEN the drift helper evaluates the domain THEN it MUST NOT report the domain as drifted
- **git failure — fail-safe, no throw**: GIVEN the recorded hash no longer exists in history, OR git is not installed, OR the repository is empty/detached WHEN the drift helper evaluates any domain THEN it MUST return "no drift data" for that domain and MUST NOT throw or abort the calling hook
- **Source globs resolved from the existing manifest Domain Map — no new field required**: GIVEN `openspec/specs/_baseline/manifest.md`'s Domain Map already lists `sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js, scripts/lib/artifact-store.js, scripts/lib/workspace-atlas.js` for the `hooks` domain WHEN the drift helper resolves source globs for `hooks` THEN it MUST parse that existing `sources:` list (split on `,`, trimmed) as the domain's glob set AND it MUST NOT require any additional manifest field, file, or explicit glob-mapping to be introduced

---

## 1.5 ADDED Requirements

### Requirement: SubagentStop Per-Dispatch Phase Cost Recording {#REQ-hooks-001}

`SubagentStop` (JS and Go, byte-for-byte parity) MUST append one estimated-cost record
per dispatch to `.ospec/session/{change}/phase-costs.jsonl`, a sibling artifact of the
existing `.ospec/session/{change}/token-events.jsonl` written by the Token Budget
Advisor. This step MUST run after the existing Result Envelope Parse/Validate/Persist
step (baseline §5.0) and MUST NOT alter its outcome.

The hook MUST:
1. Resolve the active change using the same `findActiveChanges` selection logic already
   used elsewhere in this hook (baseline §5.0, §4.2). If no active change resolves, the
   hook MUST skip this step entirely and MUST NOT create `.ospec/session/` paths.
2. Estimate a token count for the dispatch's result payload by reusing the existing
   `estimateTokens` heuristic (`scripts/hooks/pre-tool-use.js`, ~4 characters per
   token) — no new estimation algorithm is introduced.
3. Derive the phase key by stripping the `sdd-` prefix from the resolved agent name
   (baseline §5.0 extraction), mirroring the phase-key resolution already used for
   `state.yaml` summary persistence.
4. Append one JSON line with at least the fields `phase`, `agent`, `est_tokens`,
   `status` (the dispatch's resolved `status` when available, else `"unknown"`), and
   `ts` (ISO 8601 UTC), to `.ospec/session/{change}/phase-costs.jsonl` under the same
   advisory file-lock convention already used for `.ospec/runtime/subagent-events.jsonl`
   (baseline §5.3).
5. `.ospec/session/{change}/phase-costs.jsonl` joins the on-disk artifact layout
   (baseline §7) as an additional row: owner `SubagentStop`, write mode `Append
   (advisory lock)`.

This step MUST be strictly additive and fail-safe, mirroring the existing envelope-
persistence step (baseline §5.0): any error in change resolution, token estimation, or
the file append MUST be caught, MUST NOT affect `stdout` or the hook's `continue: true`
output, and MUST NOT throw or exit non-zero.

#### Scenario: Dispatch cost recorded for an active change

- GIVEN a subagent result payload resolves to agent `sdd-design` with `status: success`
- AND an active change `add-x` exists in the workspace
- WHEN `SubagentStop` runs after the envelope-persistence step
- THEN it appends one JSON line to `.ospec/session/add-x/phase-costs.jsonl` with
  `phase: "design"`, an `est_tokens` estimate, `status: "success"`, and a `ts` timestamp
- AND the hook's existing `skill_resolution` behavior (§5.1-§5.4) and stdout output are
  unaffected

#### Scenario: No active change — skip, no file created

- GIVEN no active OpenSpec change resolves in the workspace
- WHEN `SubagentStop` runs
- THEN it MUST NOT create `.ospec/session/` or write any `phase-costs.jsonl` file
- AND processing continues unchanged to the existing `skill_resolution` behavior

#### Scenario: Estimation or write failure — fail-safe, no crash

- GIVEN the token-estimation heuristic or the JSONL append throws (e.g. a filesystem
  error)
- WHEN `SubagentStop` attempts to persist the phase-cost record
- THEN the hook MUST catch the error, MUST NOT propagate it, MUST NOT set a non-zero
  exit code, and MUST still output `{"continue":true}` (or the existing degraded
  `systemMessage`) exactly as before this change

---

### Requirement: Codex hooks registration format and command translation {#REQ-hooks-003}

When generating the codex target, the generator MUST emit `hooks/hooks.json` mapping
all 5 lifecycle events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`,
`Stop`) to type `"command"` with the command string replacing `${CLAUDE_PLUGIN_ROOT}`
with `$PLUGIN_ROOT` (e.g., `node "$PLUGIN_ROOT/scripts/hooks/<name>.js"`).

#### Scenario: Happy path: Codex hooks are generated matching PascalCase events and variable rewrites

- GIVEN the codex target generation is triggered
- WHEN the hooks configuration is generated
- THEN the output file `hooks/hooks.json` MUST contain all 5 lifecycle events
- AND each command string MUST have `${CLAUDE_PLUGIN_ROOT}` replaced with `$PLUGIN_ROOT`

#### Scenario: Go hooks runtime execution: The Go wrapper accepts Codex stdio payload shape and maps it safely

- GIVEN the Go hooks wrapper receives a Codex stdio payload containing standard fields
  (e.g., `session_id`, `cwd`, `transcript_path`, `tool_name`, `tool_input`)
- WHEN the wrapper is invoked for a Codex target lifecycle event
- THEN it MUST parse the payload successfully and pass it safely to the underlying hook script
- AND the wrapper MUST output a valid JSON response to stdout without blocking or crashing

### Requirement: Codex Wrapper Matcher and Hooks Generation With Cross-Platform Adapter {#REQ-hooks-004}

The generator MUST emit, for the `codex` target's published payload, a wrapper `matcher`
+ `hooks` structure in `hooks/hooks.json` covering exactly the five current Codex hook
events (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop` — see hooks
Requirement REQ-hooks-003 for the base event/command-translation mapping). The wrapper
MUST include a POSIX/Windows adapter so the same generated command string resolves and
executes correctly under `sh`/`bash` and under `cmd.exe`/PowerShell, and MUST propagate
the `PLUGIN_DATA` variable (the Codex analogue of `CLAUDE_PLUGIN_ROOT`-resolved payload
data) to each invoked hook script without loss or corruption. No event beyond the five
listed MUST be added by this requirement.

#### Scenario: Wrapper matcher generated for all five Codex events

- GIVEN the codex target payload is generated
- WHEN `hooks/hooks.json` is produced
- THEN each of the five events MUST carry a wrapper entry with a `matcher` and a
  `hooks` array, and no additional (sixth) event MUST be present

#### Scenario: POSIX adapter resolves and runs the wrapper

- GIVEN the generated wrapper command is invoked under a POSIX shell (`sh`/`bash`)
- WHEN the hook fires
- THEN the wrapper MUST resolve the script path and execute it without a shell-quoting
  or path-separator failure

#### Scenario: Windows adapter resolves and runs the wrapper

- GIVEN the generated wrapper command is invoked under `cmd.exe` or PowerShell
- WHEN the hook fires
- THEN the wrapper MUST resolve the script path (backslash-safe) and execute it without
  a shell-quoting or path-separator failure

#### Scenario: PLUGIN_DATA propagated intact

- GIVEN the Codex host sets `PLUGIN_DATA` before invoking a wrapped hook
- WHEN the wrapper launches the underlying hook script
- THEN the script MUST receive `PLUGIN_DATA` unmodified (no truncation, re-encoding, or
  loss of the value)

### Requirement: Codex PreToolUse Deny/Allow/Advisory Without ASK {#REQ-hooks-005}

On the `codex` target, `PreToolUse` MUST resolve every decision to exactly `deny` or
`allow`; the `ask` permission decision (baseline §3.1, §3.4) is unsupported by the
Codex host and MUST NOT be emitted. Every baseline `ask`-producing branch (AgentShield
Step 2 advisory class, Token Budget Advisor Steps 3-4, Git Collaboration Guard Step 5b,
Spec Drift Advisory Step 5c, and the ASK rule table Step 6) MUST degrade to `allow` with
the original advisory text surfaced via `systemMessage` (mirroring the existing
`bypassPermissions` degradation defined in §3.4.1), rather than being omitted. DENY
(Step 5, AgentShield deny-class) MUST remain undegraded, exactly as on other targets.

#### Scenario: ASK-class rule degrades to allow with advisory

- GIVEN a command matches an ASK-class rule (e.g. dependency installation) on the codex
  target
- WHEN `PreToolUse` evaluates the call
- THEN it MUST return `allow` with the advisory text present in `systemMessage`, and
  MUST NOT return `ask`

#### Scenario: DENY still blocks on codex

- GIVEN a command matches a DENY rule (Step 5)
- WHEN `PreToolUse` evaluates the call on the codex target
- THEN it MUST return `deny`, unaffected by the ASK-removal degradation

### Requirement: Codex SubagentStop Reads agent_transcript_path {#REQ-hooks-006}

On the `codex` target, `SubagentStop`'s existing skill-resolution extraction (baseline
§5.2) MUST additionally accept `input.agent_transcript_path` as a source for the
transcript-file fallback step, in place of (or alongside) `input.transcript_path`, since
the Codex host names this field differently. Resolution priority and JSONL-parsing
behavior (§5.2 step 3) are otherwise unchanged.

#### Scenario: Codex transcript field resolves skill_resolution

- GIVEN the subagent result payload has no direct `skill_resolution` field and no
  matching known result field, but `input.agent_transcript_path` points to a valid
  transcript JSONL file
- WHEN `SubagentStop` runs on the codex target
- THEN it MUST read and parse that file using the existing §5.2 step-3 logic

### Requirement: Codex SessionStart Context Contract {#REQ-hooks-007}

On the `codex` target, `SessionStart` MUST return the same response contract already
defined for other targets (baseline §2.1: `status`, `ospecDetected`, `registry`, and,
when applicable, `baseline.hint`, `security`, `gitCollaboration`, `specDrift`), unmodified
by target. This requirement fixes the observable contract as target-independent; it does
not introduce a codex-specific response shape.

#### Scenario: SessionStart on codex returns the standard contract

- GIVEN openspec is detected in the workspace
- WHEN `SessionStart` runs via the codex wrapper
- THEN the response MUST contain `status`, `ospecDetected: true`, and `registry`, using
  the same field names and semantics as the claude/vscode/opencode targets

## Test Contracts (Non-Normative Coverage Note)

Fixtures for REQ-hooks-005..007 MUST assert against the published codex payload (not a
hand-authored fixture), consistent with the Go/JS parity fixture pattern (baseline §8a).

---

## 2. SessionStart

**Trigger**: Claude session initialization, before any agent turn.

**Source**: `scripts/hooks/session-start.js`

### 2.1 Behaviour

Given a Claude session starts in a workspace directory,
When the hook runs,
Then it MUST:

1. Resolve the workspace from `input.cwd` if supplied; otherwise use `process.cwd()`.
2. Create an `ArtifactStore` from `openspec/config.yaml` (detecting `openspec` or
   `workspace-federated` backend).
3. Check whether openspec is initialized:
   - **openspec mode**: `openspec/config.yaml` exists.
   - **workspace-federated mode**: `openspec/workspace.yaml` exists and has at least
     one member.

Given openspec is NOT detected,
When the hook runs,
Then it MUST return:
```json
{
  "status": "ok",
  "ospecDetected": false,
  "registry": { "status": "skipped", "path": ".ospec/cache/skill-registry.cache.json" }
}
```
and MUST NOT write any file under `.ospec/`.

Given openspec IS detected,
When the hook runs,
Then it MUST:

1. Read `openspec/config.yaml` and extract the `baseline` block via `readBaselineState`.
   Errors reading baseline MUST be swallowed; a failure here MUST NOT abort session start.
2. Compute a baseline hint (see §2.2) and attach it to the result if non-null.
3. Discover all skills from the plugin root (`skills/**/*.md`, `rules/**/*.md`) using
   `discoverSkills`.
4. Compute a SHA-256 fingerprint over the fingerprint paths from step 3.
5. Read the existing cache at `.ospec/cache/skill-registry.cache.json`.
6. If the cache exists, has `version === 2`, and its `fingerprint` matches the computed
   value: report `status: "reused"` and MUST NOT rewrite the cache.
7. If the cache is absent or stale: write a new cache object (see §2.3) and report
   `status: "generated"`.
8. For `workspace-federated` mode: federate the workspace shape (members + contracts,
   sorted by `id`) into the `cache.workspace` field.
9. **AGENT SHIELD SECURITY CHECK**:
   Si la variable de entorno `DISABLE_AGENT_SHIELD=true` no está activa, el hook MUST escanear el espacio de trabajo en busca de riesgos de seguridad y adjuntar los resultados en la propiedad `security` de la respuesta JSON:
   - Verificar si archivos como `.env`, `.env.local` y `.npmrc` existen y no están incluidos en `.gitignore`.
   - Verificar si el archivo `.git/config` contiene credenciales incrustadas (patrón `https://[^:]+:[^@]+@`).
10. Return:
    ```json
    {
      "status": "ok",
      "ospecDetected": true,
      "registry": { "status": "generated|reused", "path": ".ospec/cache/skill-registry.cache.json" },
      "security": {
        "status": "warning" | "ok",
        "alerts": [
          {
            "type": "unignored-env-file" | "embedded-credentials",
            "file": ".env" | ".git/config",
            "reason": "El archivo sensible no está ignorado en Git" | "El archivo contiene credenciales en texto plano"
          }
        ]
      }
    }
    ```
    (plus `"baseline": { "hint": "..." }` when a hint is present, and `"systemMessage": "..."` containing warnings when `security.status === "warning"`).

### 2.1a Git Collaboration Advisory

After the security check (Step 9 above), the hook MUST run a git collaboration check when openspec is detected. The check evaluates TWO independent conditions: (1) whether the current branch equals the default branch, and (2) whether the working tree is dirty (`git status --porcelain` returns non-empty output). When at least one condition holds, the hook MUST include a `gitCollaboration` entry in the response JSON.

The check MUST be guarded by `DISABLE_GIT_COLLABORATION_GUARD !== "true"`; when the bypass is active, the entire check is skipped (no `gitCollaboration` key, no change to `systemMessage`).

**Response schema** (`status: "warning"` when at least one condition holds, omitted entirely when both are absent):

```json
{
  "gitCollaboration": {
    "status": "warning",
    "currentBranch": "<name>",
    "defaultBranch": "<name>",
    "dirtyTree": true,
    "message": "<human-readable advisory>"
  }
}
```

Field rules:
- `currentBranch`: always the resolved current branch name; `null` if unresolvable.
- `defaultBranch`: always the resolved default branch name; `null` if unresolvable.
- `dirtyTree`: `true` when `git status --porcelain` is non-empty; `false` when clean; **omitted if `git status` fails** (never falsely reported clean).
- `message`: content follows the same rules as the PreToolUse advisory (single message, combined if both conditions).

The advisory MUST also be appended to the existing `systemMessage` string (newline-separated) so the Claude host surfaces it to the user at session start.

When git is unavailable or any git command fails, the affected condition MUST be silently skipped; the remaining check MUST still run. The rest of SessionStart behavior (registry cache, baseline hint, security) MUST be unaffected.

#### Scenarios

- **Session on default branch, clean tree — default-branch advisory**: Given `origin/HEAD → refs/remotes/origin/main`, current branch `main`, clean working tree, When SessionStart runs, Then the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: false` AND `systemMessage` MUST mention "default branch" and "feature branch".
- **Session on feature branch, dirty tree — dirty-tree advisory**: Given current branch is `feat/my-feature` AND `git status --porcelain` returns non-empty output, When SessionStart runs, Then the response MUST include `gitCollaboration.status: "warning"` with `dirtyTree: true` AND `systemMessage` MUST mention "uncommitted changes".
- **Session on default branch AND dirty tree — combined advisory**: Given current branch is `main` (default) AND working tree is dirty, When SessionStart runs, Then the response MUST include exactly one `gitCollaboration` entry with `dirtyTree: true` AND `message` MUST mention both "default branch" and "uncommitted changes".
- **Session on feature branch, clean tree — no advisory**: Given current branch is `feat/my-feature` AND working tree is clean, When SessionStart runs, Then the response MUST NOT contain a `gitCollaboration` key AND `systemMessage` MUST NOT include any collaboration advisory text.
- **Bypass active — advisory suppressed**: Given `DISABLE_GIT_COLLABORATION_GUARD=true`, When SessionStart runs regardless of branch or working tree state, Then no `gitCollaboration` key is present in the response AND `systemMessage` is unaffected by this guard.
- **git unavailable — advisory silently omitted**: Given git is not installed or not on PATH, When SessionStart runs, Then the entire collaboration check is silently skipped AND registry cache, baseline hint, and security check behavior MUST be unaffected.
- **git status fails, branch check succeeds — partial advisory**: Given `git branch --show-current` returns `main` (= default branch) AND `git status --porcelain` exits non-zero, When SessionStart runs, Then the `gitCollaboration` entry MUST reflect the default-branch condition AND the `dirtyTree` field MUST be omitted (not falsely reported as clean).

### 2.1b Spec Drift Summary

The `SessionStart` hook MUST run the domain-drift check during its initialization sequence, after the git collaboration advisory, when openspec is detected AND `DISABLE_SPEC_DRIFT_GUARD !== "true"`. It evaluates every domain in `baseline.domains_done` that has a recorded manifest hash.

When one or more domains are drifted, the hook MUST include a `specDrift` entry in the response JSON:

```json
{
  "specDrift": {
    "status": "warning",
    "domains": [
      { "domain": "hooks", "sinceCommit": "59fbfe8", "message": "<human-readable advisory>" }
    ]
  }
}
```

and MUST append a human-readable summary line (naming the drifted domains) to `systemMessage`.

When NO domain is drifted, OR `DISABLE_SPEC_DRIFT_GUARD=true`, OR openspec is not initialized: `specDrift` MUST be entirely absent from the response (never an empty object or empty `domains` array) — mirroring the omission pattern already used by `baseline.hint` and `capabilities`.

#### Scenarios

- **Domains drifted — summary present**: GIVEN two domains report drifted from the domain-drift helper AND `DISABLE_SPEC_DRIFT_GUARD` is unset WHEN SessionStart runs THEN the response MUST include `specDrift.status: "warning"` listing both domains AND `systemMessage` MUST include a line naming both domains
- **No domain drifted — field omitted**: GIVEN the domain-drift helper reports zero drifted domains WHEN SessionStart runs THEN the response MUST NOT contain a `specDrift` key at all
- **Guard disabled — field omitted regardless of drift**: GIVEN `DISABLE_SPEC_DRIFT_GUARD=true` AND at least one domain would otherwise report drifted WHEN SessionStart runs THEN no `specDrift` key is present in the response AND no drift computation side effects (no file writes) occur
- **openspec not initialized — no drift check runs**: GIVEN `openspec/config.yaml` is absent WHEN SessionStart runs THEN the existing early-return path applies (§2.1) and the drift check MUST NOT run

### 2.2 Baseline hint logic

| `baseline.status` | `stale_domains` | Hint produced |
|---|---|---|
| `"pending"` | any | "Baseline not started. Run /sdd-baseline to seed openspec/specs/." |
| `"partial"` | any | "Baseline partial: N domain(s) pending. Run /sdd-baseline to resume." |
| `"done"` | non-empty | "Baseline done but N domain(s) stale: {list}. Run /sdd-baseline refresh to update." |
| `"done"` | empty | `null` — key omitted from result |
| config has no `baseline` block | — | `null` — key omitted from result |

### 2.3 Registry cache schema (v2)

```json
{
  "version": 2,
  "fingerprint": "sha256:<64 hex chars>",
  "generated_at": "<ISO 8601 UTC>",
  "skills": [
    {
      "id": "<skill-name>",
      "path": "skills/<name>/SKILL.md",
      "triggers": ["<trigger word>", "..."],
      "compact_rules": ["<rule text>", "..."]
    }
  ],
  "workspace": { "members": [...], "contracts": [...] }
}
```

The `workspace` key is present only in `workspace-federated` mode. In `openspec` mode it
MUST be absent.

### 2.4 Error handling
On any unhandled error the hook MUST write `{"status":"error","message":"<msg>"}` to
stdout and set `process.exitCode = 1`.

---

## 3. PreToolUse

**Trigger**: before every tool call Claude attempts to make.

**Source**: `scripts/hooks/pre-tool-use.js`

### 3.1 Behaviour

Given a tool call is about to execute,
When the hook receives `{tool_name, tool_input}`,
Then it MUST evaluate the call and return:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "<human-readable string>"
  }
}
```

(Previously: Evaluaba los comandos de terminal en busca de reglas de DENY y ASK. Ahora incorpora además las validaciones de límites de tokens del Token Budget Advisor).

### 3.2 Command extraction

The hook MUST extract candidate commands from `tool_input` as follows:
- If `tool_input.command` is a string: treat it as one command.
- If `tool_input.commands` is an array: treat each element that is a string or has a
  `.command` string property as a command.
- Null, undefined, non-array, and non-string elements are silently skipped.

If no commands are extracted (regardless of whether the tool is a shell tool): return
`allow` (a menos que se disparen las alertas de lectura pesada de archivos descritas en §3.6).

### 3.3 Shell tool recognition

A tool is considered a shell tool when its normalized name (non-alphanumeric chars
stripped, lower-cased) matches any of:
`runcommand`, `runinterminal`, `runterminalcommand`, `shell`, `shellcommand`, `terminal`.

Shell tool status does NOT change the allow/deny/ask outcome — it is used only for
diagnostic context in log messages. Command inspection applies to all tool types.

### 3.4 Decision rules

Evaluation MUST proceed in this order; the first match wins:

**Step 1 — BYPASS (Bypasses de Advisors).**
- Si la variable de entorno `DISABLE_TOKEN_ADVISOR=true` está activa: se omiten los Pasos 3 y 4 del Advisor de Tokens.
- Si la variable de entorno `DISABLE_AGENT_SHIELD=true` está activa: se omiten las validaciones de AgentShield descritas en el Paso 2.
- Si la variable de entorno `DISABLE_GIT_COLLABORATION_GUARD=true` está activa: se omite el Paso 5b (Git Collaboration Guard).
- Si la variable de entorno `DISABLE_SPEC_DRIFT_GUARD=true` está activa: se omite el Paso 5c (Spec Drift Advisory).

**Step 2 — AGENT SHIELD SECURITY (Protección contra Fuga de Secretos).**
Si el agente intenta leer un archivo (herramientas como `view_file` o lectura de URLs/recursos) y el archivo solicitado es sensible:
- Si es una clave privada SSH (`id_rsa`, `id_ecdsa`, `id_ed25519`), `.git/config` o `.npmrc`, retornar `deny` con la razón: *"Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente."*
- Si es `.env`, `.env.*`, `secrets.json`, `credentials` o archivos que contienen secretos detectados heurísticamente (como contraseñas fuertes o tokens de API usando expresiones regulares) en archivos de texto de tamaño inferior a 1MB, retornar `ask` con la razón: *"Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?"*

**Step 3 — TOKEN BUDGET ADVISOR (Lectura Pesada).**
Si la herramienta lee archivos (como `view_file` o lectura de recurso) y el archivo tiene un tamaño de caracteres estimado superior a **200,000 caracteres** (equivalente heurístico a 50,000 tokens): el hook MUST retornar `ask` advirtiendo sobre el costo de lectura del archivo y requiriendo confirmación.

**Step 4 — SESSION TOKENS (Contexto Saturado).**
Si la sesión acumulada de tokens leídos (obtenida del histórico de eventos `.ospec/runtime/subagent-events.jsonl` o de la memoria de sesión) excede los **150,000 tokens** acumulados: el hook MUST retornar `ask` alertando al usuario de la inminente saturación de contexto y sugiriendo la compactación.

**Step 5 — DENY (no recovery).** Test cada comando extraído contra las reglas de denegación.
Si algún comando coincide con una regla de denegación: retornar `deny` con la razón correspondiente.

| Pattern intent | Example |
|---|---|
| Recursive forced deletion of filesystem root | `rm -rf / --no-preserve-root`, `sudo rm -fr /` |
| Force-push git history | `git push --force`, `git push -f` |
| Pipe download to shell | `curl ... \| bash`, `wget ... \| sudo sh` |
| Pipe download to PowerShell eval | `iwr ... \| iex`, `Invoke-RestMethod ... \| Invoke-Expression` |
| Drive-root recursive forced deletion (Windows) | `Remove-Item C:\\ -Recurse -Force` |
| Filesystem format | `mkfs.ext4 /dev/sda1` |
| Raw write to block device | `dd if=image.iso of=/dev/sda` |
| Format or clear a disk | `Clear-Disk -Number 0`, `format C:` |

**Step 5b — GIT COLLABORATION GUARD.** Detecta estados git riesgosos durante el desarrollo y advierte al usuario antes de permitir operaciones potencialmente peligrosas. Full guard logic is specified in the `git-collaboration-guard` domain spec. The guard:
- Resolves the current branch, default branch (via `origin/HEAD`), and working tree state (via `git status --porcelain`)
- Evaluates whether the tool is a risky action: a command matching `\bgit\s+commit\b` (file-write tools alone are never risky — the guard fires only at commit time, not on every edit)
- Fires when the risky action coincides with at least one of: (1) current branch = default branch, (2) working tree has uncommitted changes
- Returns exactly one `ask` response when both conditions hold (combined advisory)
- Returns `allow` if no conditions hold or the action is not risky
- Per-check fail-open: failure to resolve one condition does not suppress evaluation of others
- All three git commands share a single 5s timeout budget (shared deadline)
- When `DISABLE_GIT_COLLABORATION_GUARD=true`, the entire guard is skipped before any git call

Advisories are in Spanish with three variants: default-branch-only, dirty-tree-only, and combined. The `permissionDecisionReason` MUST contain the current branch name, "default branch", and/or "uncommitted changes" as applicable, plus recommendations to create a feature branch or commit/stash changes.

#### Scenarios

- **DENY fires — guard not evaluated**: Given a tool call matching a DENY rule (Step 5), When PreToolUse evaluates, Then the hook returns `deny` at Step 5, AND Step 5b is never invoked.
- **DENY does not fire, guard fires on default branch**: Given no DENY match AND tool is file-write AND current branch = default branch, When PreToolUse evaluates, Then Step 5b returns `ask` with default-branch advisory.
- **DENY does not fire, guard fires on dirty working tree**: Given no DENY match AND tool is file-write AND working tree is dirty (even on a feature branch), When PreToolUse evaluates, Then Step 5b returns `ask` with dirty-tree advisory.
- **Guard silent on clean feature branch**: Given current branch ≠ default branch AND working tree is clean AND tool is file-write, When PreToolUse evaluates, Then Step 5b returns `allow` (no advisory).
- **Bypass active — guard skipped**: Given `DISABLE_GIT_COLLABORATION_GUARD=true`, When PreToolUse evaluates, Then Step 5b is skipped and evaluation proceeds to Step 6.

**Step 5c — SPEC DRIFT ADVISORY.** The `PreToolUse` decision chain MUST include a new evaluation step for the spec-drift advisory, inserted after the git collaboration guard (Step 5b) and before the existing ASK rules (Step 6).

Step 5c fires when: the command matches `\bgit\s+commit\b`, AND the domain-drift helper (independently invoked by this hook, since hooks are stateless per-invocation processes — no state is shared with SessionStart) reports at least one drifted domain whose source globs overlap the staged files (`git diff --name-only --cached`), or — best-effort, when staged-file resolution fails — the command's target files. When it fires, the hook MUST return `ask` (never `deny`) with a reason string naming the drifted domain(s).

Step 1 BYPASS MUST recognize `DISABLE_SPEC_DRIFT_GUARD=true` and skip Step 5c entirely when active (existing bypass variables `DISABLE_AGENT_SHIELD`, `DISABLE_TOKEN_ADVISOR`, `DISABLE_GIT_COLLABORATION_GUARD` are unaffected).

Because Step 5 (DENY) executes before Step 5c, a matching DENY rule always wins — the advisory is never reached when a command is denied.

#### Scenarios

- **Staged files overlap a drifted domain — ask fires**: GIVEN a `git commit` command AND staged files include a file matching the `hooks` domain's source globs AND the `hooks` domain is currently drifted WHEN PreToolUse evaluates the call THEN Step 5c MUST return `ask` with a reason naming `hooks`
- **No overlap — advisory does not fire**: GIVEN a `git commit` command AND staged files do not overlap any drifted domain's globs WHEN PreToolUse evaluates the call THEN Step 5c MUST NOT fire and evaluation proceeds to Step 6
- **DENY fires first — advisory never evaluated**: GIVEN a tool call matches a DENY rule (Step 5) WHEN PreToolUse evaluates the call THEN the hook returns `deny` at Step 5 AND Step 5c is never invoked
- **Bypass active — advisory skipped, no residual state**: GIVEN `DISABLE_SPEC_DRIFT_GUARD=true` WHEN PreToolUse evaluates a `git commit` command that would otherwise trigger Step 5c THEN Step 5c is skipped entirely AND no drift computation occurs and no file or state is written as a side effect

---

**Step 6 — ASK (requires user confirmation).** Test cada comando extraído contra las reglas de consulta.
Si algún comando coincide con una regla de consulta: retornar `ask` con la razón correspondiente.

| Pattern intent | Example |
|---|---|
| Dependency installation | `npm install`, `pnpm add lodash`, `yarn install`, `bun install` |
| Hard git reset | `git reset --hard HEAD~1` |
| Git clean (forced) | `git clean -fd` |
| Docker Compose teardown | `docker compose down`, `docker-compose down --volumes` |
| Recursive forced deletion (non-root) | `rm -rf ./dist` |
| Recursive permission/ownership change | `chmod -R 777 ./data`, `chown --recursive user:group .` |
| PowerShell recursive forced removal (non-drive-root) | `Remove-Item ./dist -Recurse -Force` |
| Recursive dir deletion (Windows cmd) | `rmdir /s build` |
| Force-push with lease | `git push --force-with-lease` |
| Machine restart or shutdown | `shutdown -h now`, `reboot`, `Restart-Computer` |

**Step 7 — ALLOW.** Retornar `allow`.

**Deny beats ask**: Cuando una secuencia de comandos coincide a la vez con una regla de denegación y una de consulta (en comandos separados del array), `deny` MUST ganar.

### 3.4.1 Permission-mode degradation (bypassPermissions)

El input del hook incluye el campo común `permission_mode` (`"default"`, `"plan"`, `"acceptEdits"`, `"auto"`, `"dontAsk"`, `"bypassPermissions"`). Un `ask` devuelto por un hook tiene prioridad sobre el modo de permisos del host, por lo que sin este paso los advisories re-introducen exactamente los prompts que el usuario desactivó al elegir `bypassPermissions`.

Como post-procesamiento final de la cadena de decisión (§3.4), aplicado en un único choke point sobre el resultado ya resuelto:

- Cuando `permission_mode` es `bypassPermissions` Y la decisión resuelta es `ask`: el hook MUST degradarla a `allow`, moviendo el texto del advisory a un `systemMessage` de nivel superior con el prefijo `[ospec advisory]` y conservando `permissionDecisionReason` intacto. El aviso sigue siendo visible; deja de ser bloqueante.
- Las decisiones `deny` MUST NOT degradarse en ningún modo: son el piso de seguridad (Step 5, AgentShield deny-class, atribución en commits).
- Cuando `permission_mode` está ausente o tiene cualquier otro valor: el resultado MUST quedar intacto (compatibilidad hacia atrás con hosts que no envían el campo).
- El fallback de error de parseo (§3.5) devuelve `ask` antes de conocer `permission_mode` y queda fuera de esta degradación.

Aplica de forma uniforme a todas las fuentes de `ask` de la cadena: AgentShield (Step 2), Token Budget Advisor (Steps 3-4), Git Collaboration Guard (Step 5b), Spec Drift Advisory (Step 5c) y reglas ASK (Step 6). Paridad Go/Node obligatoria (`scripts/hooks/pre-tool-use.js` `applyPermissionMode`, `internal/hooks/pretooluse.go` `applyPermissionMode`).

#### Scenarios

- **ASK degradado en bypass**: GIVEN `permission_mode: bypassPermissions` AND un comando que matchea una regla ASK (Step 6) WHEN PreToolUse evalúa THEN el hook devuelve `allow` AND `systemMessage` contiene la razón original del advisory.
- **DENY nunca degradado**: GIVEN `permission_mode: bypassPermissions` AND un comando que matchea una regla DENY WHEN PreToolUse evalúa THEN el hook devuelve `deny` sin `systemMessage`.
- **Modo default intacto**: GIVEN `permission_mode: default` (o ausente) AND un comando que matchea una regla ASK WHEN PreToolUse evalúa THEN el hook devuelve `ask` sin `systemMessage`.
- **Guard advisory degradado**: GIVEN `permission_mode: bypassPermissions` AND un `git commit` con árbol sucio (Step 5b) WHEN PreToolUse evalúa THEN el hook devuelve `allow` AND `systemMessage` contiene el advisory de git.

### 3.5 Error handling

En cualquier error de parseo o evaluación: retornar `ask` explicando que el hook no pudo inspeccionar la llamada. El hook MUST NOT fallar ni salir con código distinto de cero.

---

## 4. PreCompact

**Trigger**: before Claude compacts its conversation context.

**Source**: `scripts/hooks/pre-compact.js`

### 4.1 Behaviour

Given a context compaction is about to occur,
When the hook runs,
Then it MUST always write `{"continue":true}` to stdout (errors include a
`systemMessage` key but still set `continue: true`) and MUST NOT block compaction.

Given no active change exists in the workspace,
When the hook runs,
Then it MUST return `{status: "skipped", reason: "no-active-change"}` internally and
MUST NOT create any `.ospec/` files.

Given an active change exists,
When the hook runs,
Then it MUST:
1. Extract fields from the active change's `state.yaml` (see §4.2).
2. Infer the last completed artifact (see §4.3).
3. Render the session summary document (see §4.4).
4. Write (or no-op if content is unchanged) to
   `.ospec/session/{changeName}/session-summary.md`.
5. Return `{status: "written"|"fresh", change: "<name>", path: ".ospec/session/..."}`.

### 4.2 Active change selection

The hook delegates to `ArtifactStore.findActiveChanges()`, which:
- Scans `openspec/changes/*/state.yaml` (single-repo) or member workspace changes
  (federated).
- Excludes directories named `archive` and changes whose `status` field (from
  `change.status` or top-level `status`) matches: `archived`, `closed`, `complete`,
  `completed`, `done`.
- Sorts remaining changes by `state.yaml` modification time descending; ties broken
  alphabetically by directory name.
- Returns the first (most recently modified) non-terminal change.

### 4.3 YAML extraction (no external parser)

`state.yaml` is parsed by a built-in line-based extractor that handles:
- Indented key–value pairs up to two levels deep.
- Quoted and unquoted scalar values; inline comments stripped.
- YAML list items (`- value` or `- key: value`).
- Inline empty lists (`key: []`).

Fields extracted and their YAML paths (first match wins):

| Field | YAML paths tried |
|---|---|
| Change name | `change.name` → directory name fallback |
| Current phase | `change.current_phase`, `current_phase`, `phase` |
| Explicit artifact | `runtime.last_completed_artifact`, `last_completed_artifact` |
| Blockers | `blocking_questions[]` or `blockers[]` |
| Approvals | `approvals[]` (objects with `gate`/`id` and `decision`/`status`) |
| Next recommended | `next_recommended` |

### 4.4 Last completed artifact inference

If `runtime.last_completed_artifact` or `last_completed_artifact` is set in `state.yaml`:
that value is used as-is (portable path).

Otherwise, the hook scores candidate files by phase rank:

| Rank | Files |
|---|---|
| 1 | `exploration.md` |
| 2 | `proposal-lite.md`, `proposal.md` |
| 3 | `design.md`, `specs/**/spec.md` |
| 4 | `tasks.md` |
| 5 | `apply-progress.md` |
| 6 | `verify-report.md` |
| 7 | `archive-report.md` |

The hook selects the file with the highest rank that:
- Exists on disk under the active change directory.
- Has a rank strictly less than the current phase rank (i.e., is already completed).

If no candidate file exists: returns `"None"`.

### 4.5 Session summary format

```markdown
# Session Summary

## Active change
`{changeName}`

## Current phase
`{currentPhase | "unknown"}`

## Last completed artifact
`{lastCompletedArtifact}`

## Blocking decisions
- {blocker1}
- None  ← when list is empty

## Approvals
- {gate}: {decision}
- None  ← when list is empty

## Next recommended action
Run `{phase} {changeName}`.   ← or free-text from next_recommended
```

### 4.6 Idempotency
The hook MUST use an atomic write (temp file + `fs.rename`) for `session-summary.md`.
If the file already exists and content is identical: skip the write and return
`status: "fresh"`.

---

## 5. SubagentStop

**Trigger**: when a Claude subagent finishes (after each delegated turn).

**Source**: `scripts/hooks/subagent-stop.js`

### 5.0 Result Envelope Parse, Validate, and Persist

Before its existing `skill_resolution` evaluation (baseline §5.1-§5.4), `SubagentStop`
MUST attempt to extract a fenced ```` ```json:result-envelope ```` block from the
subagent's result payload, using the same field-search order already defined in §5.2
(`input.skill_resolution`-style priority: `result`, `output`, `response`,
`final_output`, `final_result`, `message`, `content`, then `transcript_path` fallback).

When the fence is present, the hook MUST validate its content against the canonical
Result Envelope Schema (skills domain, `sdd-phase-common.md` §D) using the shared,
dependency-free validator (`scripts/lib/result-envelope.js`). The validator MUST NOT
throw on malformed input; it MUST return a structured `{valid: boolean, errors: [...]}`
result.

When validation succeeds, the hook MUST resolve the active change (reusing the
`findActiveChanges` selection logic already used by PreCompact/Stop, §4.2) and the
target phase key by stripping the `sdd-` prefix from the resolved agent name (§5.2
extraction — e.g. `sdd-design` → `design`), then read-merge-update that phase's
`state.yaml` entry with the envelope's `summary` and `key_decisions` fields, per the
Phase Summary Block shape (skills domain §12).

When the fence is absent, malformed, fails schema validation, or no active change can
be resolved, the hook MUST skip persistence entirely, MUST NOT throw, and MUST proceed
unchanged to the existing `skill_resolution` behavior (§5.1-§5.4) — this step is
strictly additive and fail-safe.

When the target phase's `state.yaml` entry already carries a non-empty `summary` for
this batch (the phase agent already wrote its own Phase Summary Block), the hook MUST
NOT destructively overwrite it with conflicting content. The exact merge strategy
(atomic last-writer-wins vs. hook-writes-only-when-agent-omitted) is an open design
decision deferred to `sdd-design` for this change; this requirement only fixes the
invariant that no summary data is silently lost.

#### Scenario: Valid envelope persisted to state.yaml

- GIVEN a subagent result payload contains a valid ```` ```json:result-envelope ````
  fence with `summary: "..."` for agent `sdd-design`
- WHEN `SubagentStop` runs
- THEN it validates the fence, resolves the active change and the `design` phase key
- AND read-merge-updates `state.yaml phases.design.summary` with the envelope's summary
- AND processing continues to the existing `skill_resolution` steps afterward

#### Scenario: Missing fence — fail-safe, no persistence

- GIVEN a subagent result payload contains no ```` ```json:result-envelope ```` fence
- WHEN `SubagentStop` runs
- THEN it MUST NOT write to `state.yaml` for this step
- AND it MUST proceed to the existing `skill_resolution` extraction (§5.1) unaffected
- AND stdout MUST still contain `{"continue":true}` (or the existing degraded
  `systemMessage`) exactly as before this change

#### Scenario: Malformed fence — validation fails safely

- GIVEN a fence is present but its JSON is invalid or missing a required field
  (e.g. `status`)
- WHEN `SubagentStop` validates it
- THEN the validator MUST return `valid: false` without throwing
- AND the hook MUST skip persistence and continue with existing behavior, never
  producing a non-zero exit code or blocking the subagent's turn

#### Scenario: Agent's own summary already present — no destructive overwrite

- GIVEN `state.yaml phases.design.summary` already holds a non-empty value written
  earlier in the same batch
- WHEN `SubagentStop` attempts to persist the envelope's summary
- THEN it MUST NOT silently replace it with conflicting content in a way that loses
  information (exact resolution strategy deferred to `sdd-design`)

### 5.1 Behaviour

Given a subagent has finished,
When the hook receives its result payload,
Then it MUST extract the `skill_resolution` value from the payload (see §5.2).

Given `skill_resolution` is healthy (`"injected"`),
When the hook evaluates it,
Then it MUST return `{status: "skipped", reason: "healthy-resolution"}` and write no
file; output `{"continue":true}`.

Given `skill_resolution` is unavailable (not found in any field),
When the hook evaluates it,
Then it MUST return `{status: "skipped", reason: "resolution-unavailable"}` and write
no file; output `{"continue":true}`.

Given `skill_resolution` is degraded (`"fallback-registry"`, `"fallback-path"`, or
`"none"`),
When the hook evaluates it,
Then it MUST:
1. Build an event object:
   ```json
   {
     "timestamp": "<input.timestamp or now().toISOString()>",
     "agent": "<agent_type | agent_name | agent | agent_id | 'unknown'>",
     "skill_resolution": "<degraded value>",
     "action": "refresh-registry-next-delegation"
   }
   ```
2. Append the serialized event (one JSON line) to
   `.ospec/runtime/subagent-events.jsonl` under an advisory file lock.
3. Output `{"continue":true,"systemMessage":"Subagent skill resolution degraded; refresh the skill registry before the next delegation."}`.

### 5.2 Resolution extraction order

The hook MUST search for `skill_resolution` in this priority order:
1. `input.skill_resolution` directly (string field).
2. Known result fields on `input` in order: `result`, `output`, `response`,
   `final_output`, `final_result`, `message`, `content`. Each field is searched as:
   - If the value is a string: regex match for `skill_resolution: "value"` or JSON parse
     + structured search.
   - If the value is an object/array: recursive `skill_resolution` key search
     (depth-first, reversed-values to find the last occurrence).
3. `input.transcript_path`: read the JSONL file, parse each line from the last line
   backward, and apply the structured search to each parsed JSON object.

### 5.3 Advisory append lock

Appends to `.ospec/runtime/subagent-events.jsonl` MUST use an exclusive-create lock
file (`.ospec/runtime/subagent-events.jsonl.lock`) to prevent interleaved JSONL lines
from concurrent subagent hook invocations.

Lock acquisition protocol:
- Attempt to create the lock file with `open("wx")`.
- If the lock exists: check its modification time; if older than 10 seconds (stale
  process crash), delete it and retry.
- Retry up to 100 times with 15 ms delay between attempts.
- After 100 retries still contended: proceed without the lock (best-effort) rather
  than lose the event.
- Release: close the handle and delete the lock file.

### 5.4 Error handling
Any unhandled error MUST produce `{"continue":true,"systemMessage":"SubagentStop observability failed: <msg>"}`. The hook MUST NOT exit non-zero or suppress `continue: true`.

---

## 6. Stop

**Trigger**: when a Claude session ends.

**Source**: `scripts/hooks/stop.js`

### 6.1 Behaviour

Given a Claude session is ending,
When the hook runs,
Then it MUST:
1. Resolve workspace from `input.cwd` or `process.cwd()`.
2. Find the active change using the same selection logic as PreCompact (§4.2).
3. If an active change exists: extract its name, current phase, status, and
   `next_recommended` from `state.yaml`.
4. Check whether `.ospec/session/{changeName}/session-summary.md` exists (written by
   PreCompact).
5. Render the latest-session document (see §6.2).
6. Write the document to `.ospec/session/latest.md` (always overwrite; no
   idempotency check).
7. Output `{"continue":true}` to stdout.

Given no active change exists when Stop fires,
When the hook renders the latest-session document,
Then all change-related fields MUST be `"None"` and next action MUST read
"Start a new session when more work is needed."

Given the session has a terminal-status change (completed, archived, etc.) but no
other active change,
When the hook evaluates active changes,
Then it MUST treat the workspace as having no active change.

### 6.2 Latest-session document format

```markdown
# Latest Session

- Ended at: `{timestamp}`
- Session: `{sessionId}`
- Active change: `{changeName | "None"}`
- Current phase: `{currentPhase | "unknown" | "None"}`
- Change status: `{status | "active" | "None"}`
- Detailed summary: `{relative path to session-summary.md | "None"}`

## Next recommended action
{formatted next action}
```

`sessionId` is resolved from `input.sessionId` or `input.session_id`; defaults to
`"unknown"`. Timestamp uses `input.timestamp` if supplied; otherwise
`now().toISOString()`.

`Detailed summary` is set to the portable relative path of
`.ospec/session/{changeName}/session-summary.md` if that file exists; otherwise
`"None"`.

### 6.3 Error handling
On any unhandled error: output `{"continue":true,"systemMessage":"Stop hook could not write the session trace: <msg>"}`. The hook MUST NOT exit non-zero.

---

## 6a. commit-msg — Traceability Trailers (git commit-msg hook, B3)

**Trigger**: `git commit`, invoked as git's native `commit-msg` hook (installed by
`scripts/setup-git-hooks.js`, outside this domain's sources).

**Source**: `scripts/hooks/commit-msg-hook.js`

This hook is distinct from the five Claude lifecycle hooks in §1–6: it is a git-native
hook receiving the commit message file path as `argv[2]`, not a Claude host hook reading
JSON from stdin.

### 6a.1 No-model-attribution check

Given a commit message,
When the hook runs,
Then it MUST scan every line against `FORBIDDEN_ATTRIBUTION_RE` (co-authored-by,
"generated with/by", the 🤖 emoji, and known AI/model vendor or product names) and, on
a match, MUST print the offending line and remediation guidance to stderr and exit
non-zero — unless `DISABLE_OSPEC_ATTRIBUTION_CHECK=true` is set, in which case it MUST
exit 0 without scanning.

### 6a.2 Traceability trailer validation (B3)

Given an active OpenSpec change exists (resolved by scanning `openspec/changes/*` for
a `state.yaml` whose content includes `status: active`, excluding the `archive`
directory),
When the commit message does not match the exemption pattern for merge/revert/fixup/
squash commits,
Then `checkTraceabilityTrailers(message, activeChangeName)` MUST validate:
1. An `Ospec-Change: {name}` trailer is present and its value equals the active change
   name (else `status: "missing"` or `status: "mismatch"`).
2. An `Ospec-Task: N.N[, N.N...]` trailer is present (else `status: "missing-task"`).
3. Both present and matching → `status: "ok"`.

Given no active change exists, OR the commit message is exempt (merge/revert/fixup/
squash),
When the hook evaluates trailers,
Then `checkTraceabilityTrailers` MUST return `status: "ok"` without requiring any
trailer.

Given `trailerResult.status !== "ok"`,
When the hook decides enforcement,
Then it MUST read `openspec/config.yaml` for `traceability: { trailers: required }`:
- If NOT declared (default, advisory): print an `[Advisory]`-labeled warning to stderr
  and exit 0 (never blocks the commit).
- If declared `required`: print an `[ERROR]`-labeled message to stderr and exit
  non-zero, blocking the commit.

The no-model-attribution check (§6a.1) always runs first and, on a match, exits
non-zero before the trailer check is reached — attribution is a hard floor independent
of the advisory/required traceability policy.

#### Scenarios

- **No active change — trailers not required**: GIVEN no directory under
  `openspec/changes/` has `status: active` in its `state.yaml` WHEN the commit-msg hook
  runs THEN `checkTraceabilityTrailers` returns `status: "ok"` AND the hook exits 0.
- **Active change, missing trailer, advisory mode**: GIVEN an active change `add-x` AND
  the commit message has no `Ospec-Change` trailer AND `openspec/config.yaml` does not
  declare `traceability.trailers: required` WHEN the hook runs THEN it prints an
  `[Advisory]` warning naming the missing trailer AND exits 0.
- **Active change, missing trailer, required mode**: GIVEN the same missing-trailer
  commit AND `traceability: { trailers: required }` is declared WHEN the hook runs THEN
  it prints an `[ERROR]` message AND exits non-zero, blocking the commit.
- **Trailer names the wrong change**: GIVEN an active change `add-x` AND the commit
  message trailer reads `Ospec-Change: add-y` WHEN `checkTraceabilityTrailers` runs
  THEN it returns `status: "mismatch"`.
- **Exempt commit type — no trailer required regardless of mode**: GIVEN an active
  change exists AND the commit message starts with `Merge `, `Revert `, `fixup!`, or
  `squash!` WHEN the hook runs THEN `checkTraceabilityTrailers` returns `status: "ok"`
  without requiring any trailer.
- **Attribution match wins over trailer check**: GIVEN a commit message contains both a
  forbidden attribution line AND a missing traceability trailer WHEN the hook runs THEN
  it exits non-zero on the attribution check (§6a.1) AND the trailer check is never
  reached.

---

## 7. On-disk artifact layout

All hooks resolve paths through `ArtifactStore`; no hook hardcodes `.ospec/` layout
literals directly.

| File | Owner | Write mode |
|---|---|---|
| `.ospec/cache/skill-registry.cache.json` | SessionStart | Create or overwrite (only on fingerprint miss) |
| `.ospec/session/{changeName}/session-summary.md` | PreCompact | Atomic write; no-op if unchanged |
| `.ospec/session/latest.md` | Stop | Always overwrite |
| `.ospec/runtime/subagent-events.jsonl` | SubagentStop | Append (advisory lock) |

### 7.1 Initialization guard
SessionStart and SubagentStop MUST NOT create `.ospec/` files unless openspec is
detected in the workspace. PreCompact and Stop MAY create `.ospec/` paths only when
an active change exists. If no active change is found, neither hook writes any file.

---

## 8. Support library responsibilities

| Library | Responsibilities used by hooks |
|---|---|
| `scripts/lib/ospec-state.js` | `readBaselineState`, `findActiveChanges`, `writeSessionSummary`, `appendRuntimeEvent`, `findOpenSpecRoot` |
| `scripts/lib/artifact-store.js` | `createArtifactStoreFromConfig`, `ARTIFACT_STORE_RELATIVE_PATHS` (canonical path constants) |
| `scripts/lib/skill-registry.js` | `discoverSkills`, `calculateFingerprint`, `readRegistryCache`, `writeRegistryCache` |
| `scripts/lib/workspace-atlas.js` | `parseAtlas`, `resolveMembers` (federated backend only) |

---

## 8a. Go/JS Executable Parity Contract (E1)

The Go port of the hooks (`internal/hooks/*.go`, `cmd/ospec-hooks/`) is an out-of-domain
mirror consumer: its sources are not listed in this domain's manifest globs, so this
spec documents the contract from the JS side only. The Go suite is the mirror consumer
of the same fixtures described below, for **every** hook covered by this contract — not
only `PreToolUse`.

### 8a.1 Fixture family table

| Hook | Fixture prefix | Spawned script | Fixture floor | JS Go mirror test |
|---|---|---|---|---|
| `PreToolUse` | `pre-tool-use-*.json` | `scripts/hooks/pre-tool-use.js` | 4 | `TestPreToolUse_ParityFixtures` |
| `SubagentStop` | `subagent-stop-*.json` | `scripts/hooks/subagent-stop.js` | 4 | `TestSubagentStop_ParityFixtures` |

(Previously: `SubagentStop` fixture floor was 2, covering only the valid-envelope and
malformed-envelope fixtures; the phase-cost recording step (§REQ-hooks-001) adds two
required fixtures — one covering the active-change case and one covering the
no-active-change case, as separate fixture files following the existing one-case-per-
fixture pattern — bringing the floor to 4.)

### 8a.2 Shared golden fixtures

Given `internal/testdata/parity/*.json` fixture files (each holding `description`,
`stdin`, and `expectedStdout`),
When either implementation's parity test suite runs,
Then, for each hook in the fixture family table:
- The JS suite (`scripts/hooks/parity-contract.test.js`) MUST spawn the real spawned
  script (via `child_process.spawnSync`, with all `DISABLE_*` bypass env vars stripped)
  against each of that hook's fixtures' `stdin` and assert the process exits 0.
- The JS suite MUST assert that hook's fixture set contains at least the fixture floor
  listed in the table (the set MUST NOT shrink below it).
- For every fixture EXCEPT a documented fail-open fixture, the JS suite MUST assert
  `actual === expectedStdout` byte-for-byte.
- For a documented fail-open fixture (identified for `PreToolUse` by
  `permissionDecisionReason` starting with `"The safety hook could not inspect this
  tool call:"`; for `SubagentStop` by a fixture with a missing/malformed
  `json:result-envelope` fence), the JS suite MUST compare the stable, implementation-
  independent fields exactly, and MUST assert only that any implementation-specific
  message text (e.g. a JSON-parser error suffix) shares a stable prefix — never a
  full byte-for-byte match on that text.

### 8a.3 Fixture set governance

Adding a fixture under `internal/testdata/parity/` extends the contract for both
runtimes simultaneously (both suites read the same directory). A parity mismatch MUST
NOT be resolved by editing only the fixture: the canonical behavior MUST be decided
first, the lagging implementation changed to match, and the fixture updated only if the
contract itself changed.

#### Scenarios

- **Byte-for-byte match on a DENY fixture**: GIVEN `pre-tool-use-deny.json` fixture with
  `stdin: {"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}` WHEN the JS parity
  suite runs THEN the spawned hook's stdout MUST equal the fixture's `expectedStdout`
  exactly.
- **Parse-error fixture — prefix-only comparison**: GIVEN a fixture whose
  `expectedStdout` reason starts with `"The safety hook could not inspect this tool
  call:"` WHEN the JS parity suite runs THEN it MUST assert `hookEventName` and
  `permissionDecision` match exactly AND MUST assert only a shared prefix on the reason
  string, tolerating a divergent parser-error suffix.
- **Fixture set shrinks below floor — suite fails fast**: GIVEN fewer than 4 files
  matching `pre-tool-use-*.json` exist under `internal/testdata/parity/` WHEN the JS
  parity suite loads fixtures THEN it MUST fail the assertion `fixtureFiles.length >= 4`
  before running any per-fixture test.
- **SubagentStop valid-envelope fixture — byte-for-byte match**: GIVEN
  `subagent-stop-valid-envelope.json` fixture whose `stdin` carries a valid
  `json:result-envelope` fence WHEN the JS parity suite runs THEN the spawned
  `subagent-stop.js` stdout MUST equal `expectedStdout` exactly, including the
  degraded-resolution `systemMessage` (if any) unaffected by envelope persistence.
- **SubagentStop malformed-fence fixture — fail-open, prefix-only where applicable**:
  GIVEN `subagent-stop-malformed-envelope.json` fixture whose fence fails schema
  validation WHEN the JS parity suite runs THEN it MUST assert `continue: true` is
  present in `expectedStdout` AND MUST NOT assert any state.yaml write occurred.
- **SubagentStop phase-cost fixture — new required family**: GIVEN two separate
  `subagent-stop-phase-cost-<case>.json` fixture files under
  `internal/testdata/parity/` — one covering the active-change case and one covering
  the no-active-change case, each a single fixture file per the existing
  one-case-per-fixture pattern — WHEN the JS parity suite runs THEN both runtimes MUST
  produce `continue: true` byte-for-byte identical stdout for each of the two fixtures.
- **SubagentStop fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  4 files matching `subagent-stop-*.json` exist under `internal/testdata/parity/` WHEN
  the JS parity suite loads that hook's fixtures THEN it MUST fail the assertion before
  running any per-fixture test for `SubagentStop`.

---

## 8b. MODIFIED Requirements

### Requirement: Go/JS Executable Parity Contract (E1)

The Go port of the hooks (`internal/hooks/*.go`, `cmd/ospec-hooks/`) is an out-of-domain
mirror consumer: its sources are not listed in this domain's manifest globs, so this
spec documents the contract from the JS side only. The Go suite is the mirror consumer
of the same fixtures described below, for **every** hook covered by this contract — not
only `PreToolUse`.

#### Fixture family table

| Hook | Fixture prefix | Spawned script | Fixture floor | JS Go mirror test |
|---|---|---|---|---|
| `PreToolUse` | `pre-tool-use-*.json` | `scripts/hooks/pre-tool-use.js` | 4 | `TestPreToolUse_ParityFixtures` |
| `SubagentStop` | `subagent-stop-*.json` | `scripts/hooks/subagent-stop.js` | 4 | `TestSubagentStop_ParityFixtures` |

(Previously: `SubagentStop` fixture floor was 2, covering only the valid-envelope and
malformed-envelope fixtures; the phase-cost recording step (§REQ-hooks-001) adds two
required fixtures — one covering the active-change case and one covering the
no-active-change case, as separate fixture files following the existing one-case-per-
fixture pattern — bringing the floor to 4.)

#### Shared golden fixtures

Given `internal/testdata/parity/*.json` fixture files (each holding `description`,
`stdin`, and `expectedStdout`),
When either implementation's parity test suite runs,
Then, for each hook in the fixture family table:
- The JS suite (`scripts/hooks/parity-contract.test.js`) MUST spawn the real spawned
  script (via `child_process.spawnSync`, with all `DISABLE_*` bypass env vars stripped)
  against each of that hook's fixtures' `stdin` and assert the process exits 0.
- The JS suite MUST assert that hook's fixture set contains at least the fixture floor
  listed in the table (the set MUST NOT shrink below it).
- For every fixture EXCEPT a documented fail-open fixture, the JS suite MUST assert
  `actual === expectedStdout` byte-for-byte.
- For a documented fail-open fixture (identified for `PreToolUse` by
  `permissionDecisionReason` starting with `"The safety hook could not inspect this
  tool call:"`; for `SubagentStop` by a fixture with a missing/malformed
  `json:result-envelope` fence), the JS suite MUST compare the stable, implementation-
  independent fields exactly, and MUST assert only that any implementation-specific
  message text (e.g. a JSON-parser error suffix) shares a stable prefix — never a
  full byte-for-byte match on that text.
- The new `subagent-stop-phase-cost-*` fixture family (§REQ-hooks-001) consists of two
  required fixture files — one for the active-change case and one for the
  no-active-change case — and MUST assert `continue: true` in `expectedStdout`
  byte-for-byte, exactly as the other `SubagentStop` fixtures, and MUST NOT assert the
  resulting `phase-costs.jsonl` content byte-for-byte (that file is a disposable
  session artifact, not stdout).

#### Fixture set governance

Adding a fixture under `internal/testdata/parity/` extends the contract for both
runtimes simultaneously (both suites read the same directory). A parity mismatch MUST
NOT be resolved by editing only the fixture: the canonical behavior MUST be decided
first, the lagging implementation changed to match, and the fixture updated only if the
contract itself changed.

#### Scenarios

- **Byte-for-byte match on a DENY fixture**: GIVEN `pre-tool-use-deny.json` fixture with
  `stdin: {"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}` WHEN the JS parity
  suite runs THEN the spawned hook's stdout MUST equal the fixture's `expectedStdout`
  exactly.
- **Parse-error fixture — prefix-only comparison**: GIVEN a fixture whose
  `expectedStdout` reason starts with `"The safety hook could not inspect this tool
  call:"` WHEN the JS parity suite runs THEN it MUST assert `hookEventName` and
  `permissionDecision` match exactly AND MUST assert only a shared prefix on the reason
  string, tolerating a divergent parser-error suffix.
- **Fixture set shrinks below floor — suite fails fast**: GIVEN fewer than 4 files
  matching `pre-tool-use-*.json` exist under `internal/testdata/parity/` WHEN the JS
  parity suite loads fixtures THEN it MUST fail the assertion `fixtureFiles.length >= 4`
  before running any per-fixture test.
- **SubagentStop valid-envelope fixture — byte-for-byte match**: GIVEN
  `subagent-stop-valid-envelope.json` fixture whose `stdin` carries a valid
  `json:result-envelope` fence WHEN the JS parity suite runs THEN the spawned
  `subagent-stop.js` stdout MUST equal `expectedStdout` exactly, including the
  degraded-resolution `systemMessage` (if any) unaffected by envelope persistence.
- **SubagentStop malformed-fence fixture — fail-open, prefix-only where applicable**:
  GIVEN `subagent-stop-malformed-envelope.json` fixture whose fence fails schema
  validation WHEN the JS parity suite runs THEN it MUST assert `continue: true` is
  present in `expectedStdout` AND MUST NOT assert any state.yaml write occurred.
- **SubagentStop phase-cost fixture — new required family**: GIVEN two separate
  `subagent-stop-phase-cost-<case>.json` fixture files under
  `internal/testdata/parity/` — one covering the active-change case and one covering
  the no-active-change case, each a single fixture file per the existing
  one-case-per-fixture pattern — WHEN the JS parity suite runs THEN both runtimes MUST
  produce `continue: true` byte-for-byte identical stdout for each of the two fixtures.
- **SubagentStop fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  4 files matching `subagent-stop-*.json` exist under `internal/testdata/parity/` WHEN
  the JS parity suite loads that hook's fixtures THEN it MUST fail the assertion before
  running any per-fixture test for `SubagentStop`.

---

## 9. Non-functional requirements

- All hooks MUST be pure Node.js 22+ CommonJS with no external npm dependencies.
- All hooks MUST complete within 5 seconds. All five hooks (SessionStart,
  PreToolUse, PreCompact, SubagentStop, Stop) share the same 5-second budget.
- All hooks MUST be non-blocking to the Claude host: they output `{"continue":true}`
  or a permission decision and MUST NOT hang.
- All hooks MUST tolerate a completely missing or malformed `openspec/` tree without
  throwing.

---

## 10. Clarifications

### Session 2026-07-01

- Q: Domain→path ownership rule for drift detection — does the drift helper need a new explicit glob mapping added to the manifest, or can it derive source globs from something already recorded there? → A: Derive them from the existing `sources: ...` list already present in each domain's Domain Map bullet in `openspec/specs/_baseline/manifest.md` (confirmed present for all 7 recorded domains: generator, routing, hooks, skills, agents, skill-registry, install). No new manifest field, file, or schema change is introduced. Parsing convention: split the text after the `| sources:` marker on `,`, trim whitespace per entry; each resulting entry is a literal path or glob pattern (`*`/`**`) relative to repo root. This is encoded as a normative bullet and scenario under "Domain Drift Detection Helper" above.
- Q: Is `DISABLE_SPEC_DRIFT_GUARD` the single kill switch for BOTH the session-start drift summary and the pre-commit advisory, or should each be independently toggleable? → A: Confirmed single kill switch for both, as already specified in this delta (SessionStart Spec Drift Summary requirement and PreToolUse Step 1 BYPASS bullet). This mirrors the existing one-variable-covers-both-hook-paths precedent already in the codebase: `DISABLE_GIT_COLLABORATION_GUARD` gates both the SessionStart advisory (`scripts/hooks/session-start.js:167`) and the PreToolUse ask-rule (`scripts/hooks/pre-tool-use.js:392`) under a single variable, and `DISABLE_AGENT_SHIELD` follows the same pattern across both hooks. Both concerns are a single logical guard spanning two hook entry points, not two independent concerns — so no independent per-hook toggle is introduced. No normative text changed as a result (the spec already reflected this); this session records the confirmed rationale.

### Session 2026-07-04

- Q: ¿Cuál es el floor correcto y el número de fixtures nuevos para la familia `subagent-stop-phase-cost-*` dado que se exigen casos active-change y no-active-change por separado? → A: Floor = 4 (2 fixtures existentes + 2 nuevos: un archivo para el caso active-change y otro para no-active-change, como archivos separados siguiendo el patrón un-caso-por-fixture).

---

## 11. Scenarios

### Scenario: SessionStart with stale skill registry
Given a workspace with `openspec/config.yaml` and an outdated cache
And a `rules/common.md` file has been modified since the cache was written
When SessionStart runs
Then the fingerprint comparison MUST fail
And a new cache MUST be written with updated `generated_at` and new `fingerprint`
And the result MUST include `registry.status: "generated"`

### Scenario: SessionStart with unchanged skills
Given a workspace with a current cache matching the fingerprint
When SessionStart runs a second time
Then the cache file MUST NOT be modified
And the result MUST include `registry.status: "reused"`

### Scenario: PreToolUse deny beats ask in a command array
Given a tool call with `commands: ["npm install", "rm -rf /"]`
When PreToolUse evaluates the array
Then DENY_RULES MUST be evaluated first across all commands
And the result MUST be `permissionDecision: "deny"`

### Scenario: PreCompact with no active change
Given a workspace where all changes have status `"completed"`
When PreCompact runs
Then it MUST return `{status: "skipped", reason: "no-active-change"}`
And MUST NOT create `.ospec/session/`

### Scenario: SubagentStop records a degraded fallback-registry event
Given a subagent result payload with `skill_resolution: "fallback-registry"`
When SubagentStop runs
Then it MUST append one JSON line to `.ospec/runtime/subagent-events.jsonl`
And the event MUST contain `"action": "refresh-registry-next-delegation"`
And stdout MUST contain a `systemMessage` advising registry refresh

### Scenario: Stop with no active change
Given a workspace with no active changes
When Stop runs
Then it MUST write `.ospec/session/latest.md` with all change fields set to `"None"`
And next action MUST read "Start a new session when more work is needed."
