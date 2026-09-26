# Engineering Judgment

Use this reference within the assigned design, implementation, or review scope. It defines reasoning criteria, not a new phase, gate, artifact, or permission to expand remediation. Existing behavior contracts, routing, and frozen review lineage remain authoritative.

## Ground decisions in the change

Start from the required behavior and inspect the affected code. Identify who owns the data and side effects, which dependencies cross a boundary, and which invariants must survive success, failure, and retry where relevant. Cite a requirement, concrete path/contract, observed failure, or measured constraint for a material decision; distinguish evidence from assumptions using the existing phase envelope.

For a consequential choice, compare the simplest viable local change with a realistic alternative. Explain the tradeoff that changes the decision: coupling, operational cost, compatibility, or reversibility. Do not manufacture alternatives for routine edits or reproduce the same rationale in several sections.

## Make quality claims verifiable

Select only quality attributes affected by the change or required by its contract. Express each material concern as **trigger and conditions → observable response → verification**. Use an agreed threshold or measured baseline when available; never invent an SLA or claim that a tool proves more than it observes. Examples:

- If a request can be retried after a timeout, identify the owner of duplicate prevention and verify the allowed number of side effects with the actual retry path.
- If latency motivates a change, name the representative workload, measurement, and acceptance target or unresolved target; a unit test alone is not performance evidence.
- If maintainability motivates reuse, name the shared invariant and show which callers can change independently without importing unrelated policy.

Use the smallest verification surface that observes the risk: boundary/integration checks for wiring and failure propagation, focused unit tests for isolated logic, measurements for resource claims. Record unavailable evidence as a limitation, not a pass. No attribute inventory or extra test layer is required for an unaffected concern.

## Keep structure proportional

Prefer an existing helper or a local implementation when it satisfies the contract. Reuse is justified by shared semantics and ownership, not similar syntax; a little duplication can be cheaper than coupling unrelated policies. Add an interface, layer, dependency, configuration switch, or extension point only for a present requirement or demonstrated constraint, and explain its cost. Do not build for hypothetical consumers.

Apply relevant skill rules to the actual paths and action, within the established skill-loading protocol. A skill's example or preferred pattern is not evidence that this change needs that architecture. Preserve compatible conventions; when a convention conflicts with the accepted contract, cite the conflict and use existing blocker routing rather than silently redesigning.

Refactoring serves the assigned behavior or a demonstrated defect. Do not extract functions merely to reduce mock counts, create abstractions to satisfy a template, or clean unrelated code. During remediation, use only frozen findings and permitted paths; unrelated discoveries remain non-blocking follow-ups. Review findings need concrete impact and evidence, not a preference for a different architecture.
