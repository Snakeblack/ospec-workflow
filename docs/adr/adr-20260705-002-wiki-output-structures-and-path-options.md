# ADR-002: Wiki Output Structures and Path Options

- Status: accepted
- Change: add-documenter-agent
- Date: 2026-07-05

## Context

The documentation-generating agent needs to write synthesized repository data to disk. We must support multiple output options (Option A: Full Wiki, Option B: SDD Focus, Option C: Custom path) while ensuring the agent does not write files in unauthorized areas of the workspace.

## Decision

Support three distinct output path modes (Option A: `openwiki/` with subfolders matching OpenWiki conventions; Option B: `docs/wiki/` with standard SDD files; Option C: validated user custom directory). Dynamically restrict the agent's filesystem write capability (tool boundaries) exclusively to the chosen and approved output folder path, throwing an error on write attempts outside this directory.

## Alternatives

- Hardcode a single output directory (e.g. `docs/wiki/` only): Rejected because it fails to satisfy the OpenWiki quality target (Option A) and lacks flexibility for custom configurations.
- Grant unrestricted write access: Rejected because it poses a risk of writing files in arbitrary directories or overwriting source code.

## Consequences

- Easy: Isolates generated documentation under a dedicated folder namespace depending on the chosen option.
- Hard: Restricts filesystem write operations dynamically, requiring path boundary verification at runtime. Reversible by selecting a different option.
