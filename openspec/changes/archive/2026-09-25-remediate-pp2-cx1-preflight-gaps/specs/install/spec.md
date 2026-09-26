# Delta for install

## ADDED Requirements

### Requirement: Global Validate-Phase Separates Plugin and Project Roots {#REQ-install-027}

When `validate-phase` runs from a globally installed target layout, it MUST resolve the plugin/runtime root independently from the project workspace root. Project-owned OpenSpec state and artifacts under the consumer project's `openspec/` MUST be resolved relative to the project workspace, not relative to the plugin install location. Plugin/runtime assets required for validation MUST be resolved from the plugin/runtime root. Collapsing both roots into a single path MUST NOT be the default behavior for global installs.

This separation MUST hold for Claude Code and for at least one other globally installed target. An in-repository or repo-relative invocation MAY continue to resolve both roots consistently with the repository layout when plugin and project coincide, without relaxing the global-install separation requirement.

#### Scenario: Globally installed Claude Code validates project openspec

- GIVEN Claude Code is installed globally so the plugin/runtime root differs from the consumer project workspace
- AND the project workspace contains an `openspec/` tree for the active change
- WHEN `validate-phase` runs against that project
- THEN it MUST resolve plugin/runtime assets from the plugin/runtime root
- AND MUST resolve project `openspec/` paths from the project workspace
- AND MUST NOT require `openspec/` to live under the plugin install root

#### Scenario: At least one other globally installed target keeps the same root split

- GIVEN a second globally installed target other than Claude Code whose plugin/runtime root differs from the project workspace
- WHEN `validate-phase` runs for that target against the same project workspace
- THEN it MUST apply the same plugin-root versus project-workspace separation
- AND project `openspec/` MUST resolve from the project workspace

#### Scenario: Collapsed roots on global install fail closed or misresolution is rejected

- GIVEN a globally installed layout where plugin/runtime root and project workspace differ
- WHEN `validate-phase` would otherwise treat the plugin root as the sole project root for `openspec/` lookup
- THEN that collapsed resolution MUST NOT be accepted as a successful project validation
- AND the invocation MUST fail closed or otherwise refuse to treat plugin-local paths as the project's authoritative `openspec/`

#### Scenario: In-repo invocation remains valid when roots coincide

- GIVEN an in-repository invocation where the plugin/runtime root and project workspace are the same repository root
- WHEN `validate-phase` runs
- THEN it MUST still resolve project `openspec/` correctly
- AND MUST NOT break existing repo-relative validation solely because global-install root separation is required elsewhere
