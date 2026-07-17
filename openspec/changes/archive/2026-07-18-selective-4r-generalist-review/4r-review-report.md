# Selective 4R Review Report

## Gate decision

- Classification: `normal`
- Generalist: `needs-specialist`
- Selected specialists: `risk`, `reliability`
- Skipped by normal cap: `resilience`, `readability`
- Evidence fingerprint: `sha256:58342d15fc09d7b3357ebe96fe1725ef63d08fa2f5e6bc1f2ce8242657956a91`

## Findings

### CRITICAL

1. **Risk: incomplete decisions can bypass fail-closed.** `planReviewGate` validates only a shallow subset when the adapter supplies no validation errors, so a fabricated incomplete decision can return `archive_allowed: true`. The reducer must invoke full decision validation itself and tests must use contract-valid positive fixtures.
2. **Reliability: raw diff scanning contaminates specialist selection.** `diffFacts` scans headers, context, deletions, specs and fixtures, causing non-executable terms to outrank the generalist and consume the normal cap. Parse added executable hunks per file and exclude non-runtime evidence from real-diff facts.
3. **Reliability: omitted evidence fields fail open.** Missing or non-array paths, capabilities, dependencies, operation types, verify findings and design risks normalize to empty arrays. Require every declared field and type before fingerprinting.

### WARNING

1. **Risk: unrestricted generalist reason may persist secrets.** Bound reason length/content, prohibit verbatim diff or credential-like material, and test redaction/rejection with a synthetic token.
2. **Reliability: bounded rereview cannot distinguish fresh dimensions.** Pass the prior validated decision and add only owner dimensions plus newly selected dimensions.
3. **Reliability: successful recovery retains stale blocker fields.** Clear or resolve `blocker_reason` and `validation_errors` on valid blocked-to-ready/done transitions.

## Remediation route

Fix all six findings with fresh RED evidence, rerun focused and full tests, rerun `sdd-verify`, then rerun only `review-risk` and `review-reliability`.

## Bounded rereview 1

After R5 and verify R3 passed, the bounded rerun closed the incomplete-decision bypass, missing-array validation, stale-blocker cleanup, and stable non-owner rereview defects. It reopened three CRITICAL findings:

1. **Risk:** free-form `generalist.reason` still accepts JWT, Bearer and AWS access-key shapes before persistence.
2. **Reliability:** added comments in runtime files still produce executable diff facts and can displace the owner dimension under the normal cap.
3. **Reliability:** a non-empty string without unified-diff headers/hunks is accepted as real evidence.

Route: R6 TDD remediation, independent `sdd-verify`, then rerun only `review-risk` and `review-reliability` again.
