# Archive Report: starlight-web-doc

**Change**: starlight-web-doc  
**Archived**: 2026-07-06  
**Route**: standard  
**Verification verdict**: PASS WITH WARNINGS (4R gate done with full remediation)  
**Delivery strategy**: size-exception (exception-ok approved)

## Change Summary

**Option D OpenWiki + Starlight Web Scaffold**: Introduces a new documentation scope choice (Option D) that generates a static Starlight scaffold under `web-doc/` alongside the full OpenWiki structure under `openwiki/`. The sync script (`scripts/sync-openwiki.mjs`) transforms `openwiki/` pages into web content with frontmatter injection, incremental caching, source-file link rewriting, and strict 1:1 parity maintenance.

**Key artifacts delivered**:
- 5 ADDED requirements (REQ-sdd-document-014..018): scaffold generation, sync script, frontmatter injection, link rewriting, parity maintenance
- 3 MODIFIED requirements (REQ-sdd-document-002, 006, 011): extended to support Option D dual-directory scope and metadata persistence
- 1 MODIFIED requirement (REQ-agents-006): extended to handle dual-directory sandbox verification

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| sdd-document | Updated | 5 ADDED requirements (REQ-014..018), 3 MODIFIED (REQ-002, 006, 011), clarifications added |
| agents | Updated | 1 MODIFIED requirement (REQ-006) for Option D dual-directory J5 post-run verification |

## ADRs Promoted to Project Memory

| File | Title | Status |
|------|-------|--------|
| `docs/adr/adr-20260706-001-scaffold-ships-as-verbatim-asset-files.md` | Scaffold ships as verbatim asset files, not LLM-authored prose | accepted |
| `docs/adr/adr-20260706-002-sync-as-zero-dependency-node-esm-script.md` | Sync as a zero-dependency Node ESM script inside the generated project | accepted |
| `docs/adr/adr-20260706-003-dual-directory-write-sandbox-modeled-as-approved-set.md` | Dual-directory write sandbox modeled as an approved SET | accepted |

All three ADRs from the change's `decisions/` directory have been promoted to living project memory with `Status: accepted`.

## Verification Highlights

**Verdict**: PASS WITH WARNINGS

**Test results**:
- Full suite: 1016/1017 pass (1 known flake, passing 9/9 in isolation)
- Remediation batch (Batch 2): 27/27 tests pass
- TDD compliance: 6/6 checks passed
- Spec compliance: 24/24 scenarios satisfied

**4R gate remediation** (approval-006): 1 BLOCKER + 3 CRITICAL + 4 WARNING items remedialized in strict TDD:
- 7 runtime tests reproduced RED→GREEN against pre-remediation code (cross-verified)
- 2 prose items (warnings 9/10) elevated from inspection-proof to static-proof
- 1 test-gap (warning 7.6, try/catch for prune rmSync) disclosed and accepted (W3; high-reversibility)

**Accepted risks and limitations**:
- W1/W2 (J5 behavioral scenarios): Inspection-proof evidence (acceptable per established pattern)
- W3 (7.6 test-gap): Disclosed deviation; fix mirrors already-tested patterns (7.3/7.4)
- All 10 assumptions unresolved (all high-reversibility): No escalation required per decision gates

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/starlight-web-doc/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 6 (from state.yaml phases.*.questions_asked)

## Route Completion Status

- **Status**: ready for archive move
- **Source directory**: `openspec/changes/starlight-web-doc/` (preserved for orchestrator verification)
- **Archive destination**: `openspec/changes/archive/2026-07-06-starlight-web-doc/`
- **Move verification**: Pending — orchestrator to verify copy inventory and delete source

---

## Notes for Continuation

The change is complete and verified. The orchestrator will verify the copy inventory against the destination and delete the source directory once confirmed. No user action required for archive completion.
