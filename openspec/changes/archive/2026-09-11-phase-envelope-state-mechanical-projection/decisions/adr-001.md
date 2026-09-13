# ADR-001: Versioned Result Envelope v1 and Decoupled Human Renderer

- Status: proposed
- Change: phase-envelope-state-mechanical-projection
- Date: 2026-09-11

## Context
SDD phase agents currently duplicate output between human prose and fenced JSON blocks, leading to semantic drift, parsing ambiguity, and token waste. A machine-verifiable return contract is required to support JSON-only execution without sacrificing terminal and chat readability.

## Decision
Adopt a pinned JSON Schema contract (`result-envelope/v1`) in `schemas/kernel/` as the single canonical source of truth for phase returns, paired with a pure, read-only `renderEnvelopeToMarkdown` renderer in `scripts/lib/result-envelope.js` and a backward-compatible legacy envelope adapter.

## Alternatives
- Dual prose + JSON fence prompts: rejected because LLMs frequently drift or produce conflicting status values between sections.
- Regex scraping of human markdown: rejected due to brittle parsing and high maintenance overhead across disparate models.

## Consequences
Eliminates duplicate output generation in agents, simplifies orchestrator and hook parsing across JS and Go runtimes, and guarantees zero drift in user-facing markdown rendering. Backward compatibility is preserved via legacy adapter normalization.
