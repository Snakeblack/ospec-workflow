# Spec: skill-registry

**Domain**: skill-registry
**Status**: baseline
**Sources**: `scripts/lib/skill-registry.js`, `scripts/hooks/session-start.js`, `scripts/lib/artifact-store.js`, `scripts/lib/skill-registry.test.js`, `scripts/hooks/session-start.test.js`, `.ospec/cache/skill-registry.cache.json`, `internal/skillreg`

> Cross-reference: the `skills` domain spec documents the SKILL.md authoring contract and frontmatter shape. This spec covers only how that catalog is compiled into a JSON cache artifact and kept fresh via fingerprinting.

---

## 1. Purpose

The skill-registry compiles the plugin's `skills/` tree into a compact JSON cache artifact (`.ospec/cache/skill-registry.cache.json`) that downstream consumers (orchestrators, hooks, sub-agents) can read without rescanning the file system. The `SessionStart` hook drives the cache lifecycle: it reuses the existing cache when the fingerprint matches, or regenerates it when any input file has changed.

---

## 2. Cache Artifact

### 2.1 Location

The cache MUST be written to the workspace-local path `.ospec/cache/skill-registry.cache.json`, resolved against the coordinator workspace (not the plugin root). The canonical relative path is defined by `ARTIFACT_STORE_RELATIVE_PATHS.cache` in `scripts/lib/artifact-store.js` and re-exported by `session-start.js` as `CACHE_RELATIVE_PATH`.

### 2.2 Schema (version 2)

```json
{
  "version": 2,
  "fingerprint": "sha256:<64-hex-chars>",
  "generated_at": "<ISO-8601 UTC timestamp>",
  "skills": [ /* see §4 */ ]
}
```

The `workspace` key (see §6) MAY be present only in `workspace-federated` mode; it MUST be absent (undefined) in `openspec` single-repo mode.

All JSON is pretty-printed with two-space indentation and terminated with a single trailing newline (`\n`).

### 2.3 Version Constant

`CACHE_VERSION = 2` is defined in `session-start.js`. A cache is considered valid only when both `cache.version === 2` AND the stored fingerprint matches the recomputed fingerprint.

### 2.4 Cache Schema Version Stability

Adding the `capabilities` field to skill entries MUST NOT require a `CACHE_VERSION` bump. A cache without `capabilities` on skill entries (generated before this change) is a cache with a mismatched fingerprint (because the skill files themselves changed to add the frontmatter field); such a cache is regenerated via the normal fingerprint-staleness path. No explicit migration is required.

---

## 3. Fingerprint

### 3.1 Input Paths (fingerprintPaths)

`discoverSkills(root)` builds the fingerprint input set (`fingerprintPaths`) from two directory trees under the plugin root:

| Source tree | Inclusion criterion |
|---|---|
| `skills/` | files named `SKILL.md` at any depth, OR files directly under `skills/_shared/` with `.md` extension |
| `rules/` | all files ending in `.md` at any depth |

Entries are represented as `{ absolutePath, relativePath }` objects where `relativePath` uses forward slashes regardless of OS (`toPortablePath`). The array is sorted alphabetically by `relativePath` before being returned.

### 3.2 Hash Algorithm

`calculateFingerprint(paths)` MUST produce a deterministic SHA-256 digest:

1. Sort `paths` by `relativePath` lexicographically (regardless of input order).
2. For each path in sorted order, feed the SHA-256 hash with: `relativePath bytes`, then a NUL byte `\0`, then raw file bytes, then another NUL byte `\0`.
3. Return the digest as the string `sha256:<64 lowercase hex chars>`.
4. If reading a file's content fails with `ENOENT`, the hash algorithm treats the file as empty (i.e. appends no content bytes for the file contents block) rather than throwing an error.

Given: two different call orderings of the same path set.
When: `calculateFingerprint` is called with both orderings.
Then: both calls MUST return the same digest.

Given: any input file content changes.
When: `calculateFingerprint` is called after the change.
Then: the resulting digest MUST differ from the pre-change digest.

---

## 4. Skill Inclusion Filter

`shouldIncludeSkill(relativePath)` determines whether a file discovered in the fingerprint path set contributes an entry to the `skills` array. A path passes the filter if and only if ALL of the following hold:

- It starts with `skills/`.
- It ends with `/SKILL.md`.
- The immediate skill directory (second path segment) is NOT `_shared`.
- The immediate skill directory is NOT `skill-registry`.
- The immediate skill directory does NOT start with `sdd-`.

This means `_shared/*.md` files and `sdd-*` phase skill files are fingerprinted (affect staleness detection) but are NOT emitted as registry entries. The `skill-registry` SKILL.md is also fingerprinted but excluded from entries.

---

## 5. Skill Entry Shape

Each included SKILL.md is parsed and produces one entry in the `skills` array:

```json
{
  "id": "<string>",
  "path": "<string, portable relative path>",
  "triggers": ["<string>", ...],
  "compact_rules": ["<string>", ...],
  "capabilities": ["<string>", ...]
}
```

`skills` MUST be sorted by `id` alphabetically before being written to the cache. If reading an individual skill file fails during this discovery step, the error is logged as a warning and the file is skipped so the registry build continues.

### 5.1 `id`

Taken from the `name` frontmatter attribute. If `name` is absent, falls back to the directory name containing the SKILL.md file.

### 5.2 `triggers`

`extractTriggers(description, fallback)` scans the frontmatter `description` value for the pattern `/\bTrigger:\s*(.+)$/i` (case-insensitive, matched against the description string). If found, the captured group is split on commas and semicolons and each item is trimmed. If not found, or if no non-empty items remain after splitting, the fallback value (`id`) is used as a single-element array.

### 5.3 `compact_rules`

`extractCompactRules(skillMarkdown)` extracts up to 15 rules from the SKILL.md body (frontmatter is stripped first):

**Primary extraction (rules sections):**

1. Scan lines for headings (`##`, `###`, `####`).
2. A heading activates a "rules section" when it matches (case-insensitive): `/\b(?:(?:hard|critical|core|decision)\s+)?(?:rules|patterns|constraints|gates)\b/i`.
3. Within an active rules section, collect:
   - List items (lines matching `/^\s*(?:[-*+]|\d+\.)\s+/`) after stripping the list prefix.
   - Table data rows (lines matching `/^\|.+\|$/`) that are not separator rows. The first column (`columns[0]`) is checked; if it is literally `rule` or `gate` (case-sensitive lowercase after trim), the row is treated as a header and skipped. Otherwise the row is appended as `"columns[0]: columns[1] - columns[2] ..."`.
4. Any heading resets the rules-section flag (non-rules headings exit the section).
5. Duplicate rules are skipped inline (first occurrence wins).

**Fallback extraction (no rules sections found):**

If the primary extraction yields zero rules, re-scan the entire body and collect up to 15 list items (any heading context), deduplicating as above.

**Cap**: the final array MUST contain at most 15 entries.

### 5.4 `capabilities`

The skill entry shape MUST be extended with a `capabilities` field. When the source `SKILL.md` contains a `capabilities:` frontmatter attribute, the registry MUST parse that value into an array of trimmed, non-empty capability name strings and store it as `capabilities` on the skill entry. When the `capabilities:` frontmatter attribute is absent, the registry MUST store `capabilities: []` (an empty array) on the entry.

The `capabilities` field MUST always be present on every entry (either a non-empty array or an empty array); it MUST NOT be absent or `null`.

Parsing rule: the raw frontmatter string for `capabilities` (as returned by `parseFrontmatter`) MUST be split on commas and semicolons, each segment trimmed and bracket characters (`[`, `]`) stripped, and empty segments discarded. This mirrors the `extractTriggers` splitting convention.

---

## 6. Cache Lifecycle (SessionStart Hook)

`runSessionStart` in `scripts/hooks/session-start.js` is the sole writer of the cache. It runs at Claude session start via the hooks system.

### 6.1 Inputs

| Parameter | Type | Description |
|---|---|---|
| `input.cwd` | string (optional) | Workspace root; falls back to `process.cwd()` |
| `pluginRoot` | string | Plugin root (where `skills/` and `rules/` live); defaults to `__dirname/../..` |
| `mode` | string (optional) | Overrides backend mode resolution from config; used in tests |
| `now` | function | Returns current `Date`; injectable for tests |

### 6.2 OpenSpec Detection Gate

The hook calls `store.isInitialized()` first:

- For `openspec` mode: initialized when `openspec/config.yaml` exists in the workspace.
- For `workspace-federated` mode: initialized when `openspec/workspace.yaml` exists and contains at least one member.

Given: no openspec detected.
When: `runSessionStart` executes.
Then: it MUST return `{ status: "ok", ospecDetected: false, registry: { status: "skipped", path: CACHE_RELATIVE_PATH } }` and MUST NOT write any files.

### 6.3 Fingerprint-Based Freshness

Given: the cache file exists, `cache.version === 2`, and `cache.fingerprint` equals the freshly computed fingerprint.
When: `runSessionStart` executes.
Then: it MUST return `registry.status: "reused"` and MUST NOT overwrite the cache file.

Given: the cache file is absent, corrupt (SyntaxError), missing, has `version !== 2`, or has a mismatched fingerprint.
When: `runSessionStart` executes.
Then: it MUST build a new cache object, write it atomically (see §6.4), and return `registry.status: "generated"`.

### 6.4 Atomic Write

`writeRegistryCache(cachePath, data)` MUST:

1. Create the parent directory recursively (`mkdir` with `recursive: true`).
2. Write to a temporary file named `${cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`.
3. Atomically rename the temp file to `cachePath`.
4. In a `finally` block, attempt to remove the temp file (`fs.rm` with `force: true`); ignore `ENOENT`. If the write or rename step fails, that initial write error MUST propagate, and any cleanup error in the `finally` block MUST NOT override the propagating write error (it is only logged as a warning).

### 6.5 Read Resilience

`readRegistryCache(cachePath)` MUST return `null` (not throw) when:

- The file does not exist (`ENOENT`).
- The file contents are not valid JSON (`SyntaxError`).

All other errors MUST propagate.

### 6.6 Cache Object Construction

When a new cache must be written, the object MUST include:

```json
{
  "version": 2,
  "fingerprint": "<computed>",
  "generated_at": "<now().toISOString()>",
  "skills": "<sorted skills array>"
}
```

The `workspace` key is added conditionally: `store.describeWorkspace()` is called; if it returns a non-null value the result is merged as `cache.workspace`. In `openspec` single-repo mode `describeWorkspace()` always returns `null`, so the `workspace` key MUST NOT appear in the emitted JSON.

---

## 7. Federated Workspace Context

When `artifact_store.backend` is `workspace-federated`, `store.describeWorkspace()` returns:

```json
{
  "members": [
    { "id": "<string>", "reachable": "<boolean>" }
  ],
  "contracts": [
    { "id": "<string>", "provider": "<string>", "consumers": ["<string>"] }
  ]
}
```

Both arrays MUST be sorted by `id` ascending for a deterministic cache. This context is embedded as `cache.workspace` so delegators can read cross-repo membership without re-parsing `openspec/workspace.yaml`.

Given: a `workspace-federated` store with a valid `workspace.yaml` listing two members and one contract.
When: `runSessionStart` generates a new cache.
Then: the cache MUST contain `workspace.members` sorted by `id` and `workspace.contracts` sorted by `id`.

---

## 8. Baseline Hint

After detecting a valid openspec, `runSessionStart` reads `openspec/config.yaml` and inspects the `baseline` block:

| Baseline state | Hint emitted |
|---|---|
| `status: pending` | "Baseline not started. Run /sdd-baseline to seed openspec/specs/." |
| `status: partial` | "Baseline partial: N domain(s) pending. Run /sdd-baseline to resume." |
| `status: done` AND `stale_domains` non-empty | Lists stale domain names and suggests `/sdd-baseline refresh`. |
| `status: done` AND `stale_domains` empty | No hint; `baseline` key MUST be absent from the result. |
| No `baseline` block in config | No hint; `baseline` key MUST be absent from the result. |

The baseline hint is non-critical: a failure reading the config MUST NOT abort the session start; the hint is simply omitted.

---

## 9. File Collection

`collectFiles(root, include)` traverses a directory tree:

- Entries at each level are sorted alphabetically by name before recursion, ensuring deterministic traversal across platforms.
- If the root directory does not exist (`ENOENT`), the function returns an empty array (not an error).
- Only regular files passing the `include` predicate are included; directories are traversed but not collected.

---

## 10. Scenarios

### S-1: First-run cache generation

Given: a workspace with `openspec/config.yaml` present and no `.ospec/cache/` directory.
When: `runSessionStart` executes.
Then: the cache file MUST be created at `.ospec/cache/skill-registry.cache.json` with `version: 2`, a valid sha256 fingerprint, `generated_at` matching the injected `now()`, and a `skills` array containing only skills passing the inclusion filter. The result MUST include `registry.status: "generated"`.

### S-2: Unchanged fingerprint — cache reuse

Given: a valid version-2 cache file whose fingerprint matches the current computed fingerprint.
When: `runSessionStart` executes a second time with no file changes.
Then: the cache file bytes MUST be identical to the first run (no write). The result MUST include `registry.status: "reused"`.

### S-3: Content change triggers regeneration

Given: a valid cache file from a first run, then one `rules/*.md` file content is changed.
When: `runSessionStart` executes again.
Then: the new cache MUST have a different `fingerprint` and an updated `generated_at`. The result MUST include `registry.status: "generated"`.

### S-4: No openspec — skip

Given: a workspace with no `openspec/config.yaml` and no `openspec/workspace.yaml`.
When: `runSessionStart` executes.
Then: no `.ospec/` directory is created. The result MUST be `{ status: "ok", ospecDetected: false, registry: { status: "skipped" } }`.

### S-5: Federated mode with atlas — workspace embedded in cache

Given: a workspace with `artifact_store.backend: workspace-federated` and a valid `openspec/workspace.yaml` listing members and contracts.
When: `runSessionStart` generates the cache.
Then: the cache MUST contain a `workspace` key with sorted `members` and `contracts` arrays.

### S-6: sdd-* and skill-registry skills excluded from entries but included in fingerprint

Given: a plugin root containing `skills/sdd-apply/SKILL.md` and `skills/skill-registry/SKILL.md` alongside `skills/example/SKILL.md`.
When: `discoverSkills` runs.
Then: `skills` MUST contain only the `example` entry. `fingerprintPaths` MUST contain all three SKILL.md files (they affect the fingerprint but are not registry entries).

### S-7: Stack skill with capabilities — field populated in cache

- GIVEN `skills/stack-angular/SKILL.md` has frontmatter `capabilities: [angular]`
- WHEN `discoverSkills` processes the file and builds the registry
- THEN the `stack-angular` entry in `cache.skills` has `capabilities: ["angular"]`
- AND all other fields (`id`, `path`, `triggers`, `compact_rules`) are populated normally

### S-8: Utility skill without capabilities — empty array in cache

- GIVEN `skills/branch-pr/SKILL.md` has no `capabilities:` frontmatter field
- WHEN `discoverSkills` processes the file
- THEN the `branch-pr` entry has `capabilities: []`
- AND existing fields are unaffected

### S-9: Stack skill with multiple capabilities — all parsed

- GIVEN `skills/stack-angular/SKILL.md` has frontmatter `capabilities: [angular, tailwind]`
- WHEN `discoverSkills` processes the file
- THEN the entry has `capabilities: ["angular", "tailwind"]`

### S-10: Cache regenerated when a stack skill is added

- GIVEN a valid cache exists and a new file `skills/stack-postgres/SKILL.md` is created
- WHEN `runSessionStart` executes
- THEN the fingerprint changes (new SKILL.md file included in fingerprint inputs)
- AND `registry.status: "generated"` is returned with the new entry in `cache.skills`

### S-11: Pre-existing cache regenerated by fingerprint, not version bump

- GIVEN a version-2 cache generated before this change, where skill entries lack `capabilities`
- WHEN any `skills/stack-*/SKILL.md` file is added or modified (adding `capabilities:` frontmatter)
- THEN `calculateFingerprint` produces a different digest
- AND `runSessionStart` regenerates the cache (status: "generated") with the new schema
- AND `CACHE_VERSION` remains `2`

---

## 11. External Skills Root and Required-Bundle Guard

> Reconciled by `/sdd-reconcile skill-registry` on 2026-09-05 (window
> `c2ca072..HEAD`, commit 4f96084 "feat(hooks): registro de skills para
> instalaciones globales de CX0").

### Requirement: External Skills Root With Portable Paths {#REQ-skill-registry-001}

`discoverSkills(root, options)` in `scripts/lib/skill-registry.js` MUST accept an
options object `{ skillsRoot, requireSkills }`. When omitted, behavior MUST be
byte-identical to the previous single-argument form (skills read from
`<root>/skills`, `requireSkills` false).

When a `skillsRoot` different from `<root>/skills` is supplied (an external
skills root, e.g. `~/.agents/skills` for global CX0 installs):

- Skill files collected under `skillsRoot` MUST contribute fingerprint entries
  whose `relativePath` is `skills/<portable path relative to skillsRoot>` — so
  the fingerprint is stable across source and installed layouts — while rules
  files keep `relativePath` relative to `root` as before.
- Emitted skill entries MUST carry `path` as the portable **absolute** path of
  the SKILL.md (forward slashes), instead of the repo-relative path, so
  consumers in split-script/skill installations can resolve the file.
- Entries are still discovered, filtered, parsed, and sorted by the existing
  §4/§5 rules; only the path representation changes.

#### Scenario: Global CX0 installation discovers the external root

- GIVEN `discoverSkills` is called with `skillsRoot` pointing at
  `~/.agents/skills` while `root` holds only scripts and rules
- WHEN discovery completes
- THEN every emitted skill entry's `path` is a portable absolute path under
  `~/.agents/skills`
- AND the fingerprint input set uses `skills/<relative-to-skillsRoot>` paths for
  skills and `<relative-to-root>` paths for rules

### Requirement: Fail-Closed Required-Bundle Guard {#REQ-skill-registry-002}

When `discoverSkills` is called with `requireSkills: true`, it MUST enforce fail-closed validation of both skill presence and OSpec bundle identity before accepting the skills root:
1. If the resolved skills root contains zero files named `SKILL.md`, `discoverSkills` MUST throw an Error naming the required skills root.
2. In shared or external skill roots (e.g. `~/.agents/skills` or any root outside `<root>/skills`), `discoverSkills` MUST verify the presence of at least one minimal OSpec identity anchor:
   - Canonical shared definitions directory: `skills/_shared/` (or relative `_shared/` containing `.md` files), OR
   - Canonical registry skill: `skills/skill-registry/SKILL.md` (or relative `skill-registry/SKILL.md`), OR
   - Installation manifest: `.ospec-workflow-install.json` in the skills root or its parent directory.
3. If an external or shared skills root contains third-party or foreign `SKILL.md` files but lacks all OSpec identity anchors, `discoverSkills` MUST throw an Error identifying the absence of OSpec identity in the required skills root.
4. Both Node.js and Go implementations MUST enforce this fail-closed identity guard consistently.
(Previously: When `discoverSkills` was called with `requireSkills: true`, it only verified that at least one `SKILL.md` existed, allowing foreign skills alone in a shared root to satisfy the guard.)

#### Scenario: Broken required bundle with no skills fails closed

- GIVEN `requireSkills: true` and a `skillsRoot` containing no `SKILL.md` (missing or malformed installation)
- WHEN `discoverSkills` runs
- THEN it throws an Error whose message names the required skills root
- AND no registry, fingerprint, or cache object is returned.

#### Scenario: Shared skills root with foreign-only skills fails closed

- GIVEN `requireSkills: true` and an external `skillsRoot` containing foreign `SKILL.md` files but no `_shared/` directory, no `skill-registry/SKILL.md`, and no `.ospec-workflow-install.json` manifest
- WHEN `discoverSkills` runs
- THEN it throws an Error indicating missing OSpec bundle identity
- AND no registry, fingerprint, or cache object is returned.

#### Scenario: Shared skills root with canonical OSpec identity anchor succeeds

- GIVEN `requireSkills: true` and an external `skillsRoot` containing foreign skills alongside an OSpec anchor (`_shared/`, `skill-registry/SKILL.md`, or `.ospec-workflow-install.json`)
- WHEN `discoverSkills` runs
- THEN discovery succeeds without throwing an Error
- AND valid skills from the bundle are parsed into the registry.

### Requirement: Nested `sdd-` Directory Exclusion {#REQ-skill-registry-003}

`shouldIncludeSkill` MUST exclude a `SKILL.md` not only when the immediate
skill directory (second path segment) starts with `sdd-`, but also when the
file's immediate parent directory name starts with `sdd-` (a skill nested
inside another directory, e.g. `skills/ops/sdd-helper/SKILL.md`). Excluded
files still contribute to the fingerprint per §4.2 of the skills domain spec.

#### Scenario: Nested sdd- skill is not a registry entry

- GIVEN a file `skills/agents-tree/sdd-orchestrator/SKILL.md` under the skills
  root
- WHEN `shouldIncludeSkill` evaluates its path
- THEN the file is excluded from registry entries
- AND it still appears in `fingerprintPaths`

### Requirement: Single-Snapshot Read and Hash Error Resilience {#REQ-skill-registry-004}

The skill registry discovery and fingerprinting pipeline MUST read input files at most once and degrade gracefully when encountering unreadable files:
1. `discoverSkills` MUST collect file contents in memory as a snapshot during initial file traversal.
2. `calculateFingerprint` MUST consume the in-memory snapshot content from `fingerprintPaths` rather than re-reading files from disk.
3. If reading any file fails during discovery (due to permissions such as `EACCES` or other filesystem I/O errors), the system MUST log a warning to standard error, MUST omit the file from the parsed `skills` array, and MUST include the file in `fingerprintPaths` with empty content (`0` bytes).
4. If `calculateFingerprint` is invoked directly without in-memory content snapshots and file reading fails for any reason (including `ENOENT`, `EACCES`, or I/O errors), it MUST treat the file as empty content (`0` bytes) rather than throwing an unhandled exception.
5. Node.js (`scripts/lib/skill-registry.js`) and Go (`internal/skillreg`) implementations MUST maintain strict behavioral and cryptographic parity for all discovery, snapshotting, and fingerprinting operations.

#### Scenario: Single-snapshot read prevents redundant disk I/O

- GIVEN a valid plugin root containing skill and rule markdown files
- WHEN `discoverSkills` runs and its `fingerprintPaths` are passed to `calculateFingerprint`
- THEN each file is read from disk at most once during discovery
- AND `calculateFingerprint` computes the SHA-256 digest using snapshot bytes without issuing additional read calls.

#### Scenario: Unreadable skill file degrades gracefully during discovery

- GIVEN a skill file in `skills/` that cannot be read due to `EACCES` permissions or I/O error
- WHEN `discoverSkills` executes
- THEN a warning is logged to standard error
- AND the unreadable skill is excluded from the returned `skills` list
- AND `fingerprintPaths` includes the file with empty content
- AND `calculateFingerprint` completes without throwing, hashing the file as empty bytes.

#### Scenario: Direct calculateFingerprint on unreadable file degrades gracefully

- GIVEN a list of `fingerprintPaths` lacking preloaded content where a file cannot be read (`EACCES` or vanished)
- WHEN `calculateFingerprint` executes
- THEN the unreadable file is treated as empty content
- AND a deterministic SHA-256 fingerprint is returned without throwing an unhandled error.

#### Scenario: Node and Go cross-runtime parity on unreadable files

- GIVEN an identical directory structure containing both readable skills and an unreadable file
- WHEN processed by Node `discoverSkills`/`calculateFingerprint` and Go `DiscoverSkills`/`CalculateFingerprint`
- THEN both implementations produce identical SHA-256 digests
- AND both implementations omit the unreadable file from parsed `skills` without crashing.

---

## Cross-References

- `capability-registry` domain spec — name matching contract used at injection time
- `skills` domain spec — `capabilities:` frontmatter field authoring contract on stack skills
- `agents` domain spec — consumption of `capabilities` field at injection time
- `scripts/lib/skill-registry.js` (`discoverSkills`, `calculateFingerprint`, `parseFrontmatter`) — implementation targets
- `internal/skillreg` (`DiscoverSkills`, `CalculateFingerprint`) — Go mirror implementation targets
