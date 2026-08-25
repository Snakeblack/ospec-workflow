# Delta for sdd-document

## ADDED Requirements

### Requirement: Factual Verification Pass {#REQ-sdd-document-020}

Between writing all wiki pages and the cleanup step, the agent MUST run a factual verification pass over every generated or updated page: each quantitative claim (counts, thresholds, limits, sizes, versions) and each cited code identifier (file path, command name, function or config key) MUST be contrasted against the repository using search/read tools, and the per-claim outcome MUST be recorded during the run (never in the final output). The agent MUST NOT publish a figure or identifier from memory without this contrast.

A claim that fails verification MUST be corrected to match the repository or removed; the agent MUST NOT leave a known-stale value in the published page.

#### Scenario: Cited figure contrasted before publication

- GIVEN a generated page states a numeric limit attributed to the codebase
- WHEN the factual verification pass runs
- THEN the agent MUST have located the defining source via search/read and contrasted the figure against it
- AND the published figure MUST match the current source value

#### Scenario: Failed verification corrects or removes the claim

- GIVEN the pass finds a cited figure or identifier that does not match the repository
- WHEN the agent resolves the finding before cleanup
- THEN it MUST update the claim to the verified value or delete the claim entirely
- AND the published page MUST NOT retain the stale value

#### Scenario: Cited identifiers resolve

- GIVEN a page references commands, scripts, functions, or config keys
- WHEN the pass verifies that page
- THEN every referenced identifier MUST resolve to an existing definition or declaration in the repository
- AND an unresolvable reference MUST be corrected or removed

---

### Requirement: Measurable Output Checklist {#REQ-sdd-document-021}

After all wiki files are written, the agent MUST evaluate a measurable exit checklist instead of relying on declarative style rules. The checklist MUST cover, for every page in the run's output:

| Check | Threshold |
|---|---|
| Substantive content | every page has at least 30 substantive lines |
| Link graph | every page has at least 1 outgoing wiki-internal link AND at least 1 incoming link |
| Flow diagrams | every flow/architecture-oriented page embeds at least 1 Mermaid diagram |
| Diagram syntax | every Mermaid block is syntactically valid, with special-character labels quoted |

A check that fails without an explicit justification recorded in the return envelope MUST be remediated before the run completes (merge the thin page, add links, add the diagram, fix the syntax); the agent MUST NOT finish with an unjustified failing check.

#### Scenario: Thin page merged before close

- GIVEN post-write inspection finds a page with fewer than 30 substantive lines
- WHEN the checklist runs
- THEN the agent MUST merge the page into a broader page or quickstart before completing the run
- AND no standalone thin page remains in the output

#### Scenario: Justified orphan page does not block completion

- GIVEN a legitimate page has no incoming wiki link
- WHEN the checklist evaluates the link graph
- THEN the run MAY complete only if the envelope records an explicit justification for that page
- AND an unjustified orphan MUST be linked or merged instead

#### Scenario: Mermaid labels render safely

- GIVEN a diagram label contains special characters (for example `*`)
- WHEN the checklist validates Mermaid syntax
- THEN such labels MUST be quoted so the block renders correctly
- AND an invalid block MUST be fixed before completion

---

### Requirement: No Self-Certification of Content Quality {#REQ-sdd-document-022}

The generator's own assessment is NOT sufficient evidence of content quality and MUST NOT be presented as such: the authoritative readability review and factual spot-check of generated content are an orchestrator-owned post-run step performed by a reviewer distinct from the generator (see `openspec/specs/agents/spec.md`, Orchestrator-Owned Post-Run Content QA for sdd-document). The agent MUST NOT self-certify content quality in its return envelope as a substitute for that independent pass.

#### Scenario: Generator does not self-certify content quality

- GIVEN the `sdd-document` agent finishes a run whose self-evaluated checks all passed
- WHEN it composes its return envelope
- THEN it MUST NOT claim final, authoritative content-quality certification in place of the orchestrator's independent post-run QA pass
- AND the orchestrator still performs that pass before closing the route

## MODIFIED Requirements

### Requirement: Planning Step {#REQ-sdd-document-007}

Before writing any wiki files, the agent MUST create a temporary plan file at `{output_dir}/_plan.md` listing every intended wiki page with its source evidence and estimated substance level. The plan MUST be reviewed for anti-patterns (thin pages, single-file directories, exceeding max-pages guard) before proceeding with generation.

The plan MUST additionally include a canonicity map: a table mapping every recurring domain concept to its single canonical wiki page. Before any page is written, the agent MUST use this map to verify that no concept appears as primary content on more than one planned page; when an overlap exists, the agent MUST designate one page as canonical and reduce the other to a short summary linking to it.

The plan file MUST be deleted after all wiki files are written. It MUST NOT appear in the final output.

(Previously: the plan listed pages, evidence, and substance levels only — there was no canonicity map and no deduplication decision step, so duplicate concepts shipped with no compliance mechanism.)

#### Scenario: Plan file lifecycle

- GIVEN the agent has resolved scope and language
- WHEN it begins document generation
- THEN it MUST create `{output_dir}/_plan.md` before writing any wiki pages
- AND it MUST delete `{output_dir}/_plan.md` after all wiki pages are written

#### Scenario: Thin page detected in plan

- GIVEN the plan lists a page with estimated substance level "low"
- WHEN the agent reviews the plan
- THEN it MUST merge that page into a broader page or quickstart
- AND it MUST NOT create a standalone page for the thin domain

#### Scenario: Overlapping concept resolved through the canonicity map

- GIVEN two planned pages would carry the same concept as primary content
- WHEN the plan is reviewed against the canonicity map
- THEN the agent MUST designate one of them as the canonical page for that concept
- AND it MUST reduce the other page to a summary that links to the canonical page

---

### Requirement: Init and Update Mode Detection {#REQ-sdd-document-008}

The agent MUST detect whether the approved output directory already contains wiki content (`quickstart.md` and/or `.last-update.json`) and operate in the appropriate mode:

- **init mode**: Output directory is empty or does not exist. Generate all pages from scratch. Maximum 16 wiki pages (quickstart + up to 15 domain pages).
- **update mode**: Output directory already contains wiki files. Use the `gitHead` from `.last-update.json` to scope the diff window. Apply surgical edits only — preserve accurate existing content, replace stale sentences rather than rewriting entire sections. Do not make formatting-only edits.

In update mode, after computing the diff window the agent MUST re-run domain discovery over the CURRENT repository state — not only over the files inside the window: a newly added source module or spec domain that maps to no existing page MUST trigger a coverage evaluation, and any resulting new-page or merge proposal MUST be registered in `{output_dir}/_plan.md` BEFORE editing existing pages. Re-discovery only extends coverage proposals; it MUST NOT license broad rewrites of unaffected pages.

In update mode, the agent MUST also re-verify volatile facts (frequently changing counters, target lists, thresholds, versions) on EVERY run, even when their mapped source file did not change inside the diff window, because drift can originate outside the page-to-source mapping.

(Previously: update mode scoped all work to pages whose mapped source files changed within the diff window and never re-ran domain discovery or re-checked facts sourced outside the window, so newly added domains never gained a page.)

#### Scenario: Init mode on empty directory

- GIVEN the approved output directory does not contain `quickstart.md`
- WHEN the agent detects mode
- THEN it MUST operate in init mode
- AND it MUST NOT generate more than 16 wiki pages

#### Scenario: Update mode with no changes

- GIVEN the approved output directory contains wiki files and `.last-update.json`
- AND no source files have changed since the recorded `gitHead`
- WHEN the agent runs in update mode
- THEN it MUST still re-verify volatile facts against the current repository state
- AND when none has drifted, it MUST report a no-op and NOT edit any wiki files

#### Scenario: Update mode with limited changes

- GIVEN fewer than 5 source files changed since the last run
- WHEN the agent runs in update mode
- THEN it MUST update at most 1-2 wiki pages

#### Scenario: New unmapped module triggers coverage evaluation

- GIVEN update mode and a new source module exists that maps to no existing wiki page
- WHEN domain discovery re-runs after the diff window
- THEN the agent MUST register a new-page or merge proposal for it in `_plan.md` before editing any existing page
- AND the proposal MUST respect the maximum-pages guard

#### Scenario: Volatile fact re-verified outside the diff window

- GIVEN a page cites a volatile fact whose mapped source file did not change within the diff window
- WHEN update mode runs
- THEN the agent MUST re-verify that fact against the current repository state
- AND it MUST update or confirm it before publishing the page

---

### Requirement: `.last-update.json` Metadata {#REQ-sdd-document-011}

After all wiki files are written, the agent MUST generate (or update) a `.last-update.json` metadata file in the output directory root containing: `updatedAt` (ISO-8601 UTC), `command` (init/update), `gitHead` (current HEAD short commit hash), `generator` (sdd-document), `version`, `sections` (complete list of every wiki page existing in the output directory after the run — including pages carried over unchanged from prior runs, not only pages written by this run), `stats` (filesGenerated, filesUpdated, and `filesSkipped` identifying each skipped file together with its skip reason), `doc_language` (the resolved language code from the batched gate), and `scope_choice` (the resolved scope option, `A`/`B`/`C`/`D`).

When the resolved scope is D, `.last-update.json` MUST be written under `openwiki/` (the source-of-truth directory); `web-doc/` does not carry its own separate `.last-update.json`.

The `doc_language` and `scope_choice` fields exist so that a subsequent update-mode run can skip the batched gate (per the Batched Language and Scope Selection Gate requirement above) by reading these persisted values instead of re-asking.

(Previously: `sections` listed only the pages generated by the current run and `filesSkipped` was a bare count with neither file identities nor reasons.)

#### Scenario: Metadata file generated on init

- GIVEN the agent completes an init run
- WHEN writing the `.last-update.json`
- THEN `command` MUST be `init`
- AND `gitHead` MUST match the current `git rev-parse --short HEAD`

#### Scenario: Metadata carries doc_language and scope_choice

- GIVEN the agent completes any run (init or update)
- WHEN writing the `.last-update.json`
- THEN it MUST include `doc_language` and `scope_choice` reflecting the values resolved for that run

#### Scenario: Update-mode run reads persisted fields to skip the gate

- GIVEN `.last-update.json` from a prior run contains `doc_language` and `scope_choice`
- WHEN a later update-mode run starts with no explicit parameter override
- THEN it reads those persisted fields and skips the batched gate, per the Batched Language and Scope Selection Gate requirement

#### Scenario: scope_choice D metadata lives under openwiki/

- GIVEN the resolved scope is D
- WHEN the agent writes `.last-update.json`
- THEN it MUST write it under `openwiki/.last-update.json`
- AND `scope_choice` MUST be `"D"`

#### Scenario: sections lists every existing page after an update

- GIVEN the output directory holds 10 pages before an update that writes 2 new pages
- WHEN the metadata file is written
- THEN `sections` MUST contain all 12 page paths, including the 10 untouched pages

#### Scenario: filesSkipped identifies files and reasons

- GIVEN the run skips one or more files
- WHEN the metadata file is written
- THEN `filesSkipped` MUST identify each skipped file and state why it was skipped
- AND a bare count without identities or reasons MUST NOT satisfy this field
