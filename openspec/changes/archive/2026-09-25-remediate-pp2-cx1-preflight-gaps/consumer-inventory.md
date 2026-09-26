# Consumer inventory (confirmation only)

Change: `remediate-pp2-cx1-preflight-gaps`

This inventory confirms that dual-hash replay, route `actual_route` fail-closed, and validate-phase root split do **not** couple into approvals, lineage, or recovery APIs beyond existing preservation rules.

| Consumer | Representative path | Relation to this change |
|---|---|---|
| Approvals | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Dual-hash compare does not read or write `approvals` from the envelope; reducer continues to preserve `current.approvals` on advance. |
| Lineage | `scripts/lib/review-lineage.js`, `gates.*` in `state.yaml` | Independent of payload-hash replay and of plugin/project root resolution; no API or schema change. |
| Recovery | Backup `.bak` + journal paths in Node/Go projection I/O | Still required for interrupted writes; `noop-replay` (canonical or v2.67 legacy match) must not mutate state or append journal records. |

## Non-coupling notes

- Dual-accept is compare-only; advances store the canonical hash exclusively.
- `routeSectionPresent` / `missing_actual_route` gate continuation; they do not invent routes or touch gate lineage objects.
- `validate-phase` resolves `openspec/*` under `projectRoot` and keeps `require("./lib/...")` on the plugin script location; recovery and lineage stores remain project-owned under the workspace.
