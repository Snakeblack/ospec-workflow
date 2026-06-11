# sdd-baseline Specification

## Purpose

New capability: batched, resumable seeding of `openspec/specs/` with baseline specs of existing behavior on brownfield repos. Scope: prompt/Markdown layer (agent, skill, command) plus baseline artifacts under `openspec/specs/_baseline/`.

## Requirements

### Requirement: Batch 0 Domain Map

On its first run, `sdd-baseline` MUST scan the repository and produce a reviewable domain map of capability clusters (NOT directory listings). It MUST NOT write any domain spec until the user has reviewed the map.

#### Scenario: First run produces the map

- GIVEN a brownfield repo with no `_baseline/manifest.md`
- WHEN `sdd-baseline` runs
- THEN it returns a domain map of capability clusters for user review
- AND no `openspec/specs/{domain}/spec.md` is written in that batch

### Requirement: One Domain Per Batch

After batch 0, each batch MUST spec exactly one domain, writing `openspec/specs/{domain}/spec.md`, and MUST stop after that domain completes.

#### Scenario: Domain batch completes

- GIVEN an approved domain map with pending domains
- WHEN a batch runs
- THEN exactly one pending domain receives a baseline spec
- AND the agent returns `partial` (or `done` if it was the last pending domain)

### Requirement: Append-First Manifest

`openspec/specs/_baseline/manifest.md` MUST be the single source of batch progress. Entries MUST be appended only on domain completion and MUST include: domain, status, batch number, git commit hash, timestamp. The agent MUST read the existing manifest before appending and MUST NOT rewrite historical entries.

#### Scenario: Completion-only entry

- GIVEN a batch that completes a domain spec
- WHEN the batch finishes
- THEN one manifest entry is appended with domain, status, batch, commit hash, timestamp
- AND prior entries are unchanged

#### Scenario: Interrupted batch leaves no entry

- GIVEN a batch interrupted before the domain spec is complete
- WHEN the next batch starts
- THEN no manifest entry exists for that domain
- AND the domain is treated as pending and re-run from scratch

### Requirement: Resumability

On every launch, `sdd-baseline` MUST read the manifest, skip completed domains, and continue from the first pending domain. Resumption MUST work across sessions.

#### Scenario: Re-run after partial completion

- GIVEN a manifest with domains A and B done and C pending
- WHEN a new session launches `sdd-baseline`
- THEN it skips A and B and specs domain C

### Requirement: Skip Rule

`sdd-baseline` MUST NOT modify any domain that already has `openspec/specs/{domain}/spec.md` not created by baseline (e.g., promoted by `sdd-archive`). Refreshing a stale baseline-owned domain MAY occur and is not a skip-rule violation.

#### Scenario: Archive-owned domain collision

- GIVEN `openspec/specs/auth/spec.md` exists from an archived change
- WHEN `sdd-baseline` reaches the `auth` domain
- THEN it skips `auth` without writing
- AND records the skip in the manifest as skipped

#### Scenario: Stale baseline-owned refresh

- GIVEN a baseline-owned domain whose files changed since its recorded commit hash
- WHEN the user requests a refresh
- THEN only stale or pending domains are re-specced
- AND fresh and archive-owned domains are untouched

### Requirement: Lazy Index

`openspec/specs/_baseline/index.md` MUST carry a `source: local` marker and one line per domain with a reference to its spec. Lines MUST be appended on domain completion only; the index MUST NOT be rebuilt.

#### Scenario: Index accumulates append-first

- GIVEN an index with two domain lines
- WHEN a third domain completes
- THEN one line is appended for it
- AND existing lines and the `source: local` marker are unchanged
