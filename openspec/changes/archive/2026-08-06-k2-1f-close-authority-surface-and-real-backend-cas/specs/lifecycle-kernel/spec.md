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

### Requirement: Internal Permit Authority Issuer Isolation {#REQ-lifecycle-kernel-027}

`createKernelRuntime` MUST NOT accept `options.permitIssuer` and MUST NOT expose a `permitIssuer` getter on runtime instances. `runKernelOperation` MUST remain strictly lexical private within `lifecycle-kernel/index.js` and MUST NOT be exported by `internal/permit-authority.js`, `permits.js`, `minimal-kernel-harness.js`, or any module in `scripts/lib/`. `minimal-kernel-harness` MUST NOT accept or inject external `permitLedger` into `createKernelRuntime`.

#### Scenario: KernelRuntime ignores caller permitLedger and hides internal issuer

- GIVEN a `KernelRuntime` instance created via `createKernelRuntime`
- WHEN `createKernelRuntime` is called with an explicit `options.permitIssuer` property
- THEN `createKernelRuntime` MUST ignore `options.permitIssuer` and construct a private internal `permitIssuer`
- AND `runtime.permitIssuer` MUST be `undefined`
- AND `runOperation` MUST NOT pass any caller-supplied `permitLedger` or `options.permitIssuer` to `runKernelOperation`
- AND `internal/permit-authority.js` MUST NOT export `runKernelOperation` or `setRunKernelOperation`

#### Scenario: Harness does not inject caller permitLedger into runtime

- GIVEN an execution through `minimal-kernel-harness.js`
- WHEN `runKernelOperation` or `runHarnessScenario` is invoked
- THEN `minimal-kernel-harness` MUST NOT accept external `permitLedger` to authorize mutations
- AND MUST construct `createKernelRuntime` with strictly default private authority isolation



