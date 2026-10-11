# brownfield-architecture-recovery

## Intent and acceptance

E2.5: recuperar arquitectura de un repo existente: mapa de componentes, límites y dependencias, ADRs inferidos (status inferred) y pistas de calidad con evidencia ruta:línea, divergencias sin sobrescribir

Acceptance: En un repositorio de ejemplo se obtiene un mapa de componentes y ADRs inferidos con evidencia ruta:línea que el lint valida contra el repositorio

## Plan

1. Contract: `ospec-component-map/v1` and `validateComponentMap`; `status: inferred` with required `evidence` on the ADR of `ospec-decision-record/v1`; `repository-evidence.js` resolves `path:line` under a root. A sample repository and its recovery (map, inferred ADR, knowledge map) as fixtures.
2. Skill: the brownfield path of `foundation` recovers the map, proposes inferred ADRs the user confirms or rejects, and records quality hints as `assumed` slots.
3. Docs: specs `component-map` and REQ-decision-records-006, agents spec, architecture README and roadmap (E2.5 done, E2.6 next).

## Decisions

All answered by the user ("las recomendadas") at the open-facts gate.

- **Recovery lives in the `foundation` skill**, not in `sdd-baseline`: IDD is the default path and SDD gets no new capability without demand.
- **Inferred ADR extends v1**, additively: the ADR status adds `inferred`, and `evidence` (`path:line` list) is required while inferred. Only an ADR may be inferred.
- **Unresolved evidence rejects** (rule `evidence`), never a warning: a missing file, a line past the end, a path outside the root or a non-relative path. Resolution runs only when the caller passes `root`; without it the check is structural.
- **No `ospec` command**: library and fixtures, as in E2.4.
- **Component map** at `docs/architecture/component-map.yaml`, contract `ospec-component-map/v1`: components, boundaries, dependencies, divergences; each entry cites at least one reference; references between entries must name known components.
- **Quality hints** are `assumed` knowledge-map slots with `source.kind: repository` and a `path:line` ref; the knowledge-map contract is unchanged.
- **Confirmation**: confirmed or corrected becomes `accepted` and keeps its evidence; rejected is not written and becomes a divergence with `rejected_adr`.
- **Sample repository is Python** under `schemas/foundation/component-map/fixtures/sample-repo/`, so no Node or Go tooling of this repository picks it up.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T12:55:41.913Z)
- ev-2: living-doc-current for living-doc (2026-10-11T12:55:44.299Z)
<!-- ospec:evidence:end -->
