# Proposal: K2a — Headless Conformance Host + adapter real de referencia + CapabilityProof

## Intent

K2/K2.1 delivered a host-agnostic lifecycle with Authority Store, permits and
effect classes, but the core still has no product host contract: no
`HostCapabilities`, no transports, no CapabilityProof, and no conformance
surface for fault injection. K4a/K6a/K10-delivery cannot degrade honestly or
exercise isolation/delivery hooks without inventing per-target lifecycle.

K2a closes that gap **before** Candidate freeze (K3) and Graph (K4a): a
host-agnostic contract consumed by the core, a Headless Conformance Host for
faults, and exactly one real reference adapter with enforceable proofs. Source
of truth: `docs/roadmaps/harness-evolution.md` §K2a and
`docs/architecture/harness-evolution.md` (closes open decision #13).

## Scope

### In Scope

- Host-agnostic contract: `HostCapabilities`, `HostAdapter`,
  `ExecutionTransport`, `QuestionTransport`, `WorkerTransport`,
  `ToolExecutionTransport`, `DeliveryGateTransport`.
- Capability states: `enforced` | `partial` | `instructional` | `unavailable`.
- `CapabilityProof`: enforce only with reproducible
  `adapter_version` + `host_version` + fixture + `evidence_digest`.
- Headless Conformance Host with fault matrix (timeout, cancel, worker fail,
  interrupt).
- Exactly one real reference adapter: **Claude Code** (`claude`) — see Approach.
- Core must not import concrete host APIs from lifecycle / Graph / receipt
  modules; conformance rejects adapters that duplicate lifecycle or Graph
  semantics.
- `DeliveryGateTransport` + `WorkerTransport` expose ports for later
  K6a/K10-delivery **without** adapter-owned policy.
- Preserve K2/K2.1 host-agnostic lifecycle; do not reopen CAS/permits.

### Out of Scope

- Second target / multi-host parity / cross-host degradation fixtures (K11a).
- Model routing, ownership scheduler, role consolidation (K11b–K11d).
- Global harness defaults / fixed-policy promotion.
- K3 Candidate freeze, K4a Graph, productive K5 budgets, K8 attestation,
  K10-delivery policy productization.

## Capabilities

### New Capabilities

- `host-capabilities-contract`: schemas and rules for `HostCapabilities`,
  `HostAdapter`, the five transports, and capability-state semantics
  (honest degradation; no silent `unavailable`/`instructional` → `enforced`).
- `capability-proof`: reproducible proof required before any capability may be
  treated as `enforced`; digest binding to adapter/host/fixture.
- `headless-conformance-host`: deterministic conformance host exercising the
  contract with fault injection (timeout, cancel, worker fail, interrupt);
  rejects lifecycle/Graph-duplicating adapters.
- `reference-host-adapter`: sole wired real adapter for Claude Code translating
  tools/frontmatter/UX/delegation/hooks into the contract; no lifecycle or
  CAS/permit authority.

### Modified Capabilities

- `lifecycle-kernel-runtime`: consume host contract via ports only; keep
  mutations on K2.1 permit+CAS; forbid concrete host imports in lifecycle/
  Graph/receipt modules (adjust K2 scope-guard accordingly).
- `minimal-kernel-harness`: remain protocol harness; wire or peer with
  Headless Conformance Host for host-fault matrix without owning host policy.
- `kernel-contract-schemas`: versioned host/capability-proof/transport
  contracts; do not overload `receipt/v1` or OperationReceipt.
- `harness-authority-canon`: mark K2a host contract + CapabilityProof as
  implemented for this slice; OpenSpec+Git remain semantic authority; adapters
  are not authority.
- `lifecycle-model-conformance`: add host-agnostic invariants (no concrete host
  import; no silent capability promotion) where owned.

## Approach

Extend the K2/K2.1 functional-core / imperative-shell (CommonJS, Node 22+, no
new runtime frameworks). Strict TDD (`strict_tdd: true`) for all production
modules.

**Reference host (evidence, not product preference):** `docs/target-capabilities.md`
shows Claude Code uniquely combines structured `AskUserQuestion`, parallel
subagents, background tasks, full plugin lifecycle hooks, and documented
headless CI (`claude -p --bare` + `--json-schema` / `--permission-mode` /
`--plugin-dir` in `docs/roadmaps/targets/target-claude.md`). Codex/Cursor have
hooks but degrade QuestionTransport; VS Code has structured questions but no
plugin hooks / parallel / background; github-copilot and opencode are thinner.
Claude maximizes reproducible coverage of K2a transports for one adapter.

1. Define versioned host-contract schemas + CapabilityProof digest rules.
2. Implement Headless Conformance Host as the fault-injection / conformance
   driver (not a second product target).
3. Implement Claude `HostAdapter` mapping profile tools/hooks into transports;
   leave other targets unactivated.
4. Enforce capability states: `enforced` requires proof; silent promotion is a
   conformance failure.
5. Keep lifecycle/Graph/receipt free of concrete host imports; conformance
   fails adapters that own lifecycle/Graph/policy.
6. Expose DeliveryGate/Worker transport ports as opaque hooks for K6a/K10 —
   no delivery policy in the adapter.
7. Expand tests under Strict TDD; fixed path no-regression.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/host-contract/` (or equiv.) | New | HostCapabilities, transports, adapter ports |
| `scripts/lib/capability-proof/` (or equiv.) | New | Proof verify + evidence digests |
| `scripts/lib/headless-conformance-host/` (or equiv.) | New | Fault-matrix conformance runner |
| `scripts/lib/host-adapters/claude/` (or equiv.) | New | Sole real reference adapter |
| `scripts/lib/lifecycle-kernel/` | Modified | Port consumption; scope-guard for concrete hosts |
| `scripts/lib/minimal-kernel-harness.js` | Modified | Peer/wire host-fault scenarios |
| `scripts/lib/target-profiles/claude.js` | Modified | Capability declaration hooks for proof |
| `schemas/kernel/` (or host schemas) | New/Modified | Host/proof/transport contracts + fixtures |
| `docs/target-capabilities.md` | Modified | Align matrix with CapabilityProof states |
| `scripts/**/*.test.js` | New/Modified | Strict TDD + conformance/proof coverage |
| `openspec/specs/*` | Modified on archive | Promote new + delta capabilities |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep into K3/K4a/K8/K10-delivery policy | High | Explicit out-of-scope; opaque ports only |
| Silent capability promotion to `enforced` | High | Proof-gated enforcement; conformance fails promotion |
| Adapter owns lifecycle/Graph/CAS | High | Conformance reject + scope-guard on kernel modules |
| Wrong reference host locks vertical | Med | Evidence matrix; K11a can expand; adapter is swappable behind contract |
| Conformance host confused with Minimal Kernel Harness | Med | Distinct modules/kinds; harness stays protocol-only |
| Review LOC overrun | Med | `delivery_strategy: exception-ok`; slice contract → proof → headless → claude adapter |

## Rollback Plan

1. Revert host-contract, CapabilityProof, Headless Conformance Host, and Claude
   reference-adapter modules/schemas.
2. Restore K2.1 lifecycle scope-guard forbidding host symbols in kernel tree.
3. Leave K1/K2/K2.1 Authority Store, permits, effect classes, journal and fixed
   defaults intact.
4. Do not rewrite review/archive lineages or reopen CAS/permit redesign.
5. Keep failed conformance/proof diagnostics as non-authoritative evidence.

## Dependencies

- K2.1 `k2-1-authority-store-permits` done (archive `2026-08-04-k2-1-authority-store-permits`, v2.39.0).
- Reuses: lifecycle kernel, Authority Store/permits, Minimal Kernel Harness,
  lifecycle model, target profile `claude`, `docs/target-capabilities.md`.
- Blocks K3 / K4a vertical on the reference host; K11a expands remaining five.

## Success Criteria

- [ ] Core speaks only `HostCapabilities` + transports; 0 concrete host imports
      in lifecycle / Graph / receipt modules.
- [ ] Headless Conformance Host covers timeout, cancel, worker fail, interrupt.
- [ ] Exactly one real adapter wired (`claude`); other hosts not activated.
- [ ] Every `enforced` capability has reproducible CapabilityProof
      (adapter_version, host_version, fixture, evidence_digest).
- [ ] `unavailable` / `instructional` never silently promote to `enforced`.
- [ ] Conformance rejects adapters that duplicate lifecycle or Graph semantics.
- [ ] DeliveryGateTransport + WorkerTransport usable later by K6a/K10-delivery
      without adapter-owned policy.
- [ ] K2/K2.1 CAS/permit/effect path unchanged (no redesign).
- [ ] Fixed path without regressions.
- [ ] Reference host choice justified by reproducible-capability evidence
      (Claude Code per target-capabilities matrix + headless docs).
