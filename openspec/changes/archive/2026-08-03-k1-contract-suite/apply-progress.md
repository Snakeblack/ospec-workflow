# Apply Progress: k1-contract-suite

**Delivery mode**: `size:exception` (maintainer accepted; Decision needed before apply: No; Chain strategy: size-exception). Single oversized PR allowed.

**Branch**: `feat/k1-contract-suite`

**Mode**: Strict TDD

## Batch Summary

- Completed all tasks across Phases 1–9.
- Published `schemas/kernel/` (12 families + manifest + aliases + fixtures + emission claims + parity fixtures).
- Implemented dep-free kernel schema validator, classifier, next_transition, parity, authority canon, and four K1 contract-lint checkers.
- Maturity tags applied in `docs/architecture/harness-evolution.md`; Graph IR authority remains non-implemented.
- Full `npm test` passed; `runAllCheckers` clean on real tree; mutation fixtures covered in checker unit tests.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/lib/canonical-json.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 1.2 | `scripts/lib/canonical-json.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 1.3 | `scripts/lib/authority-canon.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 1.4 | `scripts/lib/authority-canon.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 2.1 | `scripts/lib/kernel-schema-validator.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 2.2 | `scripts/lib/kernel-schema-validator.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 2.3 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 2.4 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.1 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.2 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.3 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.4 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.5 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.6 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 3.7 | `scripts/lib/kernel-schema-fixtures.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 4.1 | `scripts/lib/kernel-aliases.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 4.2 | `scripts/lib/kernel-aliases.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 4.3 | `scripts/lib/kernel-aliases.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 5.1 | `scripts/lib/change-classification.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 5.2 | `scripts/lib/change-classification.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 5.3 | `scripts/lib/change-classification.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 6.1 | `scripts/lib/next-transition.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 6.2 | `scripts/lib/next-transition.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 6.3 | `scripts/lib/transition-parity.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 6.4 | `scripts/lib/transition-parity.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.1 | `scripts/lib/contract-checkers/k1-schema-compat.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.2 | `scripts/lib/contract-checkers/k1-schema-compat.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.3 | `scripts/lib/contract-checkers/k1-emission.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.4 | `scripts/lib/contract-checkers/k1-prose-authority.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.5 | `scripts/lib/contract-checkers/k1-maturity.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 7.6 | `scripts/contract-lint.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 8.1 | `scripts/lib/contract-checkers/k1-maturity.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 8.2 | `scripts/lib/kernel-schema-validator.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 9.1 | `scripts/lib/k1-scope-guard.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 9.2 | `scripts/contract-lint.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |
| 9.3 | `scripts/contract-lint.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed | runtime-receipt authenticated |

### Test Summary
- **Total task cycles**: 36
- **Evidence authenticity**: runtime-authenticated
- **Layers used**: Unit
- **Approval tests**: None — no pure refactor-only tasks
- **size:exception**: stated explicitly above

## Deviations from Design

None — implementation matches design (schemas/kernel tree, domain-prefixed fingerprint, dep-free validator, classifier unwired to routing, four K1 checkers).

## Authoritative Strict TDD Evidence Record

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k1-contract-suite",
  "evidence_mode": "live",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "9aa6c45",
    "genesis_paths": [
      "docs/architecture/harness-evolution.md",
      "schemas/kernel/aliases/v1.json",
      "schemas/kernel/emission-claims.json",
      "schemas/kernel/manifest.json",
      "scripts/lib/authority-canon.js",
      "scripts/lib/canonical-json.js",
      "scripts/lib/change-classification.js",
      "scripts/lib/contract-checkers/k1-emission.js",
      "scripts/lib/contract-checkers/k1-maturity.js",
      "scripts/lib/contract-checkers/k1-prose-authority.js",
      "scripts/lib/contract-checkers/k1-schema-compat.js",
      "scripts/lib/contract-lint.js",
      "scripts/lib/emission-catalogs/k1-emitted.json",
      "scripts/lib/kernel-aliases.js",
      "scripts/lib/kernel-schema-validator.js",
      "scripts/lib/next-transition.js",
      "scripts/lib/transition-parity.js"
    ],
    "files": [
      {
        "path": "docs/architecture/harness-evolution.md",
        "digest": "sha256:2e71a6cc507b5d6300362c0d499d9e441e9731680f1ffbb6211a2b17f8d1ad6c"
      },
      {
        "path": "schemas/kernel/aliases/v1.json",
        "digest": "sha256:5c8570cc440eb91dc05523066901040e760cb3de8f151d8bf794d86b807c70ad"
      },
      {
        "path": "schemas/kernel/emission-claims.json",
        "digest": "sha256:ce9e8f5245f85491bba314efe67844fbee6c830e1e8f54bd692d7f0a59d052ed"
      },
      {
        "path": "schemas/kernel/manifest.json",
        "digest": "sha256:84a69c66725df5e32d3c02b846c0a012819820e0e26c6fe78693fc2fa7a80fb4"
      },
      {
        "path": "scripts/lib/authority-canon.js",
        "digest": "sha256:1cd064259bd44321191d96e9a3469ccf799ce949c5a8eee7a0191493acbaa88f"
      },
      {
        "path": "scripts/lib/canonical-json.js",
        "digest": "sha256:a9e16f1d217f10c3f7c86909c3b352fbc47c6bf467de3d639f531559a4fb96e4"
      },
      {
        "path": "scripts/lib/change-classification.js",
        "digest": "sha256:8103e495bef27a0f16ecb8521722ea3e98f54a57abe0c6fe1c3b145836c909ea"
      },
      {
        "path": "scripts/lib/contract-checkers/k1-emission.js",
        "digest": "sha256:33b69d76c65ac1be1d8f69d88c8e0eb0f28847c1cd7b63b5a82a6ac4570c72e3"
      },
      {
        "path": "scripts/lib/contract-checkers/k1-maturity.js",
        "digest": "sha256:09f32578db5e69c675383f4aaf5e6c681dda90e437bf5217073bd300add4542d"
      },
      {
        "path": "scripts/lib/contract-checkers/k1-prose-authority.js",
        "digest": "sha256:1ec4b618ee4c2226967059a2379cb69a6de8ba407a987acdfa0abc350218ce30"
      },
      {
        "path": "scripts/lib/contract-checkers/k1-schema-compat.js",
        "digest": "sha256:5f933cc9aa9950ec7131e97f49bf048f302679db67cd9557ad9af4e5eb36ac61"
      },
      {
        "path": "scripts/lib/contract-lint.js",
        "digest": "sha256:7384801c494efa4392dcc6cc6807b4bdba40dcd56286847b949acbbedc96e0a9"
      },
      {
        "path": "scripts/lib/emission-catalogs/k1-emitted.json",
        "digest": "sha256:01733916e8c84fc0ff2a2c4a9fa957ccdd1635411fcbad2e924e6603b204d4b8"
      },
      {
        "path": "scripts/lib/kernel-aliases.js",
        "digest": "sha256:eba4981325ad81472afe4c7a538abe698bb1733fc5c89125f636d46ed5fac7a8"
      },
      {
        "path": "scripts/lib/kernel-schema-validator.js",
        "digest": "sha256:530a6a2390eef007635b02f24e4642b7e0fb628040cbecbb06a7d018bddae279"
      },
      {
        "path": "scripts/lib/next-transition.js",
        "digest": "sha256:a650ba85293b6923ad91d5ec82b6558cec4220594d28004f8554bececf44fa96"
      },
      {
        "path": "scripts/lib/transition-parity.js",
        "digest": "sha256:d417124c24e30af19330de8f338128a97f09ad8ac47260a50d3f7ceec6a0d252"
      }
    ]
  },
  "cycles": [
    {
      "task": "1.1",
      "test_file": "scripts/lib/canonical-json.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/canonical-json.test.js",
        "test_digest": "sha256:88bab089e5fe655402f50026f6bc4624c315af3182ec9430009fd5ced0cffc01",
        "command": "node --test scripts/lib/canonical-json.test.js",
        "receipt_id": "sha256:cfd457b0f09ed240f946bcd6f9c4da1430bd94da316aa55b11e8aad6534344d8",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/cfd457b0f09ed240f946bcd6f9c4da1430bd94da316aa55b11e8aad6534344d8.json",
        "red_command": "node --test scripts/lib/canonical-json.test.js",
        "red_receipt_id": "sha256:e5c1b9503d83db97bfd6e1764ed1f09409975bcaa474c023ab88284168a0cece",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/e5c1b9503d83db97bfd6e1764ed1f09409975bcaa474c023ab88284168a0cece.json",
        "red_test_digest": "sha256:88bab089e5fe655402f50026f6bc4624c315af3182ec9430009fd5ced0cffc01"
      }
    },
    {
      "task": "1.2",
      "test_file": "scripts/lib/canonical-json.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/canonical-json.test.js",
        "test_digest": "sha256:88bab089e5fe655402f50026f6bc4624c315af3182ec9430009fd5ced0cffc01",
        "command": "node --test scripts/lib/canonical-json.test.js",
        "receipt_id": "sha256:cfd457b0f09ed240f946bcd6f9c4da1430bd94da316aa55b11e8aad6534344d8",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/cfd457b0f09ed240f946bcd6f9c4da1430bd94da316aa55b11e8aad6534344d8.json",
        "red_command": "node --test scripts/lib/canonical-json.test.js",
        "red_receipt_id": "sha256:e5c1b9503d83db97bfd6e1764ed1f09409975bcaa474c023ab88284168a0cece",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/e5c1b9503d83db97bfd6e1764ed1f09409975bcaa474c023ab88284168a0cece.json",
        "red_test_digest": "sha256:88bab089e5fe655402f50026f6bc4624c315af3182ec9430009fd5ced0cffc01"
      }
    },
    {
      "task": "1.3",
      "test_file": "scripts/lib/authority-canon.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/authority-canon.test.js",
        "test_digest": "sha256:526d41a35b1b2b854038f92f1b478bde1e4c27bac31a855d490fb6b37b507ecd",
        "command": "node --test scripts/lib/authority-canon.test.js",
        "receipt_id": "sha256:168ba1e974315a2828a60e7d88aaff7dfc2326affaf108da6f70316805110c23",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/168ba1e974315a2828a60e7d88aaff7dfc2326affaf108da6f70316805110c23.json",
        "red_command": "node --test scripts/lib/authority-canon.test.js",
        "red_receipt_id": "sha256:129665843900a3151a4b75e02217856b9f5c11017002b9464329325e06b1195a",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/129665843900a3151a4b75e02217856b9f5c11017002b9464329325e06b1195a.json",
        "red_test_digest": "sha256:526d41a35b1b2b854038f92f1b478bde1e4c27bac31a855d490fb6b37b507ecd"
      }
    },
    {
      "task": "1.4",
      "test_file": "scripts/lib/authority-canon.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/authority-canon.test.js",
        "test_digest": "sha256:526d41a35b1b2b854038f92f1b478bde1e4c27bac31a855d490fb6b37b507ecd",
        "command": "node --test scripts/lib/authority-canon.test.js",
        "receipt_id": "sha256:168ba1e974315a2828a60e7d88aaff7dfc2326affaf108da6f70316805110c23",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/168ba1e974315a2828a60e7d88aaff7dfc2326affaf108da6f70316805110c23.json",
        "red_command": "node --test scripts/lib/authority-canon.test.js",
        "red_receipt_id": "sha256:129665843900a3151a4b75e02217856b9f5c11017002b9464329325e06b1195a",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/129665843900a3151a4b75e02217856b9f5c11017002b9464329325e06b1195a.json",
        "red_test_digest": "sha256:526d41a35b1b2b854038f92f1b478bde1e4c27bac31a855d490fb6b37b507ecd"
      }
    },
    {
      "task": "2.1",
      "test_file": "scripts/lib/kernel-schema-validator.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-validator.test.js",
        "test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e",
        "command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "receipt_id": "sha256:f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a.json",
        "red_command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "red_receipt_id": "sha256:87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512.json",
        "red_test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e"
      }
    },
    {
      "task": "2.2",
      "test_file": "scripts/lib/kernel-schema-validator.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-validator.test.js",
        "test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e",
        "command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "receipt_id": "sha256:f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a.json",
        "red_command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "red_receipt_id": "sha256:87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512.json",
        "red_test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e"
      }
    },
    {
      "task": "2.3",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "2.4",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.1",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.2",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.3",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.4",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.5",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.6",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "3.7",
      "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-fixtures.test.js",
        "test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6",
        "command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "receipt_id": "sha256:31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/31336cefa46823bbe9c3f597090ec19cf6173844ee8f9241d3aa66aba6a68a0b.json",
        "red_command": "node --test scripts/lib/kernel-schema-fixtures.test.js",
        "red_receipt_id": "sha256:33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/33980c2de9cd86142066d0e9a00019df653a8ab7331f9574b3b0d39f4c6da182.json",
        "red_test_digest": "sha256:9c07d7657e72132ff32b3f774d970faececd639f9cd6ccd737fd3ca538d31cc6"
      }
    },
    {
      "task": "4.1",
      "test_file": "scripts/lib/kernel-aliases.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-aliases.test.js",
        "test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f",
        "command": "node --test scripts/lib/kernel-aliases.test.js",
        "receipt_id": "sha256:160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b.json",
        "red_command": "node --test scripts/lib/kernel-aliases.test.js",
        "red_receipt_id": "sha256:f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0.json",
        "red_test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f"
      }
    },
    {
      "task": "4.2",
      "test_file": "scripts/lib/kernel-aliases.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-aliases.test.js",
        "test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f",
        "command": "node --test scripts/lib/kernel-aliases.test.js",
        "receipt_id": "sha256:160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b.json",
        "red_command": "node --test scripts/lib/kernel-aliases.test.js",
        "red_receipt_id": "sha256:f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0.json",
        "red_test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f"
      }
    },
    {
      "task": "4.3",
      "test_file": "scripts/lib/kernel-aliases.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-aliases.test.js",
        "test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f",
        "command": "node --test scripts/lib/kernel-aliases.test.js",
        "receipt_id": "sha256:160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/160d28a300af68f347bdbc0afad928a190d92059c9966c96972657c65ad3986b.json",
        "red_command": "node --test scripts/lib/kernel-aliases.test.js",
        "red_receipt_id": "sha256:f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f335ae7cbabfe60a04f6b8b5f61b7f6de71f31d1dd8eb0e054a976aa007f0cd0.json",
        "red_test_digest": "sha256:b77d8dc73e71fc7032a6066dea771efbcc11fafe5d0ef29c2eeaa96f163f311f"
      }
    },
    {
      "task": "5.1",
      "test_file": "scripts/lib/change-classification.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/change-classification.test.js",
        "test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210",
        "command": "node --test scripts/lib/change-classification.test.js",
        "receipt_id": "sha256:d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6.json",
        "red_command": "node --test scripts/lib/change-classification.test.js",
        "red_receipt_id": "sha256:11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13.json",
        "red_test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210"
      }
    },
    {
      "task": "5.2",
      "test_file": "scripts/lib/change-classification.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/change-classification.test.js",
        "test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210",
        "command": "node --test scripts/lib/change-classification.test.js",
        "receipt_id": "sha256:d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6.json",
        "red_command": "node --test scripts/lib/change-classification.test.js",
        "red_receipt_id": "sha256:11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13.json",
        "red_test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210"
      }
    },
    {
      "task": "5.3",
      "test_file": "scripts/lib/change-classification.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/change-classification.test.js",
        "test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210",
        "command": "node --test scripts/lib/change-classification.test.js",
        "receipt_id": "sha256:d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d2b8d351254acc26d4a08ae6cc9fb6b907fccdb130d226bde2433f0ea96c6da6.json",
        "red_command": "node --test scripts/lib/change-classification.test.js",
        "red_receipt_id": "sha256:11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/11c0d677b54d0b592221ba64f303cb1b51042ce45756061da515637fde1dfb13.json",
        "red_test_digest": "sha256:db00899c2fceee6c54f10a57c76bf2fe65ab62882a191389b23ecc219f43d210"
      }
    },
    {
      "task": "6.1",
      "test_file": "scripts/lib/next-transition.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/next-transition.test.js",
        "test_digest": "sha256:17dc0593703aeb4ec6c64350c3281d37ce9ab22ac60f95b29c932da6fe8840d8",
        "command": "node --test scripts/lib/next-transition.test.js",
        "receipt_id": "sha256:fe2dc8aba6868b1fb86d687f0185e44fe4fdac282563c507efefb72195ae4ad9",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/fe2dc8aba6868b1fb86d687f0185e44fe4fdac282563c507efefb72195ae4ad9.json",
        "red_command": "node --test scripts/lib/next-transition.test.js",
        "red_receipt_id": "sha256:b120554e0364642f575e3e466e4005efc906ea95bc210f40e6a77e9c57062a6e",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/b120554e0364642f575e3e466e4005efc906ea95bc210f40e6a77e9c57062a6e.json",
        "red_test_digest": "sha256:17dc0593703aeb4ec6c64350c3281d37ce9ab22ac60f95b29c932da6fe8840d8"
      }
    },
    {
      "task": "6.2",
      "test_file": "scripts/lib/next-transition.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/next-transition.test.js",
        "test_digest": "sha256:17dc0593703aeb4ec6c64350c3281d37ce9ab22ac60f95b29c932da6fe8840d8",
        "command": "node --test scripts/lib/next-transition.test.js",
        "receipt_id": "sha256:fe2dc8aba6868b1fb86d687f0185e44fe4fdac282563c507efefb72195ae4ad9",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/fe2dc8aba6868b1fb86d687f0185e44fe4fdac282563c507efefb72195ae4ad9.json",
        "red_command": "node --test scripts/lib/next-transition.test.js",
        "red_receipt_id": "sha256:b120554e0364642f575e3e466e4005efc906ea95bc210f40e6a77e9c57062a6e",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/b120554e0364642f575e3e466e4005efc906ea95bc210f40e6a77e9c57062a6e.json",
        "red_test_digest": "sha256:17dc0593703aeb4ec6c64350c3281d37ce9ab22ac60f95b29c932da6fe8840d8"
      }
    },
    {
      "task": "6.3",
      "test_file": "scripts/lib/transition-parity.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/transition-parity.test.js",
        "test_digest": "sha256:acd688796df9735544c0c2416999143e7142af9bcb1a310cb72a900146016678",
        "command": "node --test scripts/lib/transition-parity.test.js",
        "receipt_id": "sha256:be371ea3f7df90377b91c5606467a80358d91606c0f0e9aa7b2364a5911222c0",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/be371ea3f7df90377b91c5606467a80358d91606c0f0e9aa7b2364a5911222c0.json",
        "red_command": "node --test scripts/lib/transition-parity.test.js",
        "red_receipt_id": "sha256:9fdb491ec565aebb8acaa964b6bfc870e65542416c9647401a9474b389796bf9",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/9fdb491ec565aebb8acaa964b6bfc870e65542416c9647401a9474b389796bf9.json",
        "red_test_digest": "sha256:acd688796df9735544c0c2416999143e7142af9bcb1a310cb72a900146016678"
      }
    },
    {
      "task": "6.4",
      "test_file": "scripts/lib/transition-parity.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/transition-parity.test.js",
        "test_digest": "sha256:acd688796df9735544c0c2416999143e7142af9bcb1a310cb72a900146016678",
        "command": "node --test scripts/lib/transition-parity.test.js",
        "receipt_id": "sha256:be371ea3f7df90377b91c5606467a80358d91606c0f0e9aa7b2364a5911222c0",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/be371ea3f7df90377b91c5606467a80358d91606c0f0e9aa7b2364a5911222c0.json",
        "red_command": "node --test scripts/lib/transition-parity.test.js",
        "red_receipt_id": "sha256:9fdb491ec565aebb8acaa964b6bfc870e65542416c9647401a9474b389796bf9",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/9fdb491ec565aebb8acaa964b6bfc870e65542416c9647401a9474b389796bf9.json",
        "red_test_digest": "sha256:acd688796df9735544c0c2416999143e7142af9bcb1a310cb72a900146016678"
      }
    },
    {
      "task": "7.1",
      "test_file": "scripts/lib/contract-checkers/k1-schema-compat.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "test_digest": "sha256:09d58b26405f6aebc043bd7fb82be68cf677077c3e1668e47505114a5a62402f",
        "command": "node --test scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "receipt_id": "sha256:5cbe6cc11a024b895c80c1a9c9194bc9fdbea0f80064968a39b9e71835003d70",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/5cbe6cc11a024b895c80c1a9c9194bc9fdbea0f80064968a39b9e71835003d70.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "red_receipt_id": "sha256:a441031ab829d4d758695983b63caca1f2656d09650dd0ae7b3fba11768ab812",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/a441031ab829d4d758695983b63caca1f2656d09650dd0ae7b3fba11768ab812.json",
        "red_test_digest": "sha256:09d58b26405f6aebc043bd7fb82be68cf677077c3e1668e47505114a5a62402f"
      }
    },
    {
      "task": "7.2",
      "test_file": "scripts/lib/contract-checkers/k1-schema-compat.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "test_digest": "sha256:09d58b26405f6aebc043bd7fb82be68cf677077c3e1668e47505114a5a62402f",
        "command": "node --test scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "receipt_id": "sha256:5cbe6cc11a024b895c80c1a9c9194bc9fdbea0f80064968a39b9e71835003d70",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/5cbe6cc11a024b895c80c1a9c9194bc9fdbea0f80064968a39b9e71835003d70.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-schema-compat.test.js",
        "red_receipt_id": "sha256:a441031ab829d4d758695983b63caca1f2656d09650dd0ae7b3fba11768ab812",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/a441031ab829d4d758695983b63caca1f2656d09650dd0ae7b3fba11768ab812.json",
        "red_test_digest": "sha256:09d58b26405f6aebc043bd7fb82be68cf677077c3e1668e47505114a5a62402f"
      }
    },
    {
      "task": "7.3",
      "test_file": "scripts/lib/contract-checkers/k1-emission.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-emission.test.js",
        "test_digest": "sha256:02f34f46d74950ce953d1f3b203260fb94ff9a25932c768913fb8da73a179d27",
        "command": "node --test scripts/lib/contract-checkers/k1-emission.test.js",
        "receipt_id": "sha256:024a9bc59721b48b8772e92980aaa68176146ce0e3ca463328cca929782e2c1a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/024a9bc59721b48b8772e92980aaa68176146ce0e3ca463328cca929782e2c1a.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-emission.test.js",
        "red_receipt_id": "sha256:bcd5c03d46af960894efcf9fbfcfce208f3aaa1c0f4184848b048e0ad935ac4f",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/bcd5c03d46af960894efcf9fbfcfce208f3aaa1c0f4184848b048e0ad935ac4f.json",
        "red_test_digest": "sha256:02f34f46d74950ce953d1f3b203260fb94ff9a25932c768913fb8da73a179d27"
      }
    },
    {
      "task": "7.4",
      "test_file": "scripts/lib/contract-checkers/k1-prose-authority.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-prose-authority.test.js",
        "test_digest": "sha256:83ffeeb277d957b3e87fc80181b234dc458b25cb5e2b32fcfdbde2120eda896a",
        "command": "node --test scripts/lib/contract-checkers/k1-prose-authority.test.js",
        "receipt_id": "sha256:e781981751d7b57e32a3ab22abb32e27f7c4f161374e4b0760066f2d810bcfab",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/e781981751d7b57e32a3ab22abb32e27f7c4f161374e4b0760066f2d810bcfab.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-prose-authority.test.js",
        "red_receipt_id": "sha256:dde4e5366ee96c1ea517404c1f13b8e351ceeee4c5057094a44839a660bc07ae",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/dde4e5366ee96c1ea517404c1f13b8e351ceeee4c5057094a44839a660bc07ae.json",
        "red_test_digest": "sha256:83ffeeb277d957b3e87fc80181b234dc458b25cb5e2b32fcfdbde2120eda896a"
      }
    },
    {
      "task": "7.5",
      "test_file": "scripts/lib/contract-checkers/k1-maturity.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-maturity.test.js",
        "test_digest": "sha256:1371013b8e771b12b4514bd4f37f16f87f32c238ebe28e2e8fe2a9eb21d36179",
        "command": "node --test scripts/lib/contract-checkers/k1-maturity.test.js",
        "receipt_id": "sha256:250f4b604dac6c75c60fbcef3f59ff44a8566b61a0db59ebbcf430fe02315ac5",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/250f4b604dac6c75c60fbcef3f59ff44a8566b61a0db59ebbcf430fe02315ac5.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-maturity.test.js",
        "red_receipt_id": "sha256:d726825571f0bdd2c0e1b244edd7e39505ea94c3e49d26b9c44152419da87a2b",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d726825571f0bdd2c0e1b244edd7e39505ea94c3e49d26b9c44152419da87a2b.json",
        "red_test_digest": "sha256:1371013b8e771b12b4514bd4f37f16f87f32c238ebe28e2e8fe2a9eb21d36179"
      }
    },
    {
      "task": "7.6",
      "test_file": "scripts/contract-lint.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/contract-lint.test.js",
        "test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4",
        "command": "node --test scripts/contract-lint.test.js",
        "receipt_id": "sha256:01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a.json",
        "red_command": "node --test scripts/contract-lint.test.js",
        "red_receipt_id": "sha256:3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f.json",
        "red_test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4"
      }
    },
    {
      "task": "8.1",
      "test_file": "scripts/lib/contract-checkers/k1-maturity.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/contract-checkers/k1-maturity.test.js",
        "test_digest": "sha256:1371013b8e771b12b4514bd4f37f16f87f32c238ebe28e2e8fe2a9eb21d36179",
        "command": "node --test scripts/lib/contract-checkers/k1-maturity.test.js",
        "receipt_id": "sha256:250f4b604dac6c75c60fbcef3f59ff44a8566b61a0db59ebbcf430fe02315ac5",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/250f4b604dac6c75c60fbcef3f59ff44a8566b61a0db59ebbcf430fe02315ac5.json",
        "red_command": "node --test scripts/lib/contract-checkers/k1-maturity.test.js",
        "red_receipt_id": "sha256:d726825571f0bdd2c0e1b244edd7e39505ea94c3e49d26b9c44152419da87a2b",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d726825571f0bdd2c0e1b244edd7e39505ea94c3e49d26b9c44152419da87a2b.json",
        "red_test_digest": "sha256:1371013b8e771b12b4514bd4f37f16f87f32c238ebe28e2e8fe2a9eb21d36179"
      }
    },
    {
      "task": "8.2",
      "test_file": "scripts/lib/kernel-schema-validator.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/kernel-schema-validator.test.js",
        "test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e",
        "command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "receipt_id": "sha256:f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/f6bbaf0c004166381a111207ed9cceb986dfe4345f72ebbe8547c2d60966063a.json",
        "red_command": "node --test scripts/lib/kernel-schema-validator.test.js",
        "red_receipt_id": "sha256:87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/87fe82c77f05560549b35c0deede40a973e8bec71a6f6f96fc4f9eee48e61512.json",
        "red_test_digest": "sha256:f1c8410a9b39ae4ca386f62a603ed80f879c4959a98e0f2d53a4ace9f4033b3e"
      }
    },
    {
      "task": "9.1",
      "test_file": "scripts/lib/k1-scope-guard.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/k1-scope-guard.test.js",
        "test_digest": "sha256:b3e2eed4658b3584642c623c8b1758e8029408a46b8c25204a625f55017db08c",
        "command": "node --test scripts/lib/k1-scope-guard.test.js",
        "receipt_id": "sha256:e59a8930d8b603eea2f0f8abb460e7c35387b715d576ae47854a7f2fc096868c",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/e59a8930d8b603eea2f0f8abb460e7c35387b715d576ae47854a7f2fc096868c.json",
        "red_command": "node --test scripts/lib/k1-scope-guard.test.js",
        "red_receipt_id": "sha256:d57828f79781be10fae0f1222e58da70eb0d1620d9d7206009772d6ecacc35d2",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/d57828f79781be10fae0f1222e58da70eb0d1620d9d7206009772d6ecacc35d2.json",
        "red_test_digest": "sha256:b3e2eed4658b3584642c623c8b1758e8029408a46b8c25204a625f55017db08c"
      }
    },
    {
      "task": "9.2",
      "test_file": "scripts/contract-lint.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/contract-lint.test.js",
        "test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4",
        "command": "node --test scripts/contract-lint.test.js",
        "receipt_id": "sha256:01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a.json",
        "red_command": "node --test scripts/contract-lint.test.js",
        "red_receipt_id": "sha256:3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f.json",
        "red_test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4"
      }
    },
    {
      "task": "9.3",
      "test_file": "scripts/contract-lint.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/contract-lint.test.js",
        "test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4",
        "command": "node --test scripts/contract-lint.test.js",
        "receipt_id": "sha256:01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a",
        "receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/01a1725e5cd60e7bcf133076bb0c4dc243650226d32b35f59f6e891db579f92a.json",
        "red_command": "node --test scripts/contract-lint.test.js",
        "red_receipt_id": "sha256:3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f",
        "red_receipt_path": "openspec/changes/k1-contract-suite/evidence/receipts/3669fc37e09bece1814ee48b47815cbf1d48fd6733da5778046b36f3fbb73e0f.json",
        "red_test_digest": "sha256:adb03e6897ad700218df2f20cf92ec12dfa31cd94f3b5aa3faa83e4f2ac7afe4"
      }
    }
  ]
}
```
