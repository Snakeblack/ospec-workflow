# ADR-002: Generalist decision is not a specialist finding

- Status: accepted
- Change: selective-4r-generalist-review
- Date: 2026-07-16

## Context
O5 adds a broad first-pass reviewer without weakening the authority or compatibility of the existing 4R specialists.

## Decision
Embed exactly one `{status, specialists, reason}` decision in the standard successful result envelope with `artifacts: []`. The generalist may identify signals but cannot emit findings, severity, specialist conclusions, or remediation.

## Alternatives
- Reuse outer envelope status: breaks the shared success/partial/blocked enum.
- Return specialist findings: conflates screening with authoritative review.
- Return prose only: cannot be validated or merged safely.

## Consequences
The shared envelope remains compatible and specialist contracts stay unchanged. A dedicated validator is required, and malformed decisions block before specialist dispatch. The boundary is easily reversible by removing the generalist phase.
