# reference-host-adapter Specification

## Purpose

Wire exactly one real reference HostAdapter — Claude Code (`claude`) — that
translates host tools/frontmatter/UX/delegation/hooks into the host contract
without owning lifecycle, CAS, permits, or Graph authority.

## Requirements

### Requirement: Sole Wired Real Adapter Is Claude {#REQ-reference-host-adapter-001}

K2a MUST wire exactly one real product HostAdapter: Claude Code, identified as
`claude`. Other host targets MUST remain unactivated. The Headless Conformance
Host MUST NOT count as a second real product adapter.

#### Scenario: Only claude is activated

- GIVEN the K2a reference-adapter registry
- WHEN activated real adapters are listed
- THEN the list MUST contain exactly `claude`
- AND MUST NOT activate vscode, github-copilot, opencode, codex, or cursor

#### Scenario: Headless host is not a product adapter

- GIVEN Headless Conformance Host is available for fault fixtures
- WHEN real product adapters are inventoried
- THEN the conformance host MUST NOT appear as an activated real adapter

### Requirement: Claude Adapter Maps Into Contract Ports {#REQ-reference-host-adapter-002}

The `claude` HostAdapter MUST map Claude Code tools, frontmatter, UX,
delegation, and hooks into `HostCapabilities` and the five transports. Mapping
MUST preserve host-agnostic port shapes consumed by the core.

#### Scenario: Structured question maps to QuestionTransport

- GIVEN a Claude AskUserQuestion-style interaction
- WHEN the adapter translates it
- THEN it MUST surface through QuestionTransport
- AND MUST NOT mutate lifecycle status directly

#### Scenario: Hooks map without owning delivery policy

- GIVEN Claude plugin lifecycle hooks
- WHEN the adapter exposes them via DeliveryGateTransport or related ports
- THEN the adapter MUST NOT authorize delivery
- AND MUST leave policy decisions to later owning slices

### Requirement: Adapter Has No Lifecycle Or CAS Authority {#REQ-reference-host-adapter-003}

The reference adapter MUST NOT mint OperationPermits, call Authority Store
compareAndSwap, approve operations, set lifecycle status, or compile Graph IR.
Mutations MUST remain on the K2.1 permit + CAS path owned by the kernel.

#### Scenario: Adapter cannot advance Authority Store

- GIVEN the claude adapter runtime
- WHEN it attempts compareAndSwap or permit minting
- THEN the attempt MUST be unreachable or fail closed
- AND the Authority Store head MUST remain unchanged

### Requirement: Enforced Capabilities Carry Proof {#REQ-reference-host-adapter-004}

Every capability the `claude` adapter claims as `enforced` MUST have a
verifiable CapabilityProof bound to its adapter_version, host_version, fixture
and evidence_digest. Unproven claims MUST NOT be treated as enforced.

#### Scenario: Claude enforced capability has proof

- GIVEN the claude adapter declares capability C as `enforced`
- WHEN CapabilityProof verification runs for C
- THEN a valid proof MUST exist
- AND verification MUST succeed before enforcement

### Requirement: Other Hosts Stay Inactive Until K11a {#REQ-reference-host-adapter-005}

Non-claude host profiles MAY exist as documentation or inactive stubs. They
MUST NOT be wired as executable HostAdapters in K2a. Activation of additional
real adapters is owned by K11a.

#### Scenario: Inactive stub cannot satisfy sole-adapter gate

- GIVEN an inactive codex or cursor stub profile
- WHEN K2a sole-adapter conformance runs
- THEN the stub MUST NOT count as a wired real adapter
- AND the sole activated adapter MUST remain `claude`
