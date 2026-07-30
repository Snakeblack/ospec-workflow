# Design: Fixed-Policy Reference Baseline (O2B)

## Technical Approach

Extend the existing host-authorized benchmark path instead of creating a second runner. `safe-export.js` remains the authority for the nine synthetic profiles; `live-driver.js` remains the only productive live entry point; `benchmark.js` gains pure candidate validation and rendering; and `run.js` retains selection and atomic-file primitives. The command `node scripts/evals/live-driver.js extended` resolves to an exact nine-profile suite with policy `fixed`.

The runner will separate two products:

- `all`/`initial`: the existing three-profile smoke set, returned and optionally rendered as an explicitly diagnostic smoke report; it never calls the reference-baseline publisher.
- `extended`: exactly the stable nine-profile catalog. It may publish `scripts/evals/reports/reference-baseline.md` only after set-level validation succeeds.

Infrastructure and reference data remain separate deliverables. Apply/verify can prove catalogs, guards, cache compatibility, rendering, and fail-closed publication with local tests. A real baseline is created only by a later authorized live run; tests and fixtures never generate substitute rows.

## Architecture Decisions

### Decision: Publish one self-describing, versioned baseline candidate

**Choice**: Build an immutable `ospec-fixed-policy-reference-baseline/v1` candidate containing suite identity and nine complete row records, render it as one Markdown artifact with a fenced canonical JSON payload, then atomically replace the existing report.

**Alternatives considered**: A metrics-only Markdown table cannot retain complete provenance; separate JSON and Markdown files cannot be committed atomically with the current single-file publisher.

**Rationale**: One validated object is both the machine-readable contract and the source of the human table. A single rename preserves the current transaction boundary and prevents split-brain reports. This public data-model decision is mirrored in `decisions/adr-001.md`.

### Decision: Compare shared identity at suite level while retaining row evidence

**Choice**: Every row retains its profile-specific compatibility descriptor and live provenance. Before rendering, a suite validator requires exact equality for policy, harness version, git revision, runtime surface, working-tree identity, installed runtime, target/CLI version, model identity, and effort. It separately verifies each profile's catalog-derived manifest, prompt, fixture, and synthetic-payload hashes.

**Alternatives considered**: Comparing only model/effort misses harness or fixture drift; requiring identical fixture hashes across profiles is impossible because each canonical profile intentionally has a different payload.

**Rationale**: Shared execution identities establish comparability; profile-specific hashes establish attribution to the expected catalog member.

### Decision: Reuse only evidence originating in a live invocation

**Choice**: Productive rows carry an internal origin of `fresh-live`, `recovered-live`, or `compatible-live-cache`. All three originate from the existing host capability and replay-valid transcript path. `fixture_source: embedded-synthetic-catalog` and `synthetic_payload: true` describe the test repository, not the execution origin. Test capabilities, preconstructed workspaces, manual observations, and arbitrary row objects remain ineligible.

**Alternatives considered**: Rejecting cache/recovery would discard valid work after late failures; accepting any structurally valid object would permit synthesis.

**Rationale**: The distinction preserves resumability without confusing a live invocation over synthetic input with a synthesized result.

## Data Flow

```text
extended CLI
  -> resolve exact catalog + policy=fixed
  -> resolve one known execution context (harness/target/model/effort)
  -> for each canonical profile
       -> exact compatible cache? -> replay-validate original live evidence
       -> otherwise live-driver capability -> invoke -> seal -> score -> cache
  -> buildReferenceCandidate(results)
       -> validate exact 9/9 set, identity, provenance, payload and quality
       -> derive baseline_id from canonical payload
  -> renderReferenceBaseline(candidate)
  -> publishBaselineAtomic(reference-baseline.md)
```

Any profile error stops before candidate publication. Per-profile accepted cache entries may remain for an exact resume, but the previously published reference file is unchanged. Validation errors use stable codes plus the offending profile/dimension; no missing row is synthesized.

## Interfaces / Contracts

`safe-export.js` will export frozen `REFERENCE_BENCHMARK_PROFILES` (the nine required identities in canonical order) and `SMOKE_BENCHMARK_PROFILES` (the current three). Each manifest adds:

```js
benchmark_contract: {
  policy: "fixed",
  fixture_source: "embedded-synthetic-catalog",
  synthetic_payload: true
}
```

`buildCompatibilityDescriptor()` will add known `harness_version`, `target_identity`/`target_version`, `policy`, and a catalog digest while retaining the existing git, CLI, runtime, working-tree, installed-runtime, model, effort, manifest, prompt, and fixture identities. Unknown values produce a cache miss and make an extended candidate ineligible.

The reference candidate shape is:

```js
{
  schema: "ospec-fixed-policy-reference-baseline/v1",
  baseline_id: "<sha256 of canonical payload excluding baseline_id>",
  generated_at: "<ISO-8601>",
  policy: "fixed",
  profile_catalog_sha256: "<sha256>",
  shared_identity: {
    harness_version, git_revision, runtime_sha256,
    working_tree_identity, installed_runtime_identity,
    target_identity, target_version, model_identity, effort_identity
  },
  rows: [{
    profile,
    quality_verdict, // PASS or PASS_WITH_WARNINGS from verified structural reports
    compatibility,  // complete profile descriptor
    provenance: {
      execution_origin, driver, cli_version, session_id,
      transcript_sha256, completed_at,
      artifact_evidence_sha256, benchmark_evidence_sha256
    },
    fixture: { source, synthetic_payload, manifest_sha256, prompt_sha256, fixture_sha256 },
    metrics: {
      input_tokens, output_tokens, total_tokens, duration_ms,
      questions_asked, verify_defects, four_r_defects, defects_total
    }
  }]
}
```

`validateReferenceCandidate(candidate)` returns all stable failures such as `missing-profile`, `duplicate-profile`, `unknown-identity`, `shared-identity-mismatch`, `fixture-drift`, `unattributable-origin`, `invalid-quality`, or `invalid-metrics`. `publishReferenceBaseline(results, context)` validates before rendering or touching the destination and delegates only the final single-file replace to `publishBaselineAtomic`.

Quality is derived, not asserted by a caller: structural scoring must pass, state must be `verified`, and canonical verify/4R report outcomes must be accepted. Existing token, duration, question, and defect counters remain run-level; missing O1 keeps phase evidence unavailable and does not invent phase rows.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/evals/safe-export.js` | Modify | Export canonical smoke/reference sets and seal fixed policy plus fixture/synthetic identity into every manifest. |
| `scripts/evals/run.js` | Modify | Preserve smoke aliases, derive `extended` from the exact catalog, and expose atomic publication only as the final primitive. |
| `scripts/evals/live-driver.js` | Modify | Resolve one suite context, retain descriptors/provenance through fresh/cache/recovery paths, and route smoke vs. reference publication. |
| `scripts/evals/lib/benchmark.js` | Modify | Add row quality/provenance normalization, reference-candidate validation, baseline ID, and Markdown/JSON rendering. |
| `scripts/evals/README.md` | Modify | Document the exact extended command, required identities/environment, smoke semantics, diagnostics, threat model, resume, and failure behavior. |
| `scripts/evals/{safe-export,run,live-driver}.test.js` | Modify | Cover catalog/policy, selection, origin sealing, set compatibility, no-smoke publication, cache/recovery, and atomic failure. |
| `scripts/evals/lib/benchmark.test.js` | Modify | Cover schema, metrics, quality, provenance, drift, duplicate/missing rows, deterministic ID, and rendering. |

`scripts/evals/lib/fixtures.js` and versioned golden fixtures do not change: benchmark repositories continue to be derived from `safe-export.js`. No baseline rows or report are checked in during apply unless produced by the documented authorized live command.

## Scenario Allocation

| MUST scenario | Allocation |
|---|---|
| Nine compatible fixed rows publish | `live-driver.js` suite coordinator -> `benchmark.js` candidate validator/renderer -> atomic publisher; 9/9 table and JSON metrics. |
| Missing or incompatible row rejects | Exact-set and shared/profile identity validation before any destination write; profile-coded error. |
| Synthetic or unattributable result rejects | Capability/cache/recovery origin seal plus live provenance; fixture synthetic flag cannot authorize execution. |
| Smoke remains available | `run.js` frozen 3-profile aliases and `live-driver.js` diagnostic branch; reference publisher unreachable. |
| Reproducible command avoids adaptive/CI | `extended` resolves internally to `policy: fixed`; prompt/manifest assert fixed; README states local/manual and no promotion gate. |
| Runner per-scenario pass/fail; attributable failures | Existing golden runner/assertion path remains unchanged and covered by `run.test.js`/`assertions.test.js`. |
| Locally verified infrastructure is archive-ready | Pure Node tests construct test-only candidates in temp paths; live report absence is explicitly non-blocking. |
| Smoke metrics without baseline | Existing run-level scorer retained; smoke output includes tokens, duration, questions, and defects but no reference schema/path. |
| Incomplete extended remains pending | Per-profile cache persists only accepted live results; candidate/publisher is not reached until exact 9/9. |
| Existing Sol/Luna observations stay diagnostic | README retains both labels outside cache/candidate inputs; validator accepts only canonical sealed result records. |
| Extended selects all fixed profiles | Canonical exported array is asserted exactly; `resolveSuiteSelection("extended")` returns that array and fixed policy. |
| Compatible late-failure resume | Existing strong descriptor and transcript replay validation extended with policy/harness/target/catalog identity. |
| Public command rejects replay | `run.js benchmark` remains instruction-only; productive publisher remains internal to `live-driver.js`. |
| Missing native O1 preserves scoring | Existing supplementary O1 branch retained; reference rows state phase attribution unavailable without synthesis. |
| Cooperative threat model | README and report metadata claim correlation/tamper detection only, never cryptographic authenticity. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Canonical profile sets, fixed policy, descriptor fields, candidate schema/ID, metrics and failure codes | Node `node:test` table tests with complete minimal records and one-field mutations. |
| Integration | Fresh/cache/recovery origins, exact shared identity, smoke non-publication, extended 9/9 publication | Temp directories, test-only capabilities, injected filesystem failures, and assertions that an old report remains byte-identical. |
| Contract | CLI selection and README command; no adaptive/default/CI activation | Source/CLI tests for `all`, `initial`, `extended`, and public `run.js benchmark`. |
| Live operational | Real nine-profile data | Run only `node scripts/evals/live-driver.js extended` with known model/effort and installed runtime; never fabricate a row when unavailable. |

Strict TDD apply should implement each pure validator and orchestration branch RED -> GREEN. `npm test` is sufficient for infrastructure verification; it must not invoke the live nine-profile suite.

## Migration / Rollout

No data migration is required. Existing per-profile cache entries use the old schema and therefore miss safely after the descriptor/schema change. Existing Sol/Luna observations remain documentation-only diagnostics. Rollout order is: land locally verified infrastructure; run smoke to confirm rapid cycles without reference publication; then, only on an authorized compatible host, run the documented extended command to create or replace the baseline. Rollback removes the v1 candidate path and restores the prior runner/report behavior; adaptive, promotion, model defaults, and CI remain untouched.

## Open Questions

None.
