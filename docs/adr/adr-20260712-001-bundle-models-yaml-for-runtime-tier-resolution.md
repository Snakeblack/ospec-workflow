# ADR-001: Bundle models.yaml for runtime tier resolution

- Status: accepted
- Change: extend-phase-cost-telemetry
- Date: 2026-07-11

## Context

O1 records the model tier for every phase dispatch, and `models.yaml` is the authoritative agent-to-tier policy. Runtime hook bundles currently omit that file, while the Go binary cannot reliably infer the plugin root from its executable location alone.

## Decision

Ship `models.yaml` in generated targets. Node resolves it relative to the hook bundle; the launcher passes `OSPEC_PLUGIN_ROOT` to the Go binary, whose minimal reader uses that root. Both readers resolve `agents[agent]`, then `_default`, and return `unknown` on any failure or undeclared tier.

## Alternatives

- Accept a host-supplied tier: duplicates policy and can drift from configuration.
- Embed mappings in each runtime: creates multiple configuration sources.
- Import generator parsing code at runtime: violates the intentional runtime/generator split.

## Consequences

Tier data is consistent across JS and Go at the cost of shipping one small configuration file and a launcher environment variable. The choice is reversible by replacing the runtime source or moving the policy to another explicit runtime configuration.
