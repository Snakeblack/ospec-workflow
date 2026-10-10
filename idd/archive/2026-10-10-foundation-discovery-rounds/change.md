# foundation-discovery-rounds

## Intent and acceptance

Completar foundation como descubrimiento reanudable: ingesta de fuentes y actualización incremental de docs/product, docs/architecture y docs/roadmap, cumpliendo los seis escenarios del diseño holístico.

Acceptance: Ningún scaffold ni código se genera sin aprobación, y se cumplen los escenarios CLI local, SaaS pequeño, regulado, brownfield documentado, fuente desactualizada y cambio pequeño posterior. El lint de ADR queda en E2.4.

## Plan

1. Encode the six acceptance scenarios in `skills/foundation/SKILL.md` and lock them with tests on that text and on document fixtures. No scaffold or code is written without approval. A stale source is recorded in the documents with the existing `unknown` or `assumed` slot. Brownfield preserves prior content, records divergences and proposes a focused delta. A small later change writes only that delta.
2. Add `skills/cncf-landscape/SKILL.md` to the default install. Foundation loads it only for a platform decision that lacks a supported alternative, or when the user asks. Raise the context ceilings by that one listed skill and mark E2.3 done on the roadmap.

## Decisions

- **Skill contract, not a new CLI.** The six scenarios are rules of the foundation skill. `ospec foundation next` and `record` stay as E2.2 left them.
- **Brownfield stops at documents.** Inferring components and writing an ADR with `status: inferred` stays in E2.5.
- **cncf-landscape ships by default.** It is not an extra: foundation must load it without `--with-extras`. The body holds rules and pointers, never the CNCF catalog. The extra listed skill raises the context ceiling. Always-on context does not change.
- **Stale is not a map state.** Revision, date and the unknown dependent decision stay in the documents. The E2.1 schema does not gain `stale`.
- **A small later change is a skill rule.** `foundation next` does not change behavior when the map already covers the first slice.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-10T14:50:56.964Z)
- ev-2: living-doc-current for living-doc (2026-10-10T14:51:09.138Z)
<!-- ospec:evidence:end -->
