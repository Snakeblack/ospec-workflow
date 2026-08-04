# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: Host Contract Consumed Via Ports Only {#REQ-lifecycle-kernel-runtime-013}

The lifecycle kernel MUST consume host behavior exclusively through the
host-agnostic contract ports (`HostCapabilities` and the five transports). It
MUST NOT branch on concrete host product identities for transition selection,
permit minting, or CAS commits. K2.1 OperationPermit + compareAndSwap mutation
semantics MUST remain unchanged.

#### Scenario: Transition selection uses ports not host brand

- GIVEN two HostAdapters exposing equivalent HostCapabilities and transport
  outcomes
- WHEN `status` and `next_transition` are evaluated
- THEN results MUST NOT differ solely because of concrete host product id
- AND permit + CAS requirements MUST still apply

#### Scenario: Host port failure does not bypass permit CAS

- GIVEN a transport fault reported through a host port
- WHEN the kernel continues after the fault
- THEN authoritative mutation MUST still require OperationPermit + CAS
- AND MUST NOT invent a host-local mutation path

### Requirement: No Concrete Host Imports In Lifecycle Graph Receipt {#REQ-lifecycle-kernel-runtime-014}

Lifecycle, Graph, and receipt modules MUST NOT import concrete host product APIs
or concrete host-adapter implementations. Host integration MUST occur only at
explicit port/adapter boundaries outside those modules. A scope-guard MUST fail
closed when such an import is detected.

#### Scenario: Concrete host import in lifecycle module fails guard

- GIVEN a lifecycle module that imports a concrete `claude` host API or adapter
  implementation
- WHEN the host-import scope-guard runs
- THEN the guard MUST fail closed
- AND MUST identify the offending module path

#### Scenario: Port-only consumption passes guard

- GIVEN lifecycle modules that depend only on host-contract port types/interfaces
- WHEN the host-import scope-guard runs
- THEN the guard MUST pass
- AND Graph/receipt modules MUST likewise remain free of concrete host imports
