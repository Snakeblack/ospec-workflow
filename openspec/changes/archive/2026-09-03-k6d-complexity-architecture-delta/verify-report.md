# Verification Report

**Change**: k6d-complexity-architecture-delta  
**Version**: 2.58.0  
**Mode**: Focused (targeted recheck on successor lineage)  
**Branch**: `fix/k6d-verify-remediation`  
**Result**: **PASS**

## Lineage

| Field | Value |
|-------|-------|
| Predecessor (legacy ID-only) | `sha256:2f5c186e58a713adb6ed49c1e45816cabe98f0943057cc3ba1abf124ddb55ab0` — superseded (`legacy-candidate-recovery-unavailable`) |
| Active lineage | `sha256:e0b42b6acc7c19b2099b2bdef10810df5ae365b24ca461e7d95d65400d4c5b74` (generation 2) |
| Status | `closed` |
| Genesis candidate | `sha256:f1ac29c8ea5d9d6465260dd85c50bf342cfc766b1cbcbdad7c292e2898639ed6` |
| Verified candidate | `sha256:6186c569dbfadb5bca74858371137934b89e2075950a0e4d2e90b4f201a8a98b` |
| Remediation attempts | 1 / 2 |
| Candidate recovery | Present (genesis + current blobs under change root) |

## Targeted Recheck

| Finding | Status | Evidence |
|---------|--------|----------|
| K6D-V001 | resolved | Locale probe (en vs sv Collator override) exit 0; `node --test scripts/lib/complexity-architecture-delta/index.test.js` pass |
| K6D-V002 | resolved | Four invalid fixtures exist; `node --test scripts/lib/k6d-schema-fixtures.test.js` pass |

## Fixes applied (frozen allowed_paths only)

- Canonical record / alternative ordering uses UTF-16 code-unit compare instead of `localeCompare`.
- Negative corpus: `missing-candidate-id`, `missing-report-id`, `malformed-report-id`, `divergent-candidate-binding`.

## Late observations

None.

## Next

Ready for `sdd-archive` (interactive gate).
