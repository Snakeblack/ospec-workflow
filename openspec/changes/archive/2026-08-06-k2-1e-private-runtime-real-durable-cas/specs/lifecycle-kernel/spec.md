# lifecycle-kernel Specification

## Added Requirements

### Requirement: Post-CAS Receipt Revision Binding {#REQ-lifecycle-kernel-023}

`OperationReceipt.revision` MUST be assigned to the post-CAS winning head revision `R1` (the new head revision resulting from the successful mutation), NOT the pre-CAS expected revision `R0`.

#### Scenario: Receipt revision binds to winning post-CAS revision

- GIVEN an operation executing against head revision R0
- WHEN `compareAndSwap` commits the mutation and advances head to revision R1
- THEN the returned `OperationReceipt.revision` MUST equal R1
- AND MUST NOT equal pre-CAS revision R0

#### Scenario: Replayed operation preserves winning revision receipt

- GIVEN an operation previously committed at revision R1 with recorded `OperationReceipt`
- WHEN the exact same operation is replayed
- THEN the replayed receipt's revision MUST equal R1

### Requirement: Encapsulated Kernel Runtime {#REQ-lifecycle-kernel-024}

`createKernelRuntime(options)` MUST be the sole public entrypoint for runtime operations and transition permit issuance, without revealing internal capabilities (`getPrivateIssuer`, permit authority symbols, or raw minting functions) on its return surface.

#### Scenario: createKernelRuntime serves as sole entrypoint for runtime operations and permit issuance

- GIVEN the `lifecycle-kernel` module
- WHEN external consumers initialize the lifecycle runtime
- THEN `createKernelRuntime(options)` MUST provide the complete capability surface for executing operations and issuing permits
- AND MUST NOT require importing low-level permit issuer factories or internal symbols

#### Scenario: Internal permit issuance capabilities are unexposed outside runtime closure

- GIVEN a runtime instance created via `createKernelRuntime`
- WHEN inspecting the properties and methods on the returned runtime object
- THEN internal capabilities such as `getPrivateIssuer` or raw permit minting functions MUST NOT be accessible
