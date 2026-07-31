# Apply Progress: Fixed-Policy Reference Baseline (O2B)

Status: complete and verified — clean live TDD replay captured; no authorized live baseline was run or written.

Delivery: single `size:exception` work unit, as approved. The implementation is 236 changed source/test/documentation lines, below the 650–850 forecast; it did not cross the workload-escalation threshold.

## Completed tasks

- [x] 1.1–1.3 Fixed nine-profile catalog and 3/3 smoke identity, compatibility descriptor, and fail-closed live/cache provenance.
- [x] 2.1–2.3 Pure 9/9 candidate validation, deterministic canonical baseline ID, Markdown/JSON rendering, and final atomic replacement boundary.
- [x] 3.1–3.3 Explicit fixed suite selection, smoke diagnostics without publication, and preserved public-CLI authority boundary.
- [x] 4.1–4.4 Focused unit/integration tests, documentation, and this strict-TDD evidence.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `scripts/evals/safe-export.test.js` | Unit | 7/7 passed | Added fixed catalog contract; failed because exports were absent | 8/8 passed | Nine identities plus smoke 3/3 | Frozen shared arrays | Every manifest seals fixed policy and synthetic fixture identity. |
| 1.2–1.3 | `scripts/evals/live-driver.test.js` | Integration | 26/26 passed | Added fixed-suite selection contract; failed because details API was absent | 27/27 passed | Extended vs smoke branches | Descriptor/cache centralized | Cache compatibility stays exact; arbitrary public CLI/test paths remain rejected. |
| 2.1–2.3 | `scripts/evals/lib/benchmark.test.js` | Unit | 14/14 passed | Added candidate/schema/provenance tests; failed because candidate API was absent | 15/15 passed | Valid, missing, duplicate, manual-origin and ID-mutation paths | Pure validators and canonical JSON helpers | Local candidates are test-only; production publishing requires sealed live results. |
| 3.1–3.3 | `scripts/evals/run.test.js` | Integration | 13/13 passed | Existing public-CLI guard retained | 13/13 passed | `all`/`initial` smoke and `extended` nine profiles | Reused canonical catalog exports | No adaptive policy, promotion gate, CI flow, or synthetic publisher was introduced. |
| 4.1–4.4 | `scripts/evals/README.md` and focal eval tests | Documentation / integration | Focal suites green | CLI contract documented | Focal suites green | Normal and fail-closed paths covered | Concise fixed-policy section | The future live command is documented but was deliberately not run. |

## Test commands

- `node --test scripts/evals/safe-export.test.js` — 8 passed
- `node --test scripts/evals/lib/benchmark.test.js` — 15 passed
- `node --test scripts/evals/run.test.js` — 13 passed
- `node --test scripts/evals/live-driver.test.js` — 27 passed

## Baseline condition

`scripts/evals/reports/reference-baseline.md` remains absent. The environment supplied no explicit host/model authorization, so this apply phase did not execute `node scripts/evals/live-driver.js extended` and did not synthesize the nine rows. A later authorized live execution must supply all nine sealed, comparable profiles before the atomic publisher can create the artifact.

## Authoritative clean replay (2026-07-31)

- Clean base: `90c387a2c8643dc2afd03a4e1489750499b48b4b`.
- Final tests were copied byte-for-byte before production. RED was real: `safe-export` 7/8, `benchmark` 14/17, `live-driver` 25/29; the unchanged `run` safety net remained 13/13.
- Final production and eval documentation were then copied byte-for-byte. GREEN was 8/8, 17/17, 13/13, and 29/29.
- TRIANGULATE/REFACTOR: combined focal run 67/67; `npm test` 1537/1537.
- Final tracked `scripts/evals/**` comparison: 67/67 files byte-equivalent to the workspace candidate.
- Replay manifest receipt: `sha256:0a506dd039d5931fb058e1707cd634ebd4d0907f2b491da209a8ea3a61e2ddd5`.
- RED group receipt: `sha256:183f960dcd16428133633485f173694c46f6e036f8d9088e94d1f246a0b407f5`.
- GREEN receipts: safe-export `sha256:20efb6d018cd614b8ee533192fda252dd82f2b2d82ba579957528c6552b4c3c2`; benchmark `sha256:fddedbc344322ef7aa9455a21a6b38a7b8cbab6d8e0e327aaf8269cc177e741c`; run `sha256:258811585867f5cb3390d11e64a33d03fd372535b405c69980dcb6b9968eb063`; live-driver `sha256:87a44e86aeeb1e00bb3cd30eff3ae5c12751765055aada3f1b2656ec6ea0c3b5`.
- No historical exception receipt was read or written. The replay creates new live evidence; it does not authenticate the superseded `working-tree` chronology.

```json:strict-tdd-evidence
{
  "change": "fixed-policy-reference-baseline",
  "cycles": [
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/safe-export.test.js",
        "receipt_id": "sha256:3403330b32dff1bed9bc0309e99da969db5f2a596e542656eabf72fa970c0905",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/3403330b32dff1bed9bc0309e99da969db5f2a596e542656eabf72fa970c0905.json",
        "red_command": "node --test scripts/evals/safe-export.test.js",
        "red_receipt_id": "sha256:032a04d9639f28f4b53b99bef19b4c14b0cbf171c33e0ab75272462cdcb78269",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/032a04d9639f28f4b53b99bef19b4c14b0cbf171c33e0ab75272462cdcb78269.json",
        "red_test_digest": "sha256:e682c23719d2e7d698f1aa10840eba3e7f60596f2b853a626ed80ef53e43a13f",
        "source": "runtime-receipt",
        "test_digest": "sha256:e682c23719d2e7d698f1aa10840eba3e7f60596f2b853a626ed80ef53e43a13f",
        "test_file": "scripts/evals/safe-export.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "1.1",
      "test_file": "scripts/evals/safe-export.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "1.2",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "1.3",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "2.1",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "2.2",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "2.3",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "3.1",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "3.2",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test --test-name-pattern \"public benchmark remains capability-free\" scripts/evals/run.test.js",
        "receipt_id": "sha256:fd64746ed0f31ff7a7686cea25f548a8a223648a4182e64961c714b75494fe52",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fd64746ed0f31ff7a7686cea25f548a8a223648a4182e64961c714b75494fe52.json",
        "red_command": "node --test --test-name-pattern \"public benchmark remains capability-free\" scripts/evals/run.test.js",
        "red_receipt_id": "sha256:4451868f3908aee777d570529c0d78805d0ed498867967a6b4617ca318720217",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/4451868f3908aee777d570529c0d78805d0ed498867967a6b4617ca318720217.json",
        "red_test_digest": "sha256:c3914dd8613d9d0ff025bf104c4d6caaffef85891d5a785aec901d65edeb2184",
        "source": "runtime-receipt",
        "test_digest": "sha256:c3914dd8613d9d0ff025bf104c4d6caaffef85891d5a785aec901d65edeb2184",
        "test_file": "scripts/evals/run.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "3.3",
      "test_file": "scripts/evals/run.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "4.1",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "4.2",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "5.1",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "5.2",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/lib/benchmark.test.js",
        "receipt_id": "sha256:d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/d9bf27822c55cce9cdfa719addd16ef59ebacd7309666a1055b22b65d5290146.json",
        "red_command": "node --test scripts/evals/lib/benchmark.test.js",
        "red_receipt_id": "sha256:635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/635cd8fc27a09b27fecec11a38b3dbc63fc4d67416ab8f32f9c090121f2f325b.json",
        "red_test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "source": "runtime-receipt",
        "test_digest": "sha256:aba55a2ae7fc86ab3cf3ea28f5fcbd37e9e958c71b6fbb749676064f0f37d7ef",
        "test_file": "scripts/evals/lib/benchmark.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "5.3",
      "test_file": "scripts/evals/lib/benchmark.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "unit",
      "provenance": {
        "command": "node --test scripts/evals/safe-export.test.js",
        "receipt_id": "sha256:3403330b32dff1bed9bc0309e99da969db5f2a596e542656eabf72fa970c0905",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/3403330b32dff1bed9bc0309e99da969db5f2a596e542656eabf72fa970c0905.json",
        "red_command": "node --test scripts/evals/safe-export.test.js",
        "red_receipt_id": "sha256:032a04d9639f28f4b53b99bef19b4c14b0cbf171c33e0ab75272462cdcb78269",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/032a04d9639f28f4b53b99bef19b4c14b0cbf171c33e0ab75272462cdcb78269.json",
        "red_test_digest": "sha256:e682c23719d2e7d698f1aa10840eba3e7f60596f2b853a626ed80ef53e43a13f",
        "source": "runtime-receipt",
        "test_digest": "sha256:e682c23719d2e7d698f1aa10840eba3e7f60596f2b853a626ed80ef53e43a13f",
        "test_file": "scripts/evals/safe-export.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "5.5",
      "test_file": "scripts/evals/safe-export.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "6.1",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    },
    {
      "green": "✅ Passed",
      "layer": "integration",
      "provenance": {
        "command": "node --test scripts/evals/live-driver.test.js",
        "receipt_id": "sha256:fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72",
        "receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/fe1ac5844a42aeef4a3e5b7da580e0e672c6dd3eb93c3c9c7af28d3808beff72.json",
        "red_command": "node --test scripts/evals/live-driver.test.js",
        "red_receipt_id": "sha256:92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51",
        "red_receipt_path": "openspec/changes/fixed-policy-reference-baseline/evidence/receipts/92f6f6f85673991148b8d3a05527538ead88b1c18def56f1070fa2c762802f51.json",
        "red_test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "source": "runtime-receipt",
        "test_digest": "sha256:bd8759b74a25c44f294d25fd95296698c8cb07a40cfe347e6e041243ae1eb4d4",
        "test_file": "scripts/evals/live-driver.test.js"
      },
      "red": "✅ Written",
      "refactor": "✅ Passed",
      "safety_net": "✅ Passed",
      "task": "6.3",
      "test_file": "scripts/evals/live-driver.test.js",
      "triangulate": "✅ Written"
    }
  ],
  "evidence_mode": "live",
  "functional_snapshot": {
    "base_tree": "90c387a",
    "files": [
      {
        "digest": "sha256:66903c48c3729701432e220b5bff4b1ae05cade8ce1bbbe5ada6f94d845eb0e0",
        "path": "scripts/evals/lib/benchmark.js"
      },
      {
        "digest": "sha256:614ef4728697b04df0ff1d82486a8301e017a5cf707579023a5c4cd158d2aa69",
        "path": "scripts/evals/live-driver.js"
      },
      {
        "digest": "sha256:4bbfb2e07fbda4a8c2afd4eb131b53d94a2cb128d6135122ca2183498be45bdc",
        "path": "scripts/evals/run.js"
      },
      {
        "digest": "sha256:32253997114168cf7137dcdfad258beb02366d9ebae208fffc3a1dd2eefb4caa",
        "path": "scripts/evals/safe-export.js"
      }
    ],
    "genesis_paths": [
      "scripts/evals/lib/benchmark.js",
      "scripts/evals/live-driver.js",
      "scripts/evals/run.js",
      "scripts/evals/safe-export.js"
    ],
    "projection": "strict-tdd-functional-v1"
  },
  "replay": {
    "authentication": {
      "digest_policy": "sha256-raw-v1",
      "receipt_schema": 1,
      "red_3_1_source": "live-driver actual failure",
      "red_3_3_source": "90c387a replay actual failure",
      "test_digest_policy": "sha256-lf-v1"
    },
    "byte_equivalent": true,
    "focal_result": "67/67 passed",
    "global_result": "1537/1537 passed",
    "live_extended_executed": false,
    "manifest_digest": "sha256:0a506dd039d5931fb058e1707cd634ebd4d0907f2b491da209a8ea3a61e2ddd5",
    "red_group_receipt_id": "sha256:183f960dcd16428133633485f173694c46f6e036f8d9088e94d1f246a0b407f5",
    "refactor_receipt_id": "sha256:cd357a43d7c857b96db0d8535b0daa0d9e4224d71ce5b4f755153cb2ed768cbc",
    "tracked_files_compared": 67,
    "triangulate_receipt_id": "sha256:0481f8f010bd12376caa4716dfba4f2de9903d1c3082a057adf0cd6c6fcf23dd",
    "worktree_base": "90c387a2c8643dc2afd03a4e1489750499b48b4b"
  },
  "schema_version": 1
}
```

## Final Derived Markdown Table


| 1.1 | scripts/evals/safe-export.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 1.2 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 1.3 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 2.1 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 2.2 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 2.3 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 3.1 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 3.2 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 3.3 | scripts/evals/run.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 4.1 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 4.2 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 5.1 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 5.2 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 5.3 | scripts/evals/lib/benchmark.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 5.5 | scripts/evals/safe-export.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 6.1 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 6.3 | scripts/evals/live-driver.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |

## Remediation batch 5.1–5.3 (2026-07-29)

- [x] 5.1 Runtime coordinator tests cover fresh smoke, compatible-cache smoke, and extended-only publication; property-descriptor retention preserves sealed non-enumerable evidence.
- [x] 5.2 Candidate validation now rejects missing baseline IDs, declared identity/catalog drift, descriptor-mismatched fixture digests, and duplicate builder input.
- [x] 5.3 Quality derives only from `state_status: verified` plus accepted canonical verify/4R outcomes; cache payloads retain that evidence for a compatible resume.

### TDD Cycle Evidence — remediation

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 5.1 | `scripts/evals/live-driver.test.js` | Integration | 27/27 passed | Test helper absent; 2 tests failed | 29/29 passed | fresh/cache smoke + extended publication | descriptor-preserving retention | No real live suite or baseline ran. |
| 5.2 | `scripts/evals/lib/benchmark.test.js` | Unit | 15/15 passed | missing ID accepted | 16/16 passed | identity/catalog, fixture, duplicate | pure fail-closed validator | Stable error codes. |
| 5.3 | `scripts/evals/lib/benchmark.test.js` | Unit | 16/16 passed | derivation function absent | 17/17 passed | pass/warning/blocked/invalid 4R | isolated quality derivation | Zero defects cannot authorize blocked state. |

### Verification and snapshots

- `node --test scripts/evals/live-driver.test.js` — 29 passed.
- `node --test scripts/evals/lib/benchmark.test.js` — 17 passed.
- `npm test` executed; no `live-driver.js extended` command ran.
- `benchmark.js`: `sha256:6a9586758cba703c7cf0880dbc598d87f32b992abd66bded7e9dc973ca9f86d6`
- `live-driver.js`: `sha256:01787d5cde38fca15f28996475ec262945d5a2fc1e412f68df638b43fde44e4d`
- `benchmark.test.js`: `sha256:07f158bf4d4f5656459388d64b10bb9640feba3d9ba90aa3822593f713d20723`
- `live-driver.test.js`: `sha256:bb7f9303eb2bf8954d8e23cf3f1f272c1d37d8ae0f1e21ef02df3deaf5673d9a`

Remaining: 5.4 authoritative Strict-TDD evidence remediation, 5.5 manifest/productive-coordinator reconciliation, and 5.6 full delta-spec matrix revalidation. The live reference baseline remains absent because no authorization was supplied.

## Remediation batch 5.4–5.6 (2026-07-29)

- [x] 5.4 Replaced the invalid authoritative record with one schema-v1 `historical` record, 11 individual coding-task cycles, permitted markers/provenance, current `sha256:` snapshots, and an equivalent derived table. The validator reports `legacy-unverifiable`, deliberately distinguishing historical working-tree provenance from a fabricated live receipt.
- [x] 5.5 Added direct `benchmark_contract.policy`, `fixture_source`, and `synthetic_payload` fields required by the design, while retaining `fixed_policy` for compatibility. The catalog test exercises every reference profile.
- [x] 5.6 Revalidated the complete local delta matrix with 67 focal eval tests and `npm test`; the fixed-policy live baseline is still absent because no host/model authorization was supplied.

### TDD Cycle Evidence — continuation

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 5.4 | `scripts/lib/strict-tdd-evidence-remediation.js` validation | Contract | Existing validator inspected | Invalid record rejected by schema validator | 11/11 historical cycles validate | Snapshot, marker, provenance and rendering checks | One record plus derived table | Historical provenance remains explicitly legacy-unverifiable. |
| 5.5 | `scripts/evals/safe-export.test.js` | Unit | 8/8 passed | Direct design fields were `undefined` | 8/8 passed | All nine reference manifests | Kept nested alias for compatibility | No manifest behavior outside fixed policy changed. |
| 5.6 | Four focal eval suites + `npm test` | Integration | 67/67 focal passed | Baseline-absence guard would fail if a live artifact existed | 67/67 focal and global suite passed | Smoke, extended contract, validation and public CLI branches | Consolidated verifiable matrix evidence | `live-driver.js extended` was not executed. |

### Delta-spec matrix revalidation

| MUST scenario group | Local evidence | Result |
|---|---|---|
| Fixed 9/9 candidate, identity, provenance, fixture and quality gates | `benchmark.test.js` + `live-driver.test.js` | PASS |
| Smoke diagnostic and extended-only publication boundary | `live-driver.test.js` runtime coordinator tests | PASS |
| Fixed catalog and design-shaped manifest contract | `safe-export.test.js` across nine profiles | PASS |
| Public benchmark replay rejection and atomic publication primitive | `run.test.js` | PASS |
| Seven golden runner scenarios and structural attribution | `npm test` | PASS |
| Live baseline production | filesystem guard only; authorization absent | NOT RUN (expected) |

### Final verification

- Strict-TDD authoritative record: valid, 11/11 cycles, derived rendering equivalent.
- Focal eval suites: 67 passed, 0 failed.
- `npm test`: passed.
- `scripts/evals/reports/reference-baseline.md`: absent. No live baseline was created or synthesized.
- Delivery: approved `size:exception`; implementation/remediation remained below the 850–1,100 line forecast and did not trigger workload escalation.

## Remediation batch 6.1–6.4 (complete)

- [x] 6.1 Offline recovery now derives and caches canonical `quality_evidence`; compatible cache resumes preserve verified evidence.
- [x] 6.2 A clean replay from `90c387a` captured byte-exact final tests before production, real RED/GREEN runtime receipts, current digests, and 17/17 live cycles. The superseded historical chronology was not retroactively authenticated.
- [x] 6.3 Extended runtime seam now invokes the real nine-profile candidate builder and renderer; doubles remain only at execution/cache/publish boundaries.
- [x] 6.4 The 16 delta MUST scenarios were revalidated locally: four focal suites 67 passed and `npm test` passed. The authorized live baseline remains absent and `live-driver.js extended` was not run.

### TDD Cycle Evidence — batch 6

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 6.1 | `scripts/evals/live-driver.test.js` | Integration | 29/29 passed | recovery cache lacked quality evidence | 29/29 passed | fresh, recovery, compatible cache | canonical quality payload | Invalid quality remains rejected. |
| 6.2 | evidence validator + replay receipts | Evidence | Clean base `90c387a` | RED group receipt records 1/3/4 intended failures | live record validates 17/17 | 67/67 focal | 1537/1537 global | No historical exception or live baseline execution. |
| 6.3 | `scripts/evals/live-driver.test.js` | Integration | 29/29 passed | prior seam bypassed builder/renderer | 29/29 passed | nine profiles and canonical payload | external-boundary doubles only | No live suite or baseline file. |
| 6.4 | focal suites + `npm test` | Integration | 67 focal passed | baseline-absence guard | all passed | 16 MUST groups | consolidated matrix | No authorized live baseline. |
