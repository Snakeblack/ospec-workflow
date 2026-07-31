## Verification Report

**Change**: fixed-policy-reference-baseline\
**Verified at**: 2026-07-31\
**Mode**: Strict TDD clean replay\
**Base tree**: `90c387a2c8643dc2afd03a4e1489750499b48b4b`\
**Verdict**: **PASS**

### Executive Summary

The previous functional result remains green: all 16 MUST scenarios comply. The
Strict TDD provenance blocker is resolved by content-addressed, repository-confined
runtime receipts for every GREEN and RED cycle. Historical `working-tree` evidence
was not retroactively authenticated and the legacy exception was not used.

The replay copied byte-exact final tests onto `90c387a` before production,
observed intended RED failures, copied byte-exact final production/docs, then
observed GREEN, triangulation, and refactor/global verification. The final
worktree matches all 67 tracked files under `scripts/evals/**` byte-for-byte.

### Clean Replay Evidence

| Stage | Command / check | Result |
|---|---|---|
| RED | `node --test scripts/evals/safe-export.test.js` | 7/8; exit 1 |
| RED | `node --test scripts/evals/lib/benchmark.test.js` | 14/17; exit 1 |
| RED 3.1 | `node --test scripts/evals/live-driver.test.js` | intended assertion failure; exit 1 |
| RED 3.3 | focal public-CLI/live-driver capability-boundary test on `90c387a` | intended missing coordinator; exit 1 |
| RED | `node --test scripts/evals/live-driver.test.js` | 25/29; exit 1 |
| GREEN | Four focal files, individually | 8/8 + 17/17 + 13/13 + 29/29 |
| TRIANGULATE / REFACTOR | Four focal files, combined | 67/67; exit 0 |
| Global | `npm test` | 1537/1537; exit 0 |
| Candidate identity | Tracked `scripts/evals/**` comparison | 67/67 byte-equivalent |

The original replay receipts remain provenance inputs. Each accepted cycle now points
to a stricter wrapper receipt under
`openspec/changes/fixed-policy-reference-baseline/evidence/receipts/`; the validator
rehashes the receipt and stdout/stderr bytes and checks its candidate, base tree,
test/digest, command, exit code, and outcome.

Original replay receipts:

- Manifest: `sha256:0a506dd039d5931fb058e1707cd634ebd4d0907f2b491da209a8ea3a61e2ddd5`
- RED group: `sha256:183f960dcd16428133633485f173694c46f6e036f8d9088e94d1f246a0b407f5`
- TRIANGULATE / REFACTOR: `sha256:0481f8f010bd12376caa4716dfba4f2de9903d1c3082a057adf0cd6c6fcf23dd`
- Global: `sha256:cd357a43d7c857b96db0d8535b0daa0d9e4224d71ce5b4f755153cb2ed768cbc`

### Strict TDD Compliance

| Check | Result | Details |
|---|---|---|
| Schema-v1 record | PASS | Exactly one authoritative record |
| Evidence mode | PASS | `live` |
| Base tree | PASS | `90c387a` |
| Coding-task coverage | PASS | 17/17 unique expected task IDs |
| Provenance source | PASS | 17/17 `runtime-receipt`; zero `working-tree` |
| Runtime receipt authenticity | PASS | 34/34 GREEN/RED receipts rehashed and bound |
| Current functional digests | PASS | 4/4 match workspace bytes |
| Current test digests | PASS | 4/4 match workspace bytes |
| Validator | PASS | `authenticity: runtime-authenticated` |
| Legacy unverifiable cycles | PASS | 0 |

The 17 code tasks are `1.1`, `1.2`, `1.3`, `2.1`, `2.2`, `2.3`, `3.1`,
`3.2`, `3.3`, `4.1`, `4.2`, `5.1`, `5.2`, `5.3`, `5.5`, `6.1`, and `6.3`.

### Functional Compliance

All 16 MUST scenario groups remain PASS:

- Fixed 9/9 identity, provenance, fixture, quality, and fail-closed candidate validation.
- Smoke diagnostics remain non-publishing; extended remains the only publication path.
- Offline recovery and compatible-cache resume preserve canonical quality evidence.
- The extended seam uses the real candidate builder and renderer.
- Public benchmark replay remains rejected and atomic publication remains protected.

### Historical Antecedent

The earlier report correctly identified a CRITICAL provenance gap: its historical
record covered 11/17 tasks, used `source: working-tree`, and had stale live-driver
digests. That record has been replaced. No claim is made that its original
chronology became authenticated; the clean replay establishes a new, complete
live chronology from the declared base.

### Scope and Baseline Guard

- `scripts/evals/reports/reference-baseline.md` was not created or modified.
- `node scripts/evals/live-driver.js extended` was not executed.
- No historical-exception receipt was read or written.
- No model process or authorized live benchmark was started.

### Findings

**CRITICAL**: None.\
**WARNING**: None.

### Final Verdict

**PASS** — 16/16 MUST scenarios, 17/17 live cycles with authenticated GREEN and
RED receipts, all focal checks, and the full `npm test` gate pass against candidate
`sha256:330cf63a29f4c6d79eb988632596c9ac0e9b9992715564f2e60d2aa9b8f63348`.
