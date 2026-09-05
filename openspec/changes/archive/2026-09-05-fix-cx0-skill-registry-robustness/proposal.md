# Proposal: Fix CX0 Skill Registry Robustness

## Intent

Post-release audit of v2.62.0 / PR #175 identified two resilience defects in the CX0 skill-registry runtime:
1. Handling of unreadable files (e.g. `EACCES` permissions): `discoverSkills` logs a warning and skips parsing the skill, but `calculateFingerprint` re-reads the file from disk, catching only `ENOENT` and throwing on other read errors, crashing `SessionStart`. Furthermore, reading files twice risks inconsistency if files mutate during startup.
2. In shared skill roots (`~/.agents/skills`), `requireSkills: true` passes if any foreign tool's `SKILL.md` exists, allowing a broken OSpec bundle to overwrite a valid registry cache with foreign-only entries.

We must ensure graceful degradation on unreadable files via single-snapshot discovery and enforce fail-closed OSpec identity in shared roots across Node and Go.

## Scope

### In Scope
- **Single-snapshot reading**: Discover and read file content once during discovery; reuse memory snapshot for SHA-256 fingerprinting without touching the filesystem.
- **Graceful degradation on unreadable files**: Log warning, omit from parsed skills, and treat as empty content in fingerprint without throwing errors.
- **OSpec identity guard**: `requireSkills: true` must verify minimal OSpec identity anchors (`skills/_shared/`, `skills/skill-registry/SKILL.md`, or `.ospec-workflow-install.json`) before accepting a shared root.
- **Node and Go parity**: Mirror fixes in `scripts/lib/skill-registry.js` and `internal/skillreg/skillreg.go`, with parity unit tests.

### Out of Scope
- Modifying cache schema version (remains version 2).
- Changing skill frontmatter or compact rules extraction logic.
- Target installer changes (`install-codex.js` already writes manifests).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `skill-registry`: Single-snapshot file read and unreadable-file graceful degradation during fingerprinting; fail-closed `requireSkills` guard verifying minimal OSpec identity in shared roots.

## Approach

1. In discovery, read each eligible file once into memory. Pass file content along with path in `fingerprintPaths`.
2. `calculateFingerprint` uses snapshot content directly; unreadable files hash as empty content rather than throwing non-ENOENT errors.
3. In Go, update `FingerprintPath` handling so unreadable files are explicitly marked as read (empty content) to prevent fallback re-read attempts.
4. Enhance `requireSkills` logic: assert that discovered skills contain canonical OSpec anchors or an installation manifest, rejecting roots containing solely foreign skills.
5. Add unit tests for permission errors (`EACCES` / unreadable) and foreign-only shared roots in both Node and Go.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/skill-registry.js` | Modified | Single snapshot read, error resilience in fingerprint, OSpec identity guard |
| `internal/skillreg/skillreg.go` | Modified | Go mirror for single snapshot, graceful degradation, and OSpec identity guard |
| `scripts/lib/skill-registry.test.js` | Modified | Tests for unreadable files and foreign-only shared root |
| `internal/skillreg/skillreg_test.go` | Modified | Parity tests for unreadable files and foreign-only shared root |
| `openspec/specs/skill-registry/spec.md` | Modified | Update hash resilience and fail-closed bundle requirements |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Memory overhead buffering skill files | Low | Skills and rules files are small text documents (< 100 KB total) |
| False positive rejection of valid custom OSpec installs | Low | Check multiple standard anchors (`_shared`, `skill-registry`, or manifest) |
| Parity drift between Go and Node implementations | Low | Comprehensive parity tests for both runtimes |

## Rollback Plan

Revert changes to `scripts/lib/skill-registry.js` and `internal/skillreg/skillreg.go`; re-run test suites. Cache format is unchanged, so rollback requires no cache eviction or migration.

## Dependencies

- None.

## Success Criteria

- [ ] Unreadable files (`EACCES`) log a warning, are skipped from `skills`, contribute deterministic empty content to fingerprint, and do not throw in `calculateFingerprint`.
- [ ] Discovery reads each file exactly once from the filesystem.
- [ ] `requireSkills: true` throws if `skillsRoot` contains only foreign skills without OSpec identity anchors.
- [ ] Node and Go parity tests pass and full test suite (`npm test` and `go test ./...`) passes cleanly.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
