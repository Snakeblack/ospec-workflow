# ADR-001: Publish a self-describing fixed-policy baseline

- Status: proposed
- Change: fixed-policy-reference-baseline
- Date: 2026-07-29

## Context

The existing reference report is a metrics-only Markdown table and can represent a three-row experiment. O2B requires a versioned 9/9 contract that retains complete identity and provenance and is replaced atomically.

## Decision

Represent the reference baseline as one `ospec-fixed-policy-reference-baseline/v1` candidate with shared identity and nine complete row records. Render that candidate into `scripts/evals/reports/reference-baseline.md` with a human table and canonical fenced JSON payload, and publish the single file only after fail-closed validation.

## Alternatives

- Metrics-only Markdown: rejected because it cannot retain complete machine-verifiable provenance.
- Separate Markdown and JSON outputs: rejected because the current publisher cannot atomically replace the pair.
- Database or external artifact store: rejected because it adds a dependency and exceeds the local/manual O2B scope.

## Consequences

Readers get one human- and machine-readable versioned artifact, and failed validation leaves the prior baseline unchanged. The report is larger and duplicates shared identity in row evidence, but compatibility can be audited without consulting ephemeral cache state. A future schema change requires a new schema version.
