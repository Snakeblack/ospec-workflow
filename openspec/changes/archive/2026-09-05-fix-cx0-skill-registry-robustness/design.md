# Design: Skill Registry Resilience and Fail-Closed Identity

## Technical Approach

This design resolves two resilience vulnerabilities in the CX0 skill-registry runtime:
1. **Single-snapshot read pipeline & hash error resilience**: Eliminates redundant filesystem I/O and unhandled exceptions on unreadable files (`EACCES`, permissions, or I/O errors). `discoverSkills` reads eligible files once into memory buffers; these preloaded bytes are attached to `fingerprintPaths` entries. If a file cannot be read during discovery, a warning is logged to `stderr`, the file is excluded from parsed `skills`, and its content in `fingerprintPaths` is set to empty (`0` bytes). `calculateFingerprint` computes the SHA-256 digest using preloaded snapshot content without re-reading from disk; direct invocations without preloaded buffers degrade gracefully to empty content on any read error without throwing.
2. **Fail-closed OSpec identity verification**: Hardens `requireSkills: true` in shared or external skills roots (`~/.agents/skills` or paths outside `<root>/skills`). If an external root contains only foreign `SKILL.md` files without canonical OSpec identity anchors (`_shared/`, `skill-registry/SKILL.md`, or `.ospec-workflow-install.json`), discovery fails closed with an explicit error naming the missing identity.

Both Node.js (`scripts/lib/skill-registry.js`) and Go (`internal/skillreg/skillreg.go`) maintain strict behavioral and cryptographic parity.

---

## Architecture Decisions

### Decision: Single-Snapshot In-Memory Read Pipeline with Graceful Empty Degradation (ADR-001)

| Option | Trade-off | Decision |
|---|---|---|
| **Single-snapshot read during discovery; in-memory buffer passing to fingerprint; empty content fallback on error** | Memory buffering of small skill files (~50-100 KB total); eliminates redundant I/O, prevents race conditions, and survives permission errors. | **Selected** |
| Re-read files during fingerprinting with extended catch blocks (`EACCES`, `EPERM`) | Lower peak memory by a few KB; incurs duplicate disk reads, risks TOCTOU inconsistencies, and requires dual error-handling logic. | Rejected |
| Throw fatal error on any unreadable file during discovery or fingerprinting | Strict fail-fast; crashes agent initialization (`SessionStart`) whenever any single skill has restrictive permissions or transient read errors. | Rejected |

- **Choice**: In Node and Go discovery, read each eligible skill and rule file into memory once. Store the resulting byte buffer in `fingerprintPaths` entries. If read fails, log a warning to `stderr`, omit from `skills`, and set `content` to empty (`Buffer.alloc(0)` in Node, `[]byte{}` in Go). `calculateFingerprint` consumes snapshot content without re-reading disk; when called directly without preloaded content, any file read error degrades to empty content without throwing.
- **Alternatives considered**: Re-reading disk in `calculateFingerprint` with broader error catching (rejected: duplicate I/O and TOCTOU race condition); aborting session start on unreadable files (rejected: breaks resilience for non-critical skill failures).
- **Rationale**: Skill and rule files are small markdown files (<100 KB across typical workspaces). Buffering them in memory during discovery completely eliminates redundant I/O, guarantees that fingerprinting hashes the exact bytes parsed into the registry, and provides deterministic zero-byte fallback for unreadable files.
- **Evidence and consequences**: Addresses PR #175 post-release audit and REQ-skill-registry-004. Public contract for `calculateFingerprint` now safely handles unreadable files.

### Decision: Fail-Closed OSpec Identity Anchor Verification in External Roots (ADR-002)

| Option | Trade-off | Decision |
|---|---|---|
| **Require canonical OSpec anchors (`_shared/`, `skill-registry/SKILL.md`, or `.ospec-workflow-install.json`) in external roots when `requireSkills: true`** | Minimal filesystem inspection on startup; prevents foreign tool skills from satisfying the required bundle guard and corrupting the cache. | **Selected** |
| Any `SKILL.md` satisfies `requireSkills` (status quo) | Simplest check; allows foreign agent tools in `~/.agents/skills` to overwrite the OSpec registry cache with foreign skills when OSpec is broken or uninstalled. | Rejected |
| Restrict `requireSkills` strictly to source repositories (disallowing shared roots) | Eliminates shared root ambiguity; breaks global Codex / multi-agent installs that legitimately place skills in `~/.agents/skills`. | Rejected |

- **Choice**: When `requireSkills: true` and `skillsRoot` is external (`externalSkills == true`), assert both that at least one `SKILL.md` exists AND that at least one canonical OSpec identity anchor is present: (1) `_shared/*.md` directory, (2) `skill-registry/SKILL.md`, or (3) `.ospec-workflow-install.json` in `skillsRoot` or its parent directory. If anchors are missing, throw an explicit error.
- **Alternatives considered**: Checking only `SKILL.md` count (rejected: fails to distinguish OSpec from third-party agent skills in shared directories); checking only manifest files (rejected: breaks custom installs or unmanaged directories containing valid OSpec skills).
- **Rationale**: In shared directories like `~/.agents/skills`, skills from multiple frameworks (OSpec, Claude Code, custom agents) coexist. When OSpec requires its bundle, accepting any random `SKILL.md` lets a damaged OSpec install masquerade as valid, generating an empty or corrupted registry cache. Checking canonical anchors guarantees bundle authenticity.
- **Evidence and consequences**: Implements REQ-skill-registry-002. Reversible via configuration if new anchor formats emerge.

---

## Data Flow

```
DiscoverSkills(root, { skillsRoot, requireSkills })
  │
  ├── 1. Traversal: Collect skillFiles and ruleFiles
  │
  ├── 2. Identity Guard (if requireSkills: true):
  │        ├── Any SKILL.md found? ──(No)──> Throw "No SKILL.md files found in required skills root..."
  │        └── Is externalSkills?
  │                 └── Has OSpec Anchor (_shared, skill-reg, manifest)?
  │                           └──(No)──> Throw "No OSpec identity anchors found in required external skills root..."
  │
  ├── 3. Single-Snapshot Ingestion:
  │        For each file in skillFiles + ruleFiles:
  │           Try Read File:
  │              ├── Success ──> content = bytes
  │              │               Parse frontmatter & compact rules (if eligible skill) ──> Add to skills[]
  │              └── Failure ──> Log warning to stderr
  │                              content = 0 bytes (Buffer.alloc(0) / []byte{})
  │                              Exclude from skills[]
  │           Add { absolutePath, relativePath, content } to fingerprintPaths
  │
  └── 4. Return { fingerprintPaths, skills }
            │
            ▼
CalculateFingerprint(fingerprintPaths)
  │
  ├── Sort entries deterministically by relativePath
  │
  └── For each entry:
        ├── Write relativePath + "\0"
        ├── content present in entry?
        │       ├── Yes ──> data = entry.content (Direct memory, 0 disk I/O)
        │       └── No  ──> Try Read from absolutePath
        │                     ├── Success ──> data = disk bytes
        │                     └── Error   ──> data = 0 bytes (No throw!)
        └── Write data + "\0"
  │
  └── Digest SHA-256 ──> "sha256:<hex>"
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/skill-registry.js` | Modify | 1. In `discoverSkills`, read all candidate files once into memory buffer; log warning on error, set empty buffer, exclude failed files from `skills`.<br>2. Add `hasOspecIdentity` helper and validate identity anchors when `requireSkills: true` and `externalSkills: true`.<br>3. In `normalizeFingerprintPath`, preserve `entry.content`.<br>4. In `calculateFingerprint`, use preloaded `file.content` without disk read; on direct calls where `file.content` is absent, degrade all read errors to empty buffer without throwing. |
| `internal/skillreg/skillreg.go` | Modify | 1. In `readFingerprintFile`, on read error log warning to `os.Stderr`, return `fp.Content = []byte{}` and `ok = false`.<br>2. In `DiscoverSkills`, only parse skills for files where read succeeded (`ok == true`).<br>3. Add `hasOspecIdentity` helper and enforce anchor checks for external roots when `RequireSkills` is true.<br>4. In `CalculateFingerprint`, treat any read error on missing in-memory content as empty `[]byte{}` without returning an error. |
| `scripts/lib/skill-registry.test.js` | Modify | 1. Update existing external skills test with `requireSkills: true` to include an OSpec anchor.<br>2. Add test verifying single-snapshot read (zero additional disk reads during fingerprinting).<br>3. Add test verifying unreadable file graceful degradation (warning logged, omitted from skills, deterministic empty content hash, no throw).<br>4. Add test verifying foreign-only external root throws when `requireSkills: true`.<br>5. Add test verifying direct `calculateFingerprint` degrades gracefully on unreadable files. |
| `internal/skillreg/skillreg_test.go` | Modify | 1. Add test for unreadable skill file during `DiscoverSkills` (warning logged, omitted from skills, deterministic hash).<br>2. Add test for direct `CalculateFingerprint` with unreadable file degrading to empty bytes.<br>3. Add test for `RequireSkills: true` with missing skills root failing closed.<br>4. Add test for `RequireSkills: true` in external root with foreign-only skills failing closed.<br>5. Add test for `RequireSkills: true` in external root with valid OSpec identity succeeding.<br>6. Cross-runtime parity test ensuring identical SHA-256 digest on unreadable files. |
| `openspec/changes/fix-cx0-skill-registry-robustness/decisions/adr-001.md` | Create | Significant ADR for single-snapshot pipeline and unreadable file hashing degradation. |
| `openspec/changes/fix-cx0-skill-registry-robustness/decisions/adr-002.md` | Create | Significant ADR for fail-closed OSpec identity anchor check in shared roots. |

---

## Interfaces / Contracts

### 1. In-Memory Fingerprint Path Structure

#### Node.js (`scripts/lib/skill-registry.js`)
```javascript
// Return type of discoverSkills:
// { fingerprintPaths: Array<FingerprintEntry>, skills: Array<SkillEntry> }

// FingerprintEntry:
{
  absolutePath: string,       // Normalized absolute path on host
  relativePath: string,       // Portable workspace-relative path (e.g. "skills/_shared/runtime.md")
  content?: Buffer | string   // Preloaded snapshot bytes; Buffer.alloc(0) if unreadable
}
```

`normalizeFingerprintPath(entry)`:
```javascript
function normalizeFingerprintPath(entry) {
  if (typeof entry === "string") {
    return {
      absolutePath: path.resolve(entry),
      relativePath: toPortablePath(entry),
      content: undefined,
    };
  }
  if (entry && typeof entry.absolutePath === "string" && typeof entry.relativePath === "string") {
    return {
      absolutePath: path.resolve(entry.absolutePath),
      relativePath: toPortablePath(entry.relativePath),
      content: entry.content !== undefined ? entry.content : undefined,
    };
  }
  throw new TypeError("Fingerprint paths must be file paths or { absolutePath, relativePath } objects.");
}
```

#### Go (`internal/skillreg/skillreg.go`)
```go
type FingerprintPath struct {
    AbsolutePath string
    RelativePath string
    Content      []byte // Non-nil ([]byte{} or read bytes) if read attempted during discovery
}
```

### 2. Hash Error Resilience Contract
`calculateFingerprint(paths)` (Node) and `CalculateFingerprint(paths)` (Go):
- **Precondition**: `paths` is an array of fingerprint path objects or strings.
- **Invariant**: The function NEVER throws or returns an error due to missing, vanished, permission-restricted (`EACCES`), or unreadable files.
- **Behavior**:
  - If `content` is already provided (non-nil / defined): hash `content` directly.
  - If `content` is not provided (nil / undefined): attempt disk read. If read fails for any reason, hash `0` bytes (`Buffer.alloc(0)` / `[]byte{}`).
- **Digest format**: `sha256:<64-character lowercase hex string>`.

### 3. OSpec Identity Anchor Contract
`hasOspecIdentity(skillsRoot, skillFiles)`:
Validates the presence of at least one of:
1. `skillFiles` contains `_shared/*.md` relative to `skillsRoot`.
2. `skillFiles` contains `skill-registry/SKILL.md` relative to `skillsRoot`.
3. Existence of `.ospec-workflow-install.json` in `skillsRoot` or `dirname(skillsRoot)`.

If `requireSkills === true` and `externalSkills === true` and `!hasOspecIdentity(...)`:
- Node: throws `new Error(\`No OSpec identity anchors found in required external skills root: \${skillsRoot}\`)`
- Go: returns `nil, fmt.Errorf("no OSpec identity anchors found in required external skills root: %s", skillsRoot)`

---

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| REQ-skill-registry-004: Single-snapshot disk read | `discoverSkills` executed on directory with skills and rules; `fingerprintPaths` passed to `calculateFingerprint` | Files read at most once from disk; `calculateFingerprint` issues 0 read calls | Unit test with spy / FS interception checking read counts |
| REQ-skill-registry-004: Unreadable skill in discovery | Skill file in `skills/` with unreadable permissions (`EACCES`) or simulated read error | Warning emitted to stderr; skill omitted from `skills`; hashed as 0 bytes; no exception thrown | Unit test in Node and Go asserting stderr warning, skills exclusion, and completed fingerprint |
| REQ-skill-registry-004: Direct `calculateFingerprint` with unreadable file | `calculateFingerprint` called with raw paths containing an unreadable file without preloaded content | Unreadable file hashes as empty bytes; deterministic digest returned; no exception thrown | Unit test in Node and Go with unreadable file path |
| REQ-skill-registry-004: Cross-runtime hash parity | Identical fixture with readable skills and unreadable file processed by Node and Go | Node and Go produce identical `sha256:...` digest strings | Parity test comparing Node output vs Go output |
| REQ-skill-registry-002: Missing required skills root | `requireSkills: true` with empty root or no `SKILL.md` files | Throws Error naming required skills root | Existing and updated unit tests in Node and Go |
| REQ-skill-registry-002: Foreign-only skills in external root | `requireSkills: true` with external root containing foreign `SKILL.md` but no OSpec anchors | Throws Error stating absence of OSpec identity anchors in required skills root | New unit tests in Node and Go verifying rejection |
| REQ-skill-registry-002: External root with valid OSpec anchor | `requireSkills: true` with external root containing foreign skills AND `_shared/`, `skill-registry/`, or manifest | Discovery succeeds; valid skills parsed; no error | Unit tests in Node and Go with anchored external roots |

### Strict TDD Execution Plan
1. **Red Phase 1 (Identity Guard)**: Write failing tests in `skill-registry.test.js` and `skillreg_test.go` asserting rejection of foreign-only external roots when `requireSkills: true`. Run tests -> verify failure.
2. **Green Phase 1**: Implement `hasOspecIdentity` in Node and Go. Run tests -> verify pass.
3. **Red Phase 2 (Unreadable files & single-snapshot)**: Write failing tests for single-snapshot I/O count, unreadable file warning/degradation during discovery, and direct fingerprint degradation. Run tests -> verify failure.
4. **Green Phase 2**: Implement single-snapshot buffering in `discoverSkills`/`DiscoverSkills` and graceful degradation in `calculateFingerprint`/`CalculateFingerprint`. Run tests -> verify pass.
5. **Parity & Regression**: Run full suite (`npm test` and `go test ./...`) to ensure zero regressions across the codebase.

---

## Migration / Rollout

No migration required. Cache version remains `version: 2`. In-memory snapshot passing is strictly backwards-compatible: callers passing legacy string paths or `{ absolutePath, relativePath }` objects to `calculateFingerprint` continue to function with improved fault tolerance (no crash on read errors).

---

## Open Questions

None. The behavior, error handling, and identity anchors are fully specified in proposal.md and spec.md.
