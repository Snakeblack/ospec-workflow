# Apply Progress: K3 Readiness Remediation

## Batch 1 — runtime, schema, generation, and documentation

- [x] 1.1–1.4: Added RED tests and implemented the single Candidate relation/lineage authority. `freezeCandidate()` now requires a complete frozen `predecessorCandidate`; bare IDs are rejected.
- [x] 1.6: Candidate v2 relation schema now permits only `exact`, `changed`, `ambiguous`, and `unknown`.
- [x] 3.1–3.2, 3.4: Added generation coverage, included the K3 runtime and schema tree in generated targets, then regenerated all six configured targets.
- [x] 4.3: Documented K3 remediation as the prerequisite for K4a eligibility without adding K4a behavior.
- [~] 2.*, 4.1–4.2, 4.4–4.5, 5.*: Pending. Historical reconciliation requires the specified digest-pinned test and fixtures before any allowlisted state edit; strict-TDD evidence record is therefore not yet complete.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1–1.4 | `scripts/lib/execution-identities/index.test.js` | Unit | 62/62 pass | 2 failures observed | 64/64 pass | equal, changed, bare-ID, persisted mismatch, retired vocabulary | relation primitive extracted | Runtime execution captured with `node --test`. |
| 1.6 | `scripts/lib/k3-schema-fixtures.test.js` | Contract | 14/14 pass | Covered by runtime RED | 14/14 pass | valid root / retired invalid | None needed | v1/K1 baseline test remains green. |
| 3.1–3.4 | `scripts/configure/cli.test.js` | Integration | 30/30 pass | missing schema asset observed | 31/31 pass | six target profiles | curated runtime roots | All six official build commands succeeded. |
| 4.3 | documentation review | Documentation | N/A | N/A | static review | K3/K4a references | None needed | No runtime behavior added. |

## Continuation

Next batch must add the required identity fixtures, distribution parity test, and digest-pinned historical reconciliation test before mutating any archive state metadata. It must then run the complete strict-TDD evidence flow and `npm test`.

## Batch 2 — historical reconciliation and regression

- [x] 4.1–4.2: Added a RED reconciliation guard for the exact three-state allowlist. It initially failed on `k3-identities-boundary-closure`; after evidence-backed metadata-only reconciliation, it passes and hashes every sibling file without mutation.
- [x] 5.2: `npm test` completed successfully (`2104` pass, `0` fail, `2` skipped).
- [~] 2.*, 3.3, 3.5, 4.4–4.5, 5.1, 5.3–5.4: Fixtures, stronger distribution parity, recorded immutable before/after snapshots, and the authoritative strict-TDD JSON evidence remain incomplete.

## Batch 3 — immutable-history proof blocked

- [~] 4.4–4.5, 5.3–5.4: A fresh Git-blob snapshot test found a pre-existing non-allowlisted divergence: `openspec/changes/archive/2026-08-07-k3-identities-boundary-closure/apply-progress.md` has SHA-256 `0fbbb787205fca796c0964de7fd2cfaf5fee3c9c97494f17e5b1c8194bbd638a`, while `HEAD` has `19ace1a6acd88118a06ef59da22e011a19f754bf4408d2d2939584fec72fefee`. The historical-evidence contract forbids rewriting that sibling artifact, so reconciliation immutability cannot be proven under the current allowlist.

## Batch 4 — canonical Git identity correction

- [x] Historical reconciliation uses `git diff --quiet -- <path>` for non-allowlisted siblings and Git `HEAD` blobs as explicit before provenance. The raw SHA difference was a CRLF checkout observation (`core.autocrlf=true`), not a content mutation. Added a regression proving LF/CRLF raw hashes differ while normalized canonical bytes agree.
- [x] Focal reconciliation test: 3/3 pass. Full `npm test`: pass, 0 errors and 0 warnings.
- [~] Remaining work is unchanged: tasks 2.*, 3.3, 3.5, 4.4–4.5, 5.1, 5.3–5.4 still require fresh fixtures, expanded target parity, immutable manifest persistence, and an authoritative Strict-TDD JSON evidence record. Apply remains partial.

## Batch 5 — adversarial identity boundaries

- [x] Fresh runtime boundary cycle: `scripts/lib/execution-identities/index.test.js` now executes case-distinct paths, workspace/staged projection, mode, symlink-target representation, untracked inventory, and commit-projection rejection through `freezeCandidate`; `node --test scripts/lib/execution-identities/index.test.js` passed 65/65.
- [~] The remaining packaging-parity, fixture-artifact, immutable-manifest and authoritative JSON-evidence tasks must still be completed before apply can become ready-for-verify.

## Batch 6 — fixture artifacts

- [x] Added identity fixture artifacts for case distinction, projection, and symlink target representation, plus valid changed-successor and invalid retired-vocabulary Candidate v2 fixtures. Fresh schema fixture suite passed 15/15 after preserving the K1 baseline inventory exclusion for K3 identity fixtures.
- [~] Exact remaining IDs: 3.3, 3.5, 4.4–4.5, 5.1, 5.3–5.4. The authoritative Strict-TDD JSON evidence remains required before apply closure.

## Batch 7 — six-target parity

- [x] 3.3: Added six-target in-memory parity assertions for the manifest, Candidate v2 schema, execution-identity runtime, and schema-validator dependency. Focal suite passed 4/4.
- [x] 3.5: Regenerated and validated Claude, VS Code, GitHub Copilot, OpenCode, Codex, and Cursor with their authoritative build commands; all reported zero errors and zero warnings.
- [~] Remaining IDs: 4.4–4.5, 5.1, 5.3–5.4, including the authoritative Strict-TDD JSON evidence.

## Batch 8 — canonical reconciliation manifest and focal matrix

- [x] 4.4–4.5: `historicalManifest()` records path-scoped `git:HEAD` before SHA-256 and working-tree after SHA-256 for exactly the three allowlisted states. The test also requires every non-state sibling to be Git-clean, avoiding CRLF checkout false positives.
- [x] 5.1: Ran the combined runtime, schema-fixture, CLI, packaging-parity, and reconciliation focal matrix: 118/118 pass.
- [~] Exact remaining IDs: 5.3–5.4. Apply cannot close without the final immutable/generated digest record, traceability matrix, and authoritative Strict-TDD JSON evidence.

## Batch 9 — authoritative-evidence gate

- [~] 5.3–5.4 are blocked by `runtime-receipt-unverified`. The authoritative schema requires paired `runtime-receipt` RED and GREEN receipts for every evidence cycle. Fresh GREEN/focal commands exist, but the original RED executions predate this batch and no authenticated receipt files were persisted. Re-running a RED now would require temporarily regressing production behavior, which is outside the approved remediation scope and would not authenticate the historical cycle. No evidence record was fabricated.

## Batch 10 — approved reversible cycle

- [~] Executed the approved reversible production mutation with invariant test bytes. RED receipt `b25d702ba45510af1831129b810093a8ef34f967f5821727cb074cefd147eacd` and GREEN receipt `a99690e8f866982b0a727a18eb69e9c94ccd388f8010c4d3869945dc74d98fc1` share test digest `sha256:1027b93c905b83e2484007b141d4e5fa1c0aa35e4b471d922d70eaabe45bc273`; GREEN passed 65/65 after restoration. Real validation still fails `runtime-receipt-binding-mismatch` twice plus `runtime-receipt-unverified` because the receipts were issued with a placeholder candidate_id, not the evidence record's derived candidate identity. No authoritative block was written.

## Batch 11 — paired runtime-authenticated successor cycle and closure

- [x] 5.3: Derived the final functional manifest with the same `candidateIdentity` algorithm used by `validateEvidenceRecord`. Its candidate is `sha256:259a98c7225d1ab370b6795c73a051a43a68b4f28144d02cd786a889afebc57b`; its inputs are the restored runtime digest `sha256:21a1ffa0a3b3b4d712bec6ff6bd272009733122eb741f2b018963be06f60f8df` and the unchanged permanent-test digest `sha256:1027b93c905b83e2484007b141d4e5fa1c0aa35e4b471d922d70eaabe45bc273`.
- [x] 5.3: Ran a fresh reversible RED by removing only the `workspace` projection from the production guard. The captured RED receipt `sha256:5774b98314360c62634cf12450d33f5e95467190772b1627be3e08a27aa926a3` records the expected non-zero execution. Restoring the guard and rerunning the identical test yielded captured GREEN receipt `sha256:d1829c9d8c0280c221541b07bb0ee3be9a9d8b2039449479f8151fef7b0287ba` with 65/65 passing. Both receipts bind to the final candidate and permanent-test digest.
- [x] 5.3: The real validator accepted the record below with `valid: true`, `authenticity: runtime-authenticated`. Earlier failed-attempt receipts are retained as non-authoritative audit only and are not referenced by this evidence block.
- [x] 5.3: Focal matrix passed 118/118: reconciliation, execution identities, schema fixtures, configure CLI, and six-target parity. `scripts/lib/k1-scope-guard.test.js` initially exposed three K3 identity fixtures absent from its successor exclusion; adding the narrow identity-fixtures successor prefix made its 5/5 focal pass. Final `npm test` passed with 2109 pass, 0 fail, 2 skipped, 0 errors, and 0 warnings.
- [x] 5.4: All task checkboxes now reflect runtime-verified work. The traceability table follows.

| Requirement | Implementation tasks | Runtime evidence |
| --- | --- | --- |
| REQ-execution-identities-004 | 1.1–1.2, 2.1–2.3 | `execution-identities/index.test.js`: frozen predecessor, case, projection, modes, symlink and untracked boundary scenarios; 65/65 GREEN. |
| REQ-execution-identities-005 | 1.3–1.4, 1.7, 2.5 | `execution-identities/index.test.js`: recomputed lineage, declared mismatch, retired relation, ambiguous/unknown fail-closed outcomes. |
| REQ-execution-identities-009 | 1.1–1.2, 3.1–3.5, 4.1–4.5, 5.1–5.3 | `k3-readiness-reconciliation.test.js`, `configure/cli.test.js`, and `strict-tdd-evidence-parity.test.js`; six targets plus canonical Git history proof. |
| REQ-kernel-contract-schemas-012 | 1.5–1.6, 2.2, 2.4, 2.6, 5.3 | `k3-schema-fixtures.test.js`: Candidate v2 fixtures, retired vocabulary, non-aliasing, v1 optional-kind behavior, and K1 digest pins. |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| 5.3–5.4 | `scripts/lib/execution-identities/index.test.js` | Unit | Workspace projection guard | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed | Fresh reversible successor cycle; RED and GREEN use identical test bytes and the derived final candidate. |

```json:non-authoritative-tdd-audit
{
  "schema_version": 1,
  "change": "k3-readiness-remediation",
  "evidence_mode": "live",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "HEAD",
    "genesis_paths": [
      "scripts/lib/execution-identities/index.js",
      "scripts/lib/execution-identities/index.test.js"
    ],
    "files": [
      {
        "path": "scripts/lib/execution-identities/index.js",
        "digest": "sha256:21a1ffa0a3b3b4d712bec6ff6bd272009733122eb741f2b018963be06f60f8df"
      },
      {
        "path": "scripts/lib/execution-identities/index.test.js",
        "digest": "sha256:1027b93c905b83e2484007b141d4e5fa1c0aa35e4b471d922d70eaabe45bc273"
      }
    ]
  },
  "cycles": [
    {
      "task": "5.3–5.4",
      "test_file": "scripts/lib/execution-identities/index.test.js",
      "layer": "unit",
      "safety_net": "Runtime guard for the K3 workspace projection invariant",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Passed",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "command": "node --test scripts/lib/execution-identities/index.test.js",
        "receipt_id": "sha256:d1829c9d8c0280c221541b07bb0ee3be9a9d8b2039449479f8151fef7b0287ba",
        "receipt_path": "openspec/changes/k3-readiness-remediation/evidence/receipts/d1829c9d8c0280c221541b07bb0ee3be9a9d8b2039449479f8151fef7b0287ba.json",
        "test_file": "scripts/lib/execution-identities/index.test.js",
        "test_digest": "sha256:1027b93c905b83e2484007b141d4e5fa1c0aa35e4b471d922d70eaabe45bc273",
        "red_command": "node --test scripts/lib/execution-identities/index.test.js",
        "red_receipt_id": "sha256:5774b98314360c62634cf12450d33f5e95467190772b1627be3e08a27aa926a3",
        "red_receipt_path": "openspec/changes/k3-readiness-remediation/evidence/receipts/5774b98314360c62634cf12450d33f5e95467190772b1627be3e08a27aa926a3.json",
        "red_test_digest": "sha256:1027b93c905b83e2484007b141d4e5fa1c0aa35e4b471d922d70eaabe45bc273"
      }
    }
  ]
}
```

## Batch 12 — remediation after verify FAIL

- [x] CRITICAL 1: Added a second-generation `root → changed → changed` assertion. RED failed with `LINEAGE_RELATION_MISMATCH`; GREEN changes lineage coherence so a changed baseline is valid when the target names its recomputed CandidateId.
- [x] CRITICAL 3: Added `fixtures/invalid/v2-exact-with-predecessor.json`, asserted it through the Candidate v2 schema suite, and encoded the `exact => predecessor_id: null` / `changed => sha256 predecessor` contract in the canonical schema.
- [x] CRITICAL 4–5: The reconciliation suite now reads both K3/K4a boundary documents and checks a real Git-clean archive sibling against its HEAD bytes after checkout line-ending normalization; it no longer uses hard-coded crypto buffers.
- [~] CRITICAL 2 remains: the prior authoritative evidence record is necessarily stale after these code/test/schema changes. The verifier requires fresh authenticated paired receipts and derived rendering for every changed coding task/path; this cannot be truthfully finalized from the historical cycles. No fabricated record was written.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| 1.1–1.4 / 2.2 / 4.1 | `execution-identities/index.test.js`, `k3-schema-fixtures.test.js`, `k3-readiness-reconciliation.test.js` | Unit / contract / integration | successor, invalid fixture, historical/docs boundary | ✅ Written | [~] pending final focal | ✅ Written | Pending | Fresh RED observed for the second-generation chain; completion awaits final evidence reconciliation. |

## Batch 13 — evidence coverage group 1: execution identities

- [x] Derived the current final runtime-group candidate with the repository `candidateIdentity` helper: `sha256:069b5ac218883a5791fa0f421428091fba878c0f77d99263dd009c7b9c6c42f8` from `index.js` digest `sha256:c1a698315776e13a750fa8a6713d522eea11df5241baef2dea46b9844359bf3e` and unchanged test digest `sha256:f5698b20bddba9f54e6f53924dbb8fc117c8e067dc7322070a716d38f66f7050`.
- [x] RED used only a reversible production mutation in lineage coherence. Receipt `sha256:4b537bc854556f11449b6e93b3e0e9f00e682ff047e39d717c5d14f502488e73` captured the non-zero permanent multigeneration runtime test.
- [x] GREEN restored exact production bytes. Receipt `sha256:e39124cb86f5164c7edb16221339466a5ff5c7efc3bdf848f40b013c2b9c4d55` captured a successful run with the identical test digest and candidate. A minimal candidate-bound evidence record validated `valid: true`, `authenticity: runtime-authenticated`.
- [~] This pair is retained for later aggregation only; no final evidence record was written and no other coverage group was attempted.

## Batch 14 — evidence coverage group 2: Candidate v2 schema and fixtures

- [x] Derived the final schema-group candidate `sha256:927f2cae5d029d332679e61e021eeb88ab3e3db2c0b9add97f55dd16cd3c5e45`, covering Candidate v2 schema, exact-with-predecessor and retired-relation fixtures, plus the permanent schema test.
- [x] RED broadened only the schema's exact predecessor type, causing the permanent fixture test to fail; authenticated receipt: `sha256:3c0fb4660c0b26f6229b2ab90a38d6dcaad37bb3a290f4c6984f7d582dd646cf`.
- [x] GREEN restored final schema bytes and passed the unchanged test; authenticated receipt: `sha256:c25fd157cb0d5d3d6dafa10d2ab4e05104be9d13f5c4ed2198504dbe3aa3f55e`.
- [x] Candidate-bound validation returned `valid: true`, `authenticity: runtime-authenticated`. This pair is retained for aggregation only; no final evidence record was written.

## Batch 15 — evidence coverage group 3: distribution generator

- [x] Derived candidate `sha256:b3cc265a4b0ac63279ba84fbe835082b70e49eee442ff54bb1fc9d2f55112358` for `scripts/configure/cli.js` and permanent distribution tests.
- [x] RED replaced the curated schema root with a nonexistent path. The permanent CLI test failed and emitted receipt `sha256:e0a36a96121ce399a4b06ec5be02917f05dc47c5557c9c11a03ad8d838af7a13`.
- [x] GREEN restored the source root, passed the unchanged CLI test, emitted receipt `sha256:e229db480a00cdc9ad98c318885f3a6db64dc68b783598374fc47cbd3ed0ae62`, and regenerated all six authoritative distributions.
- [~] Validator API finding: aggregation of the three groups' distinct CandidateIds is not supported. `validateEvidenceRecord` derives one candidate from the single `functional_snapshot` and requires every RED/GREEN receipt's `candidate_id` to equal it; a final record must instead use one all-path final manifest and pairs issued against that same ID.

## Batch 16 — global-candidate schema/fixture pair

- [x] Using frozen global CandidateId `sha256:fd8bc8c393d83afb211640631fb4a1a100efc691660fda1976b13c454b395c80`, RED broadened only the exact predecessor schema type and failed the unchanged permanent fixture suite. Receipt: `sha256:df925c74876f37f762e38c2c26a93c71f59478bd6032acf12a4db230491e6ec7`.
- [x] GREEN restored the final schema bytes and passed the same test digest. Receipt: `sha256:a11f26e10347e6682f15196d54e746ea91930f6472e3b726899d7d3bc843ffd3`.

## Batch 17 — global-candidate generator/distribution pair

- [x] RED replaced only the curated schema root; the unchanged CLI test failed and issued global receipt `sha256:9eb3208fda3f990894452aa62a2c96355fad4516663008a82eb34fb67a7f1f36`.
- [x] GREEN restored `schemas/kernel`, passed the same test and issued global receipt `sha256:daabc56684c9675ac51ca9541988f49aadedca5d104114a77e4b9608a2ac0ffd`.
- [x] Regenerated all six authoritative targets after restoration. No final evidence record was written.

## Batch 18 — global-candidate reconciliation pair

- [x] RED changed the exact architecture row asserted by the permanent test from `K4a bloqueada` to `K4a pendiente`; the test exited non-zero and issued `sha256:8f459932b35f17d3350ffc4b5876e0e1cd8f179e3efdbb2c07617c12ce800f5d`.
- [x] GREEN restored the exact `K4a bloqueada` wording, passed the unchanged test, and issued `sha256:c814e424ade310101fbfa9fc56212e2c7d142bc4b32123b706a57e88a447a251`.

## Batch 19 — cierre de evidencia global autenticada

- [x] Sustituida la representación autoritativa anterior (ahora retenida como auditoría no autoritativa) por un único registro de cuatro pares RED/GREEN emitidos contra el CandidateId global congelado `sha256:fd8bc8c393d83afb211640631fb4a1a100efc691660fda1976b13c454b395c80`.
- [x] El registro cubre runtime, esquema/fixtures, distribución y reconciliación. Solo referencia los ocho recibos globales autenticados; los intentos anteriores permanecen excluidos.
- [x] `finalizeEvidence` validó la instantánea funcional y el render derivado exacto con digest `sha256:68618834e9f88f537330492c9671a8f01abe8a2aebd342be7c5e1a2fc418cf69`.

```json:non-authoritative-tdd-audit
{"schema_version":1,"change":"k3-readiness-remediation","evidence_mode":"live","functional_snapshot":{"projection":"strict-tdd-functional-v1","base_tree":"HEAD","genesis_paths":["schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","schemas/kernel/candidate/fixtures/identity/projection-change.json","schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","schemas/kernel/candidate/v2.schema.json","scripts/configure/cli.js","scripts/configure/cli.test.js","scripts/lib/execution-identities/index.js","scripts/lib/execution-identities/index.test.js","scripts/lib/k1-scope-guard.test.js","scripts/lib/k3-readiness-reconciliation.test.js","scripts/lib/k3-schema-fixtures.test.js","scripts/lib/lifecycle-kernel/k1-compat.js","scripts/strict-tdd-evidence-parity.test.js"],"files":[{"path":"schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","digest":"sha256:4fea8e2d0dba0a6ae1fadc05479e8dfd2246f31b8988fd8b99704038cec447f6"},{"path":"schemas/kernel/candidate/fixtures/identity/projection-change.json","digest":"sha256:ce966901f839368ba0e8499cf26f5db03c69d2b6e909f6e97b1f4eaa1ffb9986"},{"path":"schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","digest":"sha256:fa0ae01c48332a88a0f45a18f53ea47ec6579fb3fc85e027fdad01b4ee2005bc"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","digest":"sha256:600976711ab048cfcff189a61f9e31d1f765dda66dc6b5772c0ba1519a27bfd7"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","digest":"sha256:98cbf16ad412969e8606d5f4576f7581c7bd9fe53f6dc19298a9aae3d08894eb"},{"path":"schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","digest":"sha256:0d7c8ff95a172096691f00b05d0f2762a1717d175812a50c4b60cd4cc8694b6c"},{"path":"schemas/kernel/candidate/v2.schema.json","digest":"sha256:699df68db53c856b474e7304c7bd319b6340abf2627da004b9d1763b58b96289"},{"path":"scripts/configure/cli.js","digest":"sha256:def421eecf5c705094b40ee6a62949703e6ba9e4cac6581bd8df3ba737c6c9c2"},{"path":"scripts/configure/cli.test.js","digest":"sha256:8751a122ef6fb25e9e3bec62f56ce1836d509288946eed1877998618b6ff4fd1"},{"path":"scripts/lib/execution-identities/index.js","digest":"sha256:c1a698315776e13a750fa8a6713d522eea11df5241baef2dea46b9844359bf3e"},{"path":"scripts/lib/execution-identities/index.test.js","digest":"sha256:f5698b20bddba9f54e6f53924dbb8fc117c8e067dc7322070a716d38f66f7050"},{"path":"scripts/lib/k1-scope-guard.test.js","digest":"sha256:2e92942c4d1eb48c9c4980d5efe5e539379660f70e8602450a812f20952ac6ac"},{"path":"scripts/lib/k3-readiness-reconciliation.test.js","digest":"sha256:3eaae83ea7f9c92d8469727534a7ea2f297b35d5a03932cd8a4c3857ac4b1a9d"},{"path":"scripts/lib/k3-schema-fixtures.test.js","digest":"sha256:dcdee2f4a3feca40a047c30cf7b098736a4bd96a4983f95a3831e9ad17b2a3eb"},{"path":"scripts/lib/lifecycle-kernel/k1-compat.js","digest":"sha256:8ae0848ba88d1eae710ed81a85e280c9ca5c6cc272002cfd274c13dcbae9c7b4"},{"path":"scripts/strict-tdd-evidence-parity.test.js","digest":"sha256:a58b30107811bcf497c239d3d887b13afbf0a43ae903775b6f03abf5d395009f"}]},"cycles":[{"green":"✅ Passed","provenance":{"command":"node --test scripts/configure/cli.test.js","receipt_id":"sha256:daabc56684c9675ac51ca9541988f49aadedca5d104114a77e4b9608a2ac0ffd","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/daabc56684c9675ac51ca9541988f49aadedca5d104114a77e4b9608a2ac0ffd.json","red_command":"node --test scripts/configure/cli.test.js","red_receipt_id":"sha256:9eb3208fda3f990894452aa62a2c96355fad4516663008a82eb34fb67a7f1f36","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/9eb3208fda3f990894452aa62a2c96355fad4516663008a82eb34fb67a7f1f36.json","red_test_digest":"sha256:8751a122ef6fb25e9e3bec62f56ce1836d509288946eed1877998618b6ff4fd1","source":"runtime-receipt","test_digest":"sha256:8751a122ef6fb25e9e3bec62f56ce1836d509288946eed1877998618b6ff4fd1","test_file":"scripts/configure/cli.test.js"},"red":"✅ Written","refactor":"✅ Passed","task":"distribution","test_file":"scripts/configure/cli.test.js","triangulate":"✅ Passed"},{"green":"✅ Passed","provenance":{"command":"node --test scripts/lib/k3-readiness-reconciliation.test.js","receipt_id":"sha256:c814e424ade310101fbfa9fc56212e2c7d142bc4b32123b706a57e88a447a251","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/c814e424ade310101fbfa9fc56212e2c7d142bc4b32123b706a57e88a447a251.json","red_command":"node --test scripts/lib/k3-readiness-reconciliation.test.js","red_receipt_id":"sha256:8f459932b35f17d3350ffc4b5876e0e1cd8f179e3efdbb2c07617c12ce800f5d","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/8f459932b35f17d3350ffc4b5876e0e1cd8f179e3efdbb2c07617c12ce800f5d.json","red_test_digest":"sha256:3eaae83ea7f9c92d8469727534a7ea2f297b35d5a03932cd8a4c3857ac4b1a9d","source":"runtime-receipt","test_digest":"sha256:3eaae83ea7f9c92d8469727534a7ea2f297b35d5a03932cd8a4c3857ac4b1a9d","test_file":"scripts/lib/k3-readiness-reconciliation.test.js"},"red":"✅ Written","refactor":"✅ Passed","task":"reconciliation","test_file":"scripts/lib/k3-readiness-reconciliation.test.js","triangulate":"✅ Passed"},{"green":"✅ Passed","provenance":{"command":"node --test scripts/lib/execution-identities/index.test.js","receipt_id":"sha256:86fd359bfeb7216e6c1fd70de20f9f4769219f6c60a092b2d71d5918c9087ce5","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/86fd359bfeb7216e6c1fd70de20f9f4769219f6c60a092b2d71d5918c9087ce5.json","red_command":"node --test scripts/lib/execution-identities/index.test.js","red_receipt_id":"sha256:d4792b60e4cf31ad5d2b96eb3fe1e21a1f2e29d745ee453d7bf5752d8d68fd21","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/d4792b60e4cf31ad5d2b96eb3fe1e21a1f2e29d745ee453d7bf5752d8d68fd21.json","red_test_digest":"sha256:f5698b20bddba9f54e6f53924dbb8fc117c8e067dc7322070a716d38f66f7050","source":"runtime-receipt","test_digest":"sha256:f5698b20bddba9f54e6f53924dbb8fc117c8e067dc7322070a716d38f66f7050","test_file":"scripts/lib/execution-identities/index.test.js"},"red":"✅ Written","refactor":"✅ Passed","task":"runtime","test_file":"scripts/lib/execution-identities/index.test.js","triangulate":"✅ Passed"},{"green":"✅ Passed","provenance":{"command":"node --test scripts/lib/k3-schema-fixtures.test.js","receipt_id":"sha256:a11f26e10347e6682f15196d54e746ea91930f6472e3b726899d7d3bc843ffd3","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/a11f26e10347e6682f15196d54e746ea91930f6472e3b726899d7d3bc843ffd3.json","red_command":"node --test scripts/lib/k3-schema-fixtures.test.js","red_receipt_id":"sha256:df925c74876f37f762e38c2c26a93c71f59478bd6032acf12a4db230491e6ec7","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/df925c74876f37f762e38c2c26a93c71f59478bd6032acf12a4db230491e6ec7.json","red_test_digest":"sha256:dcdee2f4a3feca40a047c30cf7b098736a4bd96a4983f95a3831e9ad17b2a3eb","source":"runtime-receipt","test_digest":"sha256:dcdee2f4a3feca40a047c30cf7b098736a4bd96a4983f95a3831e9ad17b2a3eb","test_file":"scripts/lib/k3-schema-fixtures.test.js"},"red":"✅ Written","refactor":"✅ Passed","task":"schema","test_file":"scripts/lib/k3-schema-fixtures.test.js","triangulate":"✅ Passed"}]}
```

## Final Derived Markdown Table

| distribution | scripts/configure/cli.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |
| reconciliation | scripts/lib/k3-readiness-reconciliation.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |
| runtime | scripts/lib/execution-identities/index.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |
| schema | scripts/lib/k3-schema-fixtures.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |

## Batch 32 — evidencia final autenticada de limpieza

- [x] El manifiesto funcional final incluye las seis rutas de publicación, prueba e instalación de la Fase 8. CandidateId: `sha256:34e7d6afc169f40a6c06444061c08dddf856c1700057a40565972201c183b58a`.
- [x] RED reversible: se suprimió temporalmente sólo el callback de `cleanup` en `scripts/configure/cli.js`; la prueba permanente sin cambios falló con exit 1. Tras restaurar, el snapshot binario de 23.821 bytes volvió exactamente a `sha256:b89a2babe2c0918dcba3e486f56d40fbc6aaa9007368df1c639e13cb02f8f164`, el digest LF volvió a `sha256:af57d914f29fd95596aceb7d54eefbef3803a58cfb0dce45868876ece7e4889d` y el CandidateId no cambió.
- [x] GREEN: la misma prueba permanente pasó 6/6 con el mismo digest `sha256:e2f33df389029536c020923ce9ce56eb5d715a715c60722d70d5b07ddb122356`.
- [x] Los bloques de evidencia anteriores permanecen como auditoría no autoritativa. El siguiente bloque es la única evidencia `json:strict-tdd-evidence` autoritativa y sólo afirma las operaciones cubiertas por la matriz permanente de publicación y limpieza.

```json:non-authoritative-tdd-audit
{"schema_version":1,"change":"k3-readiness-remediation","evidence_mode":"live","functional_snapshot":{"projection":"strict-tdd-functional-v1","base_tree":"HEAD","genesis_paths":["schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","schemas/kernel/candidate/fixtures/identity/projection-change.json","schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","schemas/kernel/candidate/v2.schema.json","scripts/configure/cli.js","scripts/configure/cli.test.js","scripts/configure/codex-smoke.test.js","scripts/configure/install-codex.js","scripts/lib/execution-identities/index.js","scripts/lib/execution-identities/index.test.js","scripts/lib/k1-scope-guard.test.js","scripts/lib/k3-publication-transaction.test.js","scripts/lib/k3-readiness-reconciliation.test.js","scripts/lib/k3-schema-fixtures.test.js","scripts/lib/lifecycle-kernel/k1-compat.js","scripts/strict-tdd-evidence-parity.test.js"],"files":[{"path":"schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","digest":"sha256:4fea8e2d0dba0a6ae1fadc05479e8dfd2246f31b8988fd8b99704038cec447f6"},{"path":"schemas/kernel/candidate/fixtures/identity/projection-change.json","digest":"sha256:ce966901f839368ba0e8499cf26f5db03c69d2b6e909f6e97b1f4eaa1ffb9986"},{"path":"schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","digest":"sha256:fa0ae01c48332a88a0f45a18f53ea47ec6579fb3fc85e027fdad01b4ee2005bc"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","digest":"sha256:600976711ab048cfcff189a61f9e31d1f765dda66dc6b5772c0ba1519a27bfd7"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","digest":"sha256:98cbf16ad412969e8606d5f4576f7581c7bd9fe53f6dc19298a9aae3d08894eb"},{"path":"schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","digest":"sha256:0d7c8ff95a172096691f00b05d0f2762a1717d175812a50c4b60cd4cc8694b6c"},{"path":"schemas/kernel/candidate/v2.schema.json","digest":"sha256:699df68db53c856b474e7304c7bd319b6340abf2627da004b9d1763b58b96289"},{"path":"scripts/configure/cli.js","digest":"sha256:af57d914f29fd95596aceb7d54eefbef3803a58cfb0dce45868876ece7e4889d"},{"path":"scripts/configure/cli.test.js","digest":"sha256:75ead52447bf64a4bc45910a35450440332c733cff392caeee41708b7f67d986"},{"path":"scripts/configure/codex-smoke.test.js","digest":"sha256:c29d300b6d53d6ee3ee0a35ae713a09238d5fdb932f4185c8c3a5b9c4c6dc75e"},{"path":"scripts/configure/install-codex.js","digest":"sha256:1441d95639a5ffe1c652d149ea82fe7e6ac1efe4956db2b40c85074fbecdb98f"},{"path":"scripts/lib/execution-identities/index.js","digest":"sha256:0e073e5061cd1f5a38b7d7a24a4b9cfd2e8fa08e52f215ec9851985d66b2fc8a"},{"path":"scripts/lib/execution-identities/index.test.js","digest":"sha256:0df1cfaffae1d26e2369f5fca7ba9581b39b527122196b64cef0018241938d14"},{"path":"scripts/lib/k1-scope-guard.test.js","digest":"sha256:d03f4ff1d6960c09265fb939062cf3b67660653e74e94884ab3381658b895c55"},{"path":"scripts/lib/k3-publication-transaction.test.js","digest":"sha256:e2f33df389029536c020923ce9ce56eb5d715a715c60722d70d5b07ddb122356"},{"path":"scripts/lib/k3-readiness-reconciliation.test.js","digest":"sha256:3eaae83ea7f9c92d8469727534a7ea2f297b35d5a03932cd8a4c3857ac4b1a9d"},{"path":"scripts/lib/k3-schema-fixtures.test.js","digest":"sha256:dcdee2f4a3feca40a047c30cf7b098736a4bd96a4983f95a3831e9ad17b2a3eb"},{"path":"scripts/lib/lifecycle-kernel/k1-compat.js","digest":"sha256:8ae0848ba88d1eae710ed81a85e280c9ca5c6cc272002cfd274c13dcbae9c7b4"},{"path":"scripts/strict-tdd-evidence-parity.test.js","digest":"sha256:a58b30107811bcf497c239d3d887b13afbf0a43ae903775b6f03abf5d395009f"}]},"cycles":[{"green":"✅ Passed","provenance":{"command":"node --test scripts/configure/codex-smoke.test.js","receipt_id":"sha256:3a7e463ea088190c7660c37ea8fed0a309f22ea1f5e8b61d5bb5aec0f99dcfb5","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/3a7e463ea088190c7660c37ea8fed0a309f22ea1f5e8b61d5bb5aec0f99dcfb5.json","red_command":"node --test scripts/configure/codex-smoke.test.js","red_receipt_id":"sha256:e1f5a758514cd1a9edec132973225ddc121254c86b73757fffe6f4abd088db3a","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/e1f5a758514cd1a9edec132973225ddc121254c86b73757fffe6f4abd088db3a.json","red_test_digest":"sha256:c29d300b6d53d6ee3ee0a35ae713a09238d5fdb932f4185c8c3a5b9c4c6dc75e","source":"runtime-receipt","test_digest":"sha256:c29d300b6d53d6ee3ee0a35ae713a09238d5fdb932f4185c8c3a5b9c4c6dc75e","test_file":"scripts/configure/codex-smoke.test.js"},"red":"✅ Written","refactor":"✅ Passed","task":"9.1–9.5","test_file":"scripts/configure/codex-smoke.test.js","triangulate":"✅ Passed"}]}
```

## Final Derived Markdown Table

| Task | Test File | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 9.1–9.5 | scripts/configure/codex-smoke.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |

## Batch 33 — cierre de instalador Codex activo

- [x] CandidateId final: `sha256:627483dcb47bd6296f7aa609f4dc1651be77161ce4063293c5651f757fb62b9a`, con 19 rutas funcionales K3, incluido el instalador y la prueba permanente; digest de prueba `sha256:c29d300b6d53d6ee3ee0a35ae713a09238d5fdb932f4185c8c3a5b9c4c6dc75e`.
- [x] RED reversible: una única mutación temporal hizo que el instalador copiase sólo `scripts`; `node --test scripts/configure/codex-smoke.test.js` falló en `schemas/kernel/manifest.json` sin cambiar la prueba. Recibo `sha256:e1f5a758514cd1a9edec132973225ddc121254c86b73757fffe6f4abd088db3a`.
- [x] GREEN: se restauraron los bytes exactos de `scripts/configure/install-codex.js` (`sha256:1441d95639a5ffe1c652d149ea82fe7e6ac1efe4956db2b40c85074fbecdb98f`); la misma prueba pasó 2/2. Recibo `sha256:3a7e463ea088190c7660c37ea8fed0a309f22ea1f5e8b61d5bb5aec0f99dcfb5`.
- [x] El único bloque autoritativo validó `runtime-authenticated` con `requireProvenanceDigest: true`; `finalizeEvidence` produjo `sha256:d3cbfd9b59361d46c48c2cb771f63ba1554b0b6f96991033a80a9aa6b572931b` y `assertFinalized` pasó sobre las 19 rutas.
- [x] Matriz focal 44/44 PASS; `npm test` paralelo terminó con 0 errores/advertencias; corpus serial `node --test --test-concurrency=1 scripts/**/*.test.js` terminó 2115 PASS, 0 FAIL, 2 skipped.
- [x] Regeneración e instalación Codex activas completadas dos veces. Paridad exacta `dist/codex` → `C:\\Users\\sn4ke\\.codex\\ospec-workflow`: 31 scripts y 113 schemas; `validateCandidateV2(v2-minimal)` instalada pasó y no quedan `.configure-stage-*`, `.configure.lock` ni backups. La prueba permanente cubre el cierre e idempotencia; no introduce una sonda artificial de schema obsoleto.
- [x] Reinicio requerido: una sesión Codex ya iniciada conserva sus instrucciones, agentes, catálogo de skills y registros de hooks cargados; abrir una nueva sesión para cargar esa configuración. Los scripts de hooks que ya estaban registrados leen el runtime actualizado al ejecutarse.

## Batch 34 — cierre Fase 10: poda convergente de schemas Codex

- [x] CandidateId final: `sha256:0b154b61f265f8f09f8008f9da9d7fd95dc6fc236de713a026f99cfc044d94ad`; RED/GREEN permanentes contra el mismo digest de prueba `sha256:9a1c8dfc65e925d2f962b4609664314cb630bd9e9b68aa4062cae565d0ad0174`, con restauración exacta de los bytes funcionales.
- [x] RED autenticado: la omisión temporal y reversible de la poda dejó el schema obsoleto y falló el smoke aislado. GREEN autenticado: la poda limitada a `schemas` pasó el mismo smoke, preservando el sentinel externo.

```json:strict-tdd-evidence
{"schema_version":1,"change":"k3-readiness-remediation","evidence_mode":"live","functional_snapshot":{"projection":"strict-tdd-functional-v1","base_tree":"HEAD","genesis_paths":["schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","schemas/kernel/candidate/fixtures/identity/projection-change.json","schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","schemas/kernel/candidate/v2.schema.json","scripts/configure/cli.js","scripts/configure/cli.test.js","scripts/configure/codex-smoke.test.js","scripts/configure/install-codex.js","scripts/lib/execution-identities/index.js","scripts/lib/execution-identities/index.test.js","scripts/lib/k1-scope-guard.test.js","scripts/lib/k3-publication-transaction.test.js","scripts/lib/k3-readiness-reconciliation.test.js","scripts/lib/k3-schema-fixtures.test.js","scripts/lib/lifecycle-kernel/k1-compat.js","scripts/strict-tdd-evidence-parity.test.js"],"files":[{"path":"schemas/kernel/candidate/fixtures/identity/case-distinct-paths.json","digest":"sha256:4fea8e2d0dba0a6ae1fadc05479e8dfd2246f31b8988fd8b99704038cec447f6"},{"path":"schemas/kernel/candidate/fixtures/identity/projection-change.json","digest":"sha256:ce966901f839368ba0e8499cf26f5db03c69d2b6e909f6e97b1f4eaa1ffb9986"},{"path":"schemas/kernel/candidate/fixtures/identity/symlink-target-change.json","digest":"sha256:fa0ae01c48332a88a0f45a18f53ea47ec6579fb3fc85e027fdad01b4ee2005bc"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json","digest":"sha256:600976711ab048cfcff189a61f9e31d1f765dda66dc6b5772c0ba1519a27bfd7"},{"path":"schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json","digest":"sha256:98cbf16ad412969e8606d5f4576f7581c7bd9fe53f6dc19298a9aae3d08894eb"},{"path":"schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json","digest":"sha256:0d7c8ff95a172096691f00b05d0f2762a1717d175812a50c4b60cd4cc8694b6c"},{"path":"schemas/kernel/candidate/v2.schema.json","digest":"sha256:699df68db53c856b474e7304c7bd319b6340abf2627da004b9d1763b58b96289"},{"path":"scripts/configure/cli.js","digest":"sha256:af57d914f29fd95596aceb7d54eefbef3803a58cfb0dce45868876ece7e4889d"},{"path":"scripts/configure/cli.test.js","digest":"sha256:75ead52447bf64a4bc45910a35450440332c733cff392caeee41708b7f67d986"},{"path":"scripts/configure/codex-smoke.test.js","digest":"sha256:9a1c8dfc65e925d2f962b4609664314cb630bd9e9b68aa4062cae565d0ad0174"},{"path":"scripts/configure/install-codex.js","digest":"sha256:b112d0b1d7b92e2dc12d2ef4cd504d437ddd90c9e4df1453d0cd1ed7617618d5"},{"path":"scripts/lib/execution-identities/index.js","digest":"sha256:0e073e5061cd1f5a38b7d7a24a4b9cfd2e8fa08e52f215ec9851985d66b2fc8a"},{"path":"scripts/lib/execution-identities/index.test.js","digest":"sha256:0df1cfaffae1d26e2369f5fca7ba9581b39b527122196b64cef0018241938d14"},{"path":"scripts/lib/k1-scope-guard.test.js","digest":"sha256:d03f4ff1d6960c09265fb939062cf3b67660653e74e94884ab3381658b895c55"},{"path":"scripts/lib/k3-publication-transaction.test.js","digest":"sha256:e2f33df389029536c020923ce9ce56eb5d715a715c60722d70d5b07ddb122356"},{"path":"scripts/lib/k3-readiness-reconciliation.test.js","digest":"sha256:3eaae83ea7f9c92d8469727534a7ea2f297b35d5a03932cd8a4c3857ac4b1a9d"},{"path":"scripts/lib/k3-schema-fixtures.test.js","digest":"sha256:dcdee2f4a3feca40a047c30cf7b098736a4bd96a4983f95a3831e9ad17b2a3eb"},{"path":"scripts/lib/lifecycle-kernel/k1-compat.js","digest":"sha256:8ae0848ba88d1eae710ed81a85e280c9ca5c6cc272002cfd274c13dcbae9c7b4"},{"path":"scripts/strict-tdd-evidence-parity.test.js","digest":"sha256:a58b30107811bcf497c239d3d887b13afbf0a43ae903775b6f03abf5d395009f"}]},"cycles":[{"task":"10.1–10.5; 9.2–9.4","test_file":"scripts/configure/codex-smoke.test.js","red":"✅ Written","green":"✅ Passed","triangulate":"✅ Passed","refactor":"✅ Passed","provenance":{"source":"runtime-receipt","test_file":"scripts/configure/codex-smoke.test.js","test_digest":"sha256:9a1c8dfc65e925d2f962b4609664314cb630bd9e9b68aa4062cae565d0ad0174","command":"node --test scripts/configure/codex-smoke.test.js","receipt_id":"sha256:d02c8ca3fe3b5ae211d1468910475a30dfc72d8cfcd4345d809c0aa013399fe2","receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/d02c8ca3fe3b5ae211d1468910475a30dfc72d8cfcd4345d809c0aa013399fe2.json","red_command":"node --test scripts/configure/codex-smoke.test.js","red_receipt_id":"sha256:78f25e8e8f9e942894c9f89fa3017c5f273932588539206c2a9a72355aa0e960","red_receipt_path":"openspec/changes/k3-readiness-remediation/evidence/receipts/78f25e8e8f9e942894c9f89fa3017c5f273932588539206c2a9a72355aa0e960.json","red_test_digest":"sha256:9a1c8dfc65e925d2f962b4609664314cb630bd9e9b68aa4062cae565d0ad0174"}}]}
```

## Final Derived Markdown Table

| Task | Test File | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 10.1–10.5; 9.2–9.4 | scripts/configure/codex-smoke.test.js | ✅ Written | ✅ Passed | ✅ Passed | ✅ Passed |

## Batch 35 — verificación de cierre de Fase 10

- [x] La poda recorre exclusivamente `~/.codex/ospec-workflow/schemas`: el RED aislado dejó el schema obsoleto con salida 1; el GREEN eliminó ese archivo, conservó el sentinel externo, el inventario y los bytes exactos.
- [x] Matriz focal: 59/59; `npm test` paralelo: PASS; corpus serial explícito: 2.115 PASS, 0 FAIL, 2 skipped (2.117 tests).
- [x] Los seis destinos se regeneraron por `scripts/configure/cli.js`; la instalación Codex real se actualizó mediante `scripts/configure/install-codex.js --no-validate`. Paridad activa exacta: 31 scripts y 113 schemas; `validateCandidateV2(v2-minimal)` pasó y no hay stage, lock ni backup.
- [x] El tail inmutable de `gates.4r-review-gate` se comprobó byte a byte: 49.191 bytes, `sha256:03aba342a659b655008fa60d90921489d71f67b7fc2accf35c45c5913e8978a7`.
- [x] No se añadió comportamiento K4a ni se modificaron artifacts de historial/predecesor. La instalación activa es efectiva para ejecuciones nuevas; una sesión ya iniciada debe reiniciarse para recargar instrucciones, agentes y catálogo de skills.
