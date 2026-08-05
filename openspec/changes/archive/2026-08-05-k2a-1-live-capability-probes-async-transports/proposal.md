# Proposal: k2a-1 — Live Capability Probes + Async Transports

## Intent

K2a (v2.40.0) shipped Headless Conformance Host, Claude reference adapter, and
CapabilityProof, but three CRITICAL gaps remain before K3 runtime:
`verifyCapabilityProof` binds digests to versions declared **inside** the proof
(not live adapter identity); Claude marks all five transports `enforced` from
fixture digests without live probes; transport invocation is sync and can miss
rejected Promises. K3 runtime stays blocked until this corrective closes.
Source: `openspec/memory/handoff-pre-k3-correctives.md`; parent archive
`2026-08-04-k2a-headless-conformance-host`.

## Scope

### In Scope

- **CRITICAL 3:** `verifyCapabilityProof` requires expected live identity
  (`expectedAdapterId`/`Version`, `expectedHostRuntimeVersion`,
  `expectedProbeDigest`) and rejects mismatched proof/evidence/fixture/probe.
- **CRITICAL 4:** Without real host primitives, Claude declarative fallbacks
  resolve to `unavailable` | `instructional` | `partial` — never `enforced`.
  `enforced` only after a live probe (worker spawn/cancel/fail, observable
  delivery hook, real question transport, or explicit instructional).
- **CRITICAL 5:** Ports return `Promise<TransportOutcome>` with `AbortSignal` /
  deadline / `requestId`; headless host + kernel boundary `await` + `catch`;
  never wrap a rejected Promise as `ok: true`.
- **W1:** Fault matrix fails **through** adapter ports (not only synthetic
  `injectFault`).
- **W2:** Additive schema family `transport-request` / `transport-outcome` /
  `transport-failure` v1 (do not silently mutate existing transport v1 schemas).
- **W3:** Deep-freeze / immutable port wrappers after `createHostAdapter`.
- **W4:** Negative runtime test — Minimal Kernel Harness alone (no Headless peer)
  does not satisfy host-fault coverage (`known-issues.md`).

### Out of Scope

- K3 Candidate freeze / identities / relation algebra runtime
- Reopen K2.1b CAS/permits (except regression)
- Multi-process durable ledger; multi-host parity (K11a)

## Capabilities

### New Capabilities

- None (corrective tightens existing K2a domains)

### Modified Capabilities

- `capability-proof`: live expected-identity + probe-digest binding on verify;
  reject foreign adapter/version/host/fixture/probe.
- `host-capabilities-contract`: async port contract (`Promise` + AbortSignal /
  deadline / requestId); structured failure classification; immutable ports.
- `reference-host-adapter`: Claude `enforced` only after live probe; honest
  degradation without primitives.
- `headless-conformance-host`: fault matrix traverses adapter ports; await+catch
  async outcomes.
- `kernel-contract-schemas`: additive `transport-request` /
  `transport-outcome` / `transport-failure` v1 families + fixtures.
- `minimal-kernel-harness`: negative harness-alone host-fault incompleteness
  runtime assertion (closes W4 / REQ-009 scenario).
- `lifecycle-kernel-runtime`: host-boundary await+catch; never treat rejected
  Promise as success.

## Approach

Strict TDD (Node 22+, CommonJS, `npm test`). Extend K2a modules in place:

1. Widen proof verify API with expected live identity/probe fields; fail closed
   on mismatch (keep digest reproducibility).
2. Split Claude capability resolution: probe → `enforced`; else degrade honestly.
3. Normalize async invoke path shared by headless host and
   `lifecycle-kernel/host-boundary.js`.
4. Rework fault injection to drive failing port implementations through the
   adapter, keeping synthetic helpers non-normative.
5. Publish additive transport request/outcome/failure schemas; deep-freeze
   adapter surfaces; add harness-alone negative test.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/capability-proof/` | Modified | Live expected-identity verify |
| `scripts/lib/host-contract/` | Modified | Async normalize, deep-freeze ports |
| `scripts/lib/host-adapters/claude.js` | Modified | Live-probe gated `enforced` |
| `scripts/lib/headless-conformance-host.js` | Modified | Await+catch; fault via ports |
| `scripts/lib/lifecycle-kernel/host-boundary.js` | Modified | Async observe + catch |
| `scripts/lib/minimal-kernel-harness*.js` | Modified | W4 negative test |
| `schemas/kernel/` | New/Modified | transport-request/outcome/failure v1 |
| `scripts/**/*.test.js` | New/Modified | Acceptance gates under Strict TDD |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing proof callers | High | Additive expected-* args; migrate call sites in-change |
| Claude fixture proofs still count as live | High | Spec: fixture digest ≠ live probe; tests refuse fixture-only `enforced` |
| Silent mutation of transport v1 schemas | Med | Additive families only; pin existing `$id`s |
| Review LOC overrun | Med | `delivery_strategy: exception-ok`; slice proof → async → claude → faults |

## Rollback Plan

1. Revert proof API, async boundary, Claude probe gating, fault-via-port, and
   additive transport schemas.
2. Leave K2a archive artifacts and K2.1b CAS/permits untouched.
3. Keep K3 runtime blocked until a successor corrective lands.
4. Do not rewrite 4R lineages or reopen host-contract authority rules.

## Dependencies

- Parent: `k2a-headless-conformance-host` archived (v2.40.0); K2.1b closed v2.40.1.
- Blocks: K3 runtime (proposal/spec/design MAY proceed offline; no freeze-candidate
  authority on K2a `enforced` until this change archives).

## Success Criteria

- [ ] Missing primitive ≠ `enforced`
- [ ] Proof from another adapter/version/host rejected against live expected identity
- [ ] Async rejection → structured failure (`ok: false`); never `ok: true`
- [ ] Timeout/cancel via `AbortSignal` / deadline
- [ ] Fault matrix outcomes traverse adapter ports
- [ ] Claude marks `enforced` only for live-demonstrated capabilities
- [ ] Harness-alone negative test asserts incomplete host-fault coverage
- [ ] No K2.1b CAS/permit regression; K3 runtime still blocked until archive

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created
following the `<tipo>/<descripción>` convention (e.g.
`git checkout -b feat/k2a-1-live-capability-probes-async-transports main`).
