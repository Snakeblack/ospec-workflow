# Tasks: Fix CX0 Skill Registry Robustness

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-skill-registry-004 / Single-snapshot read prevents redundant disk I/O | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Buffer read once in discovery; calculateFingerprint hashes snapshot in memory |
| REQ-skill-registry-004 / Unreadable skill file degrades gracefully during discovery | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Emits stderr warning, omits from parsed skills, hashes 0-byte buffer |
| REQ-skill-registry-004 / Direct calculateFingerprint on unreadable file degrades gracefully | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Catches read errors to 0-byte buffer without throwing unhandled error |
| REQ-skill-registry-004 / Node and Go cross-runtime parity on unreadable files | MUST | `scripts/lib/skill-registry.test.js`, `internal/skillreg/skillreg_test.go` | covered-by-design | Parity tests assert identical SHA-256 digest on identical fixtures |
| REQ-skill-registry-002 / Broken required bundle with no skills fails closed | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Throws error naming required root when 0 SKILL.md files exist |
| REQ-skill-registry-002 / Shared skills root with foreign-only skills fails closed | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Validates OSpec identity anchors in external roots; fails closed without them |
| REQ-skill-registry-002 / Shared skills root with canonical OSpec identity anchor succeeds | MUST | `scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go` | covered-by-design | Permits discovery when _shared/, skill-registry/SKILL.md, or manifest is present |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-240 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Robustez y snapshot único en Node y Go con paridad cruzada | Single PR | Cobertura completa bajo presupuesto de 400 líneas |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Node.js Test-Driven Implementation

- [x] 1.1 Add failing unit tests (RED) in `scripts/lib/skill-registry.test.js` for unreadable file degradation during discovery, direct calculateFingerprint resilience against read errors, single-snapshot I/O count verification, and fail-closed rejection of foreign-only external roots when requireSkills is true [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 1.2 Update existing external skills unit test in `scripts/lib/skill-registry.test.js` to include a canonical OSpec identity anchor [REQ-skill-registry-002]
- [x] 1.3 Implement single-snapshot in-memory buffering, unreadable file graceful degradation, and hasOspecIdentity anchor verification (GREEN) in `scripts/lib/skill-registry.js` [REQ-skill-registry-004, REQ-skill-registry-002]

## Phase 2: Go Test-Driven Implementation

- [x] 2.1 Add failing unit tests (RED) in `internal/skillreg/skillreg_test.go` for unreadable skill degradation during DiscoverSkills, direct CalculateFingerprint resilience, missing skills root, and foreign-only external skills root rejection [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 2.2 Implement explicit 0-byte Content on read error, direct CalculateFingerprint resilience, and hasOspecIdentity anchor verification (GREEN) in `internal/skillreg/skillreg.go` [REQ-skill-registry-004, REQ-skill-registry-002]

## Phase 3: Parity and Regression Verification

- [x] 3.1 Implement cross-runtime parity test in `internal/skillreg/skillreg_test.go` verifying identical SHA-256 fingerprint digests between Node and Go on fixtures with unreadable files [REQ-skill-registry-004]
- [x] 3.2 Run full Node.js test suite (`npm test`) and verify 100% pass with zero regressions [REQ-skill-registry-004, REQ-skill-registry-002]
- [x] 3.3 Run full Go test suite (`go test ./...`) and verify 100% pass with zero regressions [REQ-skill-registry-004, REQ-skill-registry-002]
