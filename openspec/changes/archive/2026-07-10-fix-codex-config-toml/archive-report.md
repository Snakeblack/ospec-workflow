# Archive Report: fix-codex-config-toml

**Change**: fix-codex-config-toml  
**Archive mode**: Historical copy-only exception  
**Archived at**: 2026-07-10T21:24:03Z

## Exception and Rationale

This archive is explicitly authorized as an exception. The change predates later
archived Codex work whose verified specifications and runtime evidence supersede
the incomplete evidence in this change's `verify-report.md`. That report remains
unchanged and retains its `FAIL` verdict for auditability; this report does not
reinterpret it as a passing verification.

The user authorized this exception on 2026-07-10, explaining that later archived
changes had resolved the issue using another source of truth. The exception is
recorded in `state.yaml` approval `approval-010`.

## Current Sources of Truth

The following later archives and current baselines provide the authoritative
post-change behavior:

| Source | Evidence now relied on |
|---|---|
| `2026-07-08-codex-target-profile` | Establishes the Codex target profile and its validated generated artifact shape. |
| `2026-07-09-codex-installer` | Historical installer/config-merge design, later superseded where it conflicts with current behavior. |
| `2026-07-10-codex-target-phase-2` | Verified `PASS WITH WARNINGS`; proves the published-payload smoke in `npm test` and requires `.codex/config.toml` to remain untouched. |
| `openspec/specs/install/spec.md` §1.3 | Current install baseline: generated Codex output and project installation MUST NOT create or modify `.codex/config.toml`. |
| `openspec/specs/codex-target/spec.md` | Current Codex target baseline, maintained after the later archived changes. |

`fix-codex-config-toml` has no `specs/` directory or delta specifications.
Therefore this archive makes **no mutation** to `openspec/specs/**`; it is a
copy-only historical archive and cannot overwrite the newer baselines.

## Verification Exception Scope

The unresolved items recorded by this change were:

- missing executed remote release/CLI proof; and
- nonconforming Strict-TDD RED/GREEN evidence markers.

They are not erased. The later `codex-target-phase-2` verification supplies the
newer published-payload runtime smoke and the current install baseline; it is
the authoritative evidence for subsequent work. This historical change is not
promoted as independently verified.

## ADR and Memory Handling

No change-local ADR was promoted. `decisions/adr-001.md` and
`decisions/adr-002.md` both have `Status: proposed` and describe an earlier
marketplace approach superseded by the later source of truth. `state.yaml` has
no resolved `open_decisions`, so no operative-memory entry was written.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/fix-codex-config-toml/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

## Copy Inventory

The following active-change files were copied, without deletion of the source:

- `apply-progress.md`
- `archive-report.md`
- `design.md`
- `exploration.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`

**Destination**: `openspec/changes/archive/2026-07-10-fix-codex-config-toml/`

The source directory remains active until the orchestrator independently
compares source and destination inventories and performs any deletion.
