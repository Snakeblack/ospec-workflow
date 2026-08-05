# 4R CRITICAL remediation notes — k2a-1

Strict TDD remediation for frozen findings F-257363d612b4f8ad, F-42a44346728b7090, F-a23fde0a12e81544, F-ea52b9c672375e23.

## Files touched

| File | Change |
|------|--------|
| `scripts/lib/headless-conformance-host.js` | No `proof.probe_digest` fallback for `expectedProbeDigest` |
| `scripts/lib/headless-conformance-host.test.js` | Fail-closed + independent digest scenario |
| `scripts/lib/host-adapters/claude.js` | Primitive + live probe + independent digest for `enforced`; material exposes `expectedProbeDigest` |
| `scripts/lib/host-adapters/claude.test.js` | No-primitive / with-primitive / independent digest tests |
| `scripts/lib/host-adapters/registry.test.js` | Assert independent `expectedProbeDigest` on material |
| `scripts/lib/host-contract/index.js` | `invokePromise.catch(() => {})` after race start |
| `scripts/lib/host-contract/index.test.js` | Late-reject-after-timeout unhandledRejection regression |

## Finding → fix

- **F-257363d612b4f8ad**: headless uses only `entry.expectedProbeDigest`; missing → verification fail-closed.
- **F-42a44346728b7090**: `enforced` only when `hasHostPrimitive` ∧ live probe ∧ verify against independent digest.
- **F-a23fde0a12e81544**: JSDoc + `getClaudeProofMaterial` / `verifyAllClaudeEnforcedProofs` use independent digest (not circular `proof.probe_digest`).
- **F-ea52b9c672375e23**: explicit settlement on losing invoke after timeout/abort race.

## Test commands

```bash
node --test scripts/lib/headless-conformance-host.test.js scripts/lib/host-adapters/claude.test.js scripts/lib/host-adapters/registry.test.js scripts/lib/host-contract/index.test.js
npm test
```
