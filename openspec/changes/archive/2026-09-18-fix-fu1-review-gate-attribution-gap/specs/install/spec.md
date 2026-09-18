# Delta for install

## ADDED Requirements

### Requirement: Quality Review Attribution Build Propagation {#REQ-install-026}

When the Quality Review Gate attribution-resolution behavior changes
(`scripts/lib/review-dimensions.js`, `review-gate-state.js`,
`review-lineage.js`, or their skills/rules sources), the generated build MUST
be regenerated and validated for the four in-scope targets: `claude`, `vscode`,
`github-copilot`, and `opencode`. Each target's installer and validator
(`scripts/configure/install-*.js`, `validate-*.js`) MUST cover the attribution
behavior, including each target's native tool mappings where the target
expresses tools differently from the kernel vocabulary. `codex`, `cursor`, and
`antigravity` targets MUST remain unchanged by this propagation. Generated
dist MUST be validated per target via its `validate-*` entry point, and dist
tests MUST self-generate output in a temporary directory rather than read the
gitignored root `dist/`.

#### Scenario: Four targets regenerate with attribution changes

- GIVEN kernel review-dimensions/gate-state/lineage sources changed for attribution resolution
- WHEN the build is regenerated
- THEN `claude`, `vscode`, `github-copilot`, and `opencode` dist outputs MUST reflect the change
- AND each target's `validate-*` run MUST pass

#### Scenario: Native tool mappings cover attribution behavior per target

- GIVEN a target expresses review/gate tools with native mappings
- WHEN that target's generated output is validated
- THEN the attribution-resolution behavior MUST be present through its native tool mapping
- AND unmapped kernel tool references MUST fail that target's validation

#### Scenario: Out-of-scope targets are untouched

- GIVEN the regenerated build for the four in-scope targets
- WHEN `codex`, `cursor`, and `antigravity` outputs are compared to their prior build
- THEN those targets MUST remain byte-equivalent (no attribution-driven changes)
