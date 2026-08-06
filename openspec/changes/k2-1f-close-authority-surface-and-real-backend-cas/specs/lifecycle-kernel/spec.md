# lifecycle-kernel Specification Delta

## Purpose

Restrict public production exports to encapsulate permit issuance, making `createKernelRuntime` the sole entrypoint and delegating direct minting test helpers to `test-support`.

## Requirements

### Requirement: Complete Public Surface Encapsulation {#REQ-lifecycle-kernel-025}

`_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, `runKernelOperation` MUST NOT be exported from public production module interfaces. `createKernelRuntime(options)` MUST be the sole public entrypoint for runtime operation execution & transition permit issuance.

#### Scenario: Low-level permit functions are unexported from production interface

- GIVEN the public export surface of `lifecycle-kernel` (`scripts/lib/lifecycle-kernel/index.js`)
- WHEN inspecting exported functions, classes, and symbols
- THEN `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer`, and `runKernelOperation` MUST NOT be exported

#### Scenario: createKernelRuntime serves as sole public entrypoint

- GIVEN an external caller interacting with `lifecycle-kernel` in production
- WHEN initializing or operating the lifecycle kernel
- THEN `createKernelRuntime(options)` MUST be the sole public entrypoint exported from the primary production entrypoint
- AND runtime operation execution and permit issuance MUST be performed exclusively through the returned `KernelRuntime` instance

### Requirement: Isolated Test Support Module {#REQ-lifecycle-kernel-026}

Test helpers requiring direct permit minting MUST be isolated in `scripts/lib/test-support/` and NEVER re-exported on production entrypoints.

#### Scenario: Direct permit minting test helpers reside in test-support

- GIVEN unit or integration test suites requiring direct permit minting capabilities
- WHEN importing test helper utilities
- THEN those helpers MUST be imported strictly from `scripts/lib/test-support/` (e.g. `kernel-helpers.js`)
- AND MUST NOT be exposed or re-exported by any production module in `scripts/lib/lifecycle-kernel/`
