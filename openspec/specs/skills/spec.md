# Skills Domain Spec

## Overview

The `skills/` tree is the catalog of runtime instruction contracts for LLMs operating
in this repository. Every entry teaches an agent — orchestrator or sub-agent — when and
how to do a specific kind of work. The domain covers the SKILL.md frontmatter contract,
the directory taxonomy, the `_shared/` convention package, and the authoring rules that
all skills must satisfy. Runtime registry build, fingerprinting, and cache management
belong to the `skill-registry` domain; cross-reference there for cache schema and
SessionStart refresh behavior.

---

## 1. Catalog Taxonomy

The catalog is organized into four tiers under `skills/`:

### 1.1 SDD Phase Skills (`skills/sdd-{phase}/SKILL.md`)

Phase skills encode the executor procedure for each SDD workflow phase. They are
loaded by sub-agents, never executed inline by the orchestrator.

Canonical set:
`sdd-apply`, `sdd-archive`, `sdd-baseline`, `sdd-clarify`, `sdd-design`,
`sdd-explore`, `sdd-foundation`, `sdd-init`, `sdd-onboard`, `sdd-propose`,
`sdd-spec`, `sdd-tasks`, `sdd-verify`, `sdd-workspace`.

Identifying traits:
- Frontmatter has `disable-model-invocation: true`, `user-invocable: false`, and
  `metadata.delegate_only: true`.
- Body begins with an `ORCHESTRATOR GATE` blockquote instructing the orchestrator to
  stop and delegate instead of executing inline.
- License is `MIT`.
- These skills are **excluded** from the registry cache — the registry scanner skips
  any skill directory whose name starts with `sdd-`.

### 1.2 Utility / Communication Skills (`skills/{name}/SKILL.md`)

Skills that encode task patterns or communication modes usable by any agent or
directly by the user. Examples: `caveman`, `branch-pr`, `chained-pr`, `skill-creator`,
`judgment-day`, `review-readability`, `go-testing`, `agent-introspection`.

Identifying traits:
- No `disable-model-invocation` or `user-invocable` override in frontmatter.
- License is typically `Apache-2.0`.
- These skills ARE indexed by the registry scanner and injected into sub-agent prompts
  as compact rules.

### 1.3 Support Package (`skills/_shared/`)

Convention documents consumed by phase skills and the registry. Not a skill that
agents invoke; it is a reference library. The `_shared/SKILL.md` marker declares the
directory non-invokable (`disable-model-invocation: true`, `user-invocable: false`).

| File | Purpose |
|---|---|
| `sdd-phase-common.md` | Shared executor protocol (skill loading §A, artifact retrieval §B, persistence §C, return envelope §D, review workload guard §E) |
| `openspec-convention.md` | Artifact path map for every SDD phase, spec ownership rules, config schema |
| `persistence-contract.md` | Mode resolution (`openspec` vs `none`), workspace federation model, sub-agent context rules |
| `skill-resolver.md` | Resolution order for injecting skills into sub-agent prompts; registry cache schema |
| `prompt-boundaries.md` | Dynamic payload block tags used when composing sub-agent prompts |
| `token-budget.md` | Per-delegation token limits for prompts and compact skill blocks |
| `approval-ledger.md` | Shape and valid sources for persisted blocking decisions in `state.yaml` |

The `_shared/` directory is excluded from registry indexing; its files contribute to
the fingerprint (see §4.2) but are never emitted as registry skill entries.

### 1.4 Stack Skills (`skills/stack-{name}/SKILL.md`)

Stack skills carry operative, per-technology knowledge — authoring conventions, framework-specific patterns, and project coding rules for a given library or runtime. They are NOT SDD-phase procedure files and MUST NOT carry the `disable-model-invocation: true`, `user-invocable: false`, or `metadata.delegate_only: true` fields.

Each stack skill MUST live at `skills/stack-{name}/SKILL.md` where `{name}` is a lowercase slug matching the technology it covers (e.g., `stack-angular`, `stack-dotnet`, `stack-postgres`).

Identifying traits:
- No `disable-model-invocation` or `user-invocable` override in frontmatter.
- License is `Apache-2.0` (matching the utility tier).
- Frontmatter description must be a meaningful description of the technology domain and key use cases to support judgment-based selection.
- Frontmatter contains the `capabilities` field.
- These skills ARE indexed by the registry scanner and injected into sub-agent prompts.

---

## 2. Frontmatter Contract

Every `SKILL.md` MUST open with a YAML frontmatter block delimited by `---`.

### 2.1 Required Fields

| Field | Type | Constraint |
|---|---|---|
| `name` | string | Slug matching the directory name |
| `description` | string | Single physical line, double-quoted, YAML-safe; MUST encode trigger words; <=160 chars SHOULD, <=250 chars MUST |
| `license` | string | `MIT` for SDD phase skills; `Apache-2.0` for utility skills |
| `metadata.author` | string | `manuel-retamozo-garcia` |
| `metadata.version` | string | Quoted semantic string (e.g., `"1.0"`, `"2.0"`) |

### 2.2 Optional Fields (SDD Phase Skills Only)

| Field | Value | Meaning |
|---|---|---|
| `disable-model-invocation` | `true` | Prevents the model from loading and executing inline |
| `user-invocable` | `false` | Marks the skill as inaccessible to direct user invocation |
| `metadata.delegate_only` | `true` | Signals the orchestrator gate: must delegate, must not execute |

### 2.3 Description Trigger Pattern

The `description` field MUST embed trigger words for the registry scanner to extract.
The canonical prefix pattern is:

```
"Trigger: <word1>, <word2>. <What the skill does>."
```

Trigger text may appear after the description prose when the prose is brief:

```
"<What the skill does>. Trigger: <word1>, <word2>."
```

The registry parser (`extractTriggers`) matches the text following `Trigger:` and
splits on `,` or `;`. If no `Trigger:` substring is found, the skill name is used as
the sole trigger. A `Keywords` field MUST NOT be added; all discovery metadata lives
in `description`.

### 2.4 Frontmatter Parsing Rules (implemented in `scripts/lib/skill-registry.js`)

Given/When/Then:

- **Given** a SKILL.md file whose content starts with `---\n`,
  **When** `parseFrontmatter` processes it,
  **Then** it returns top-level scalar key-value pairs only; indented lines (nested
  blocks such as `metadata:` sub-keys) are collected as raw continuation lines but
  not exposed as separate attributes.

- **Given** a value wrapped in single or double quotes in frontmatter,
  **When** the parser reads it,
  **Then** the surrounding quotes are stripped from the returned string value.

- **Given** a frontmatter value that is an inline YAML array (`[a, b]`),
  **When** the parser reads it,
  **Then** the value is returned as a JavaScript array of trimmed scalars.

### 2.5 Stack-Skill capabilities Frontmatter Field

Every stack-skill `SKILL.md` SHOULD declare a `capabilities:` frontmatter field whose value is a list of one or more capability name strings. These names MUST match (exactly, case-sensitive) the `name` values used in the `capabilities:` block of `openspec/config.yaml`. When the `capabilities:` field is absent, the skill MUST still be indexed; its registry entry will carry an empty `capabilities` array and the skill will not be selected by capability-based resolution.

The `capabilities:` field MUST NOT be used as a general keyword tag; it MUST list only technology names that correspond to declared project capabilities.

### 2.6 Skill Runtime Capability Manifest

> Reconciled from change `unified-contract-lint` on 2026-07-07.

#### Requirement: Skill Runtime Capability Manifest {#REQ-skills-001}

Every SDD phase skill (§1.1 — the 14 skills 1:1 bound to a phase agent via
`agents/{same-name}.agent.md`) MUST declare a `runtime_capabilities:`
frontmatter block naming which of `execute`, `mcp`, and `write` the skill body
instructs the executing agent to exercise. This is a distinct field from the
existing `capabilities:` field (§2.5), which names technology domains for
stack skills and MUST NOT be reused for this contract.

For the other three tiers (utility/communication, `_shared`, and stack
skills), declaring `runtime_capabilities:` is OPTIONAL in this change — such a
skill MAY declare it, but this change does not require it, and no expiration
or follow-up date is fixed for closing that gap. Absence is a permanently
valid state for these tiers under this change's scope, not a transitional
one; extending the MUST to these tiers is out of scope here and would require
a future change to revisit.

A capability MUST be declared `true` only when the skill's body instructs the
agent to run shell/test commands (`execute`), invoke an MCP tool (`mcp`), or
create/modify a file (`write`). A skill with no `runtime_capabilities:` block is
treated as declaring all three `false`.

For every SDD phase skill (§1.1), which is one-to-one bound to its phase agent
(`agents/{same-name}.agent.md`), the contract MUST hold in BOTH directions:
(a) every capability the skill declares `true` MUST be backed by the
corresponding abstract tool in the bound agent's `tools:` grant (`execute`→
`execute`, `write`→`edit`); (b) every such abstract tool present in that agent's
`tools:` grant MUST be justified by a `true` declaration in its bound phase
skill. For utility and stack skills — loadable by more than one agent — only
direction (a) applies; a mismatch in direction (b) MUST NOT be raised for these
tiers, since one agent may legitimately combine several skills with differing
capability needs.

##### Scenario: Skill declares execute without agent backing

- GIVEN a phase skill's `runtime_capabilities: { execute: true }`
- AND its bound phase agent's `tools:` grant omits `execute`
- WHEN the manifest is cross-checked against the agent
- THEN the check MUST fail, naming the skill and the missing tool

##### Scenario: Phase agent holds a tool its bound skill never justifies

- GIVEN a phase agent's `tools:` grant includes `edit`
- AND its bound phase skill declares `runtime_capabilities: { write: false }`
- WHEN the manifest is cross-checked (direction b, phase skills only)
- THEN the check MUST fail, naming the agent and the unjustified tool

##### Scenario: Utility skill loaded by multiple agents — direction (b) skipped

- GIVEN a utility skill declares `runtime_capabilities: { execute: true }`
- AND it is loaded by two different agents with differing `tools:` grants
- WHEN the manifest is cross-checked
- THEN direction (a) MUST be verified for each consuming agent independently
- AND direction (b) MUST NOT be evaluated for this skill tier

##### Scenario: Missing manifest treated as all-false

- GIVEN a skill has no `runtime_capabilities:` frontmatter block
- WHEN the manifest is cross-checked
- THEN the skill is treated as declaring `execute: false`, `mcp: false`,
  `write: false`
- AND a bound phase agent holding `execute` or `edit` tools then fails
  direction (b), naming the missing manifest declaration

---

## 3. Skill Body Structure

Every skill body MUST use sections in this order (omit only sections that are truly
irrelevant):

1. **Activation Contract** — exact conditions that load or activate the skill.
2. **Hard Rules** — MUST/MUST NOT constraints the LLM cannot override.
3. **Decision Gates** — compact tables for meaningful branching choices.
4. **Execution Steps** — ordered, imperative operational workflow.
5. **Output Contract** — required return format, artifact list, or response shape.
6. **References** — local file paths only; no external URLs as primary references.

### 3.1 Body Budget

| Tier | Limit |
|---|---|
| Target | 180–450 tokens |
| Recommended max | 700 tokens |
| Hard max | 1000 tokens |

When a skill exceeds 200 lines, the registry scanner reads only frontmatter and the
`Hard Rules` / `Critical Patterns` sections for compact-rule extraction.

### 3.2 SDD Phase Skill Body Convention

SDD phase skills MUST open the body with the ORCHESTRATOR GATE blockquote before any
section heading:

```markdown
> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `{phase}` sub-agent. This skill is for EXECUTORS only.
```

Phase executor bodies reference `skills/_shared/sdd-phase-common.md` sections by
letter (§A, §B, §C, §D, §E) rather than duplicating their content.

### 3.3 Strict Result Envelope Emission Format

Every SDD phase skill MUST ensure its return envelope complies with the strict emission
format specified in `sdd-phase-common.md` §D. Phase agents emit their return envelopes
as both human-readable prose (for user consumption) and a strict, machine-parseable
`json:result-envelope` fenced block (for programmatic consumption by the orchestrator
and hooks).

The fenced block uses the info-string `json:result-envelope` and contains valid JSON
carrying at minimum the required §D fields: `status`, `executive_summary`, `artifacts`,
`next_recommended`, `risks`, `skill_resolution`. Optional fields are omitted (never
emitted as `null`) when not applicable to the current batch.

This requirement ensures that downstream consumers (the `SubagentStop` hook, the
orchestrator result contract, and automated envelope validators) can extract and parse
field values directly from the fence without LLM-assisted prose parsing, while
preserving the existing plain-prose envelope for human readability.

---

## 4. Registry Integration

### 4.1 Inclusion Filter

The registry scanner (`discoverSkills` in `scripts/lib/skill-registry.js`) includes a
SKILL.md entry if and only if ALL of the following hold:
- The relative path starts with `skills/`.
- The path ends with `/SKILL.md`.
- The immediate skill directory is NOT `_shared`.
- The immediate skill directory is NOT `skill-registry`.
- The immediate skill directory does NOT start with `sdd-`.

This means only utility/communication skills are indexed; SDD phase skills and the
support package are excluded from registry entries.

### 4.2 Fingerprint Inputs

The content fingerprint that determines whether to rebuild the registry cache covers:
- Every `SKILL.md` file found under `skills/` (including excluded ones such as `sdd-*`
  and `_shared`).
- Every `.md` file under `skills/_shared/`.
- Every `.md` file under `rules/`.

The fingerprint is SHA-256 over sorted (relativePath + `\0` + fileContent + `\0`)
pairs. Any change to any of these files invalidates the cache.

### 4.3 Compact-Rule Extraction

Given/When/Then:

- **Given** the body of a SKILL.md (frontmatter stripped),
  **When** `extractCompactRules` processes it,
  **Then** it scans for `##`–`####` headings whose text matches the pattern
  `(hard|critical|core|decision)? (rules|patterns|constraints|gates)` (case-insensitive).

- **Given** a matching rules section,
  **When** the scanner reads list items (`-`, `*`, `+`, or `N.`),
  **Then** each item is stripped of its list marker and added as a compact rule.

- **Given** a table row inside a rules section,
  **When** the row is not a separator (`---`) or a header row whose first cell is
  `rule` or `gate`,
  **Then** the first two columns are joined as `col0: col1 - col2...` and added.

- **Given** no matching rules section in the body,
  **When** `extractCompactRules` exhausts the document,
  **Then** it falls back to the first 15 list items found anywhere in the body.

- **Given** more than 15 candidate rules,
  **When** extraction completes,
  **Then** only the first 15 are returned.

### 4.4 Registry Cache Location

The built cache is persisted to `.ospec/cache/skill-registry.cache.json` at the
project root. The SessionStart hook reads this cache and injects matching compact rules
into sub-agent launch prompts. See the `skill-registry` domain spec for the cache
schema and refresh protocol.

---

## 5. Supporting File Layout

A skill directory MAY include supporting subdirectories alongside `SKILL.md`:

```
skills/{name}/
├── SKILL.md              # Required
├── references/           # Optional — local docs explaining concepts or edge cases
│   └── {topic}.md
└── assets/               # Optional — templates, schemas, fixtures
    └── {file}
```

Skills MUST NOT duplicate long documentation inside `SKILL.md`; supporting detail
belongs in `references/` or `assets/`. References MUST point to local files, not
external URLs.

Some skills carry additional implementation scripts or data files (e.g.,
`caveman-compress/scripts/` contains Python utilities). These are skill-private
implementation files not consumed by the registry.

---

## 6. Authoring Rules

- `description` MUST be a single physical (unbroken) YAML line, double-quoted, with
  trigger words leading.
- A `Keywords` YAML field MUST NOT be added; all discovery information lives in
  `description`.
- Hard rules MUST be imperative and testable; background prose belongs in
  `references/`.
- External URLs MUST NOT appear as primary references in `References` sections.
- Skills MUST NOT add AI/model/tool attribution in any field or section.
- Version numbers in `metadata.version` MUST be incremented when the skill behavior
  changes meaningfully; the field is a quoted string (e.g., `"2.0"`).

---

## 6a. Specific Skill Requirements: branch-pr

### 6a.1 Branch-Before-Code Requirement

The `skills/branch-pr/SKILL.md` body MUST include a prominent "branch before code" step. This guidance MUST:
- Appear as Step 0 (or the first numbered step) in the existing Workflow section, before all other steps.
- State that a feature branch MUST be created before any project file is edited.
- Reference the project's `<type>/<description>` branch naming convention.

The step MUST also be represented as a rule in the Critical Rules section so that it is captured by compact-rule extraction and injected into sub-agent prompts.

#### Scenario: Workflow step visible at top

- GIVEN `skills/branch-pr/SKILL.md` is loaded by an agent
- WHEN the agent reads the Workflow section
- THEN the first actionable step MUST be a branch-creation instruction
- AND it MUST precede the optional issue-validation step

#### Scenario: Compact rules include branch-before-code

- GIVEN the registry builds compact rules from `branch-pr`'s Critical Rules section via `extractCompactRules`
- WHEN the extraction runs
- THEN the output MUST include a rule stating that a feature branch MUST be created before any code is edited
- AND this rule MUST be present in the sub-agent launch prompt when `branch-pr` is injected

### 6a.2 Multi-Developer Collaboration Strategies

The `skills/branch-pr/SKILL.md` MUST include a section titled `## Multi-Developer Collaboration` that documents the strategies below. This section MUST appear in the skill body after the Workflow section and before the Commands section.

| Strategy | Required guidance |
|----------|------------------|
| Branch hygiene | One feature branch per task; descriptive names following `<type>/<description>`; delete merged branches |
| Default branch protection | NEVER edit files or commit while on the default branch (e.g., `main`) |
| Sync coordination | Pull the latest default branch before branching; rebase or merge default into feature branches regularly to minimize drift |
| Parallel work | Each developer works on a dedicated branch; changes are integrated via PR only, never by direct push |
| Commit conventions | Use Conventional Commits with Spanish imperative; each commit MUST be atomic and buildable |

The section SHOULD be 10–20 lines so it remains within the skill body budget (§3.1, skills spec).

#### Scenario: Multi-developer section present

- GIVEN `skills/branch-pr/SKILL.md` contains the `## Multi-Developer Collaboration` section
- WHEN the section is read
- THEN all five strategies in the table above MUST be represented

#### Scenario: Compact rules include default-branch protection

- GIVEN `extractCompactRules` processes `branch-pr`
- WHEN the Critical Rules section is scanned
- THEN at least one extracted rule MUST prohibit editing or committing on the default branch
- AND this rule MUST appear in the compact-rule output injected into sub-agent prompts

---

## 7. Scenarios

### 7.1 Skill Discovery Filter

**Given** the following skill directories:
`skills/caveman/`, `skills/sdd-apply/`, `skills/_shared/`, `skills/skill-registry/`,
**When** `discoverSkills` scans them,
**Then** only `skills/caveman/SKILL.md` is included as a registry entry; the other
three are excluded by the filter but all four SKILL.md files contribute to the
fingerprint.

### 7.2 Trigger Extraction

**Given** a description `"Trigger: caveman mode, talk like caveman. Compress replies."`,
**When** `extractTriggers` processes it,
**Then** the resulting triggers array is `["caveman mode", "talk like caveman"]`.

**Given** a description with no `Trigger:` token,
**When** `extractTriggers` processes it,
**Then** the fallback trigger is the skill `name` field.

### 7.3 SDD Phase Guard

**Given** an orchestrator loading `skills/sdd-apply/SKILL.md` via the `skill()` tool,
**When** the body begins with the ORCHESTRATOR GATE blockquote,
**Then** the orchestrator MUST stop and delegate to a dedicated sub-agent; it MUST NOT
execute the instructions inline.

### 7.4 Compact-Rule Extraction from a Rules Section

**Given** a skill body containing `## Hard Rules` with three list items followed by a
`## Purpose` section with two list items,
**When** `extractCompactRules` runs,
**Then** only the three items under `## Hard Rules` are returned; the `## Purpose`
items are excluded because `Purpose` does not match the rules-section pattern.

### 7.5 Authoring Validation

**Given** a new SKILL.md whose `description` is split across two YAML lines,
**When** the frontmatter parser reads it,
  **Then** the parser reads only the first line as the value; the second line is treated
  as a continuation raw line and is NOT part of the description attribute, causing
  trigger extraction to fail silently.

### 7.6 Stack skill passes existing inclusion filter

- GIVEN a file at `skills/stack-angular/SKILL.md` exists in the plugin
- WHEN `discoverSkills` scans the `skills/` tree
- THEN `shouldIncludeSkill("skills/stack-angular/SKILL.md")` returns `true`
- AND `stack-angular` appears as an entry in the `skills` array of the generated cache

### 7.7 Stack skill excluded from SDD-phase tier conventions

- GIVEN a file at `skills/stack-dotnet/SKILL.md` with `license: Apache-2.0`
  and NO `disable-model-invocation` or `user-invocable` fields
- WHEN the registry scanner processes it
- THEN it is indexed as a normal registry entry (same as a utility skill)
- AND the ORCHESTRATOR GATE blockquote MUST NOT appear in its body

### 7.8 Seed reference skills cover the contract

- GIVEN reference stack skills `skills/stack-angular/`, `skills/stack-dotnet/`,
  and `skills/stack-postgres/` exist with valid frontmatter and body
- WHEN `discoverSkills` runs
- THEN all three appear in the registry `skills` array with non-empty `compact_rules`
  and `capabilities` arrays

### 7.9 capabilities field present and non-empty

- GIVEN a stack skill with frontmatter `capabilities: [angular]`
- WHEN the frontmatter parser reads the field
- THEN the value is available as a parseable list containing `"angular"`
- AND the registry entry for this skill carries `capabilities: ["angular"]`

### 7.10 capabilities field absent — skill still indexed, empty array in cache

- GIVEN a stack skill `SKILL.md` that has no `capabilities:` field in frontmatter
- WHEN `discoverSkills` processes it
- THEN the skill IS included in the registry with `capabilities: []`
- AND it will NOT be matched by any capability-based resolution

---

## 8. Federated Initialization & Enroll

> Promoted from change `federation-distributed-markers` (C1) on 2026-06-18.

### Requirement: sdd-init Multirepo Detection Gate

The `sdd-init` skill MUST detect when the target directory (resolved from `target_dir`
or cwd) is a workspace container: a directory that has no `.git` of its own AND has
two or more immediate children each containing `.git` (directory or file). On
detecting a container, the skill MUST return `status: blocked` with a `question_gate`
offering exactly two options: (a) proceed as a federated workspace init, or (b)
proceed as a normal single-repo init. The skill MUST NOT auto-select the federated
path without user confirmation (D2).

This check MUST run before any artifact write; if the gate is triggered, no files are
created.

#### Scenario: Container detected — blocked with federated-vs-normal gate

- GIVEN `sdd-init` targets a directory with no `.git` of its own and two or more children with `.git`
- WHEN the skill runs its detection step
- THEN it returns `status: blocked` with a `question_gate` listing `federated` and `normal` options
- AND no artifacts are written before the user responds

#### Scenario: Single-repo directory — gate not triggered

- GIVEN `sdd-init` targets a directory that has its own `.git`
- WHEN the skill runs its detection step
- THEN detection MUST NOT trigger the multirepo gate
- AND normal init flow continues

#### Scenario: Container with fewer than two child repos — gate not triggered

- GIVEN a directory with no `.git` of its own but only one immediate child with `.git`
- WHEN `sdd-init` runs detection
- THEN the multirepo gate MUST NOT fire (threshold is ≥2 children)
- AND the skill proceeds as a normal single-repo init for that child

---

### Requirement: sdd-workspace `enroll` Operation

The `sdd-workspace` skill MUST support an `enroll` operation. When invoked with
`operation: enroll` and valid member data, the skill MUST write
`openspec/federation.member.yaml` in the specified member directory. `enroll` is the
ONLY write operation `sdd-workspace` is permitted to perform on member repos; all
other member-repo interactions MUST remain read-only (D7). The `enroll` operation MUST
be idempotent and MUST be accessible only when the caller is the orchestrator.

#### Scenario: Enroll invoked — marker written, success returned

- GIVEN the orchestrator calls `sdd-workspace` with `operation: enroll` and valid member data
- WHEN the skill executes the operation
- THEN `openspec/federation.member.yaml` is written in the member directory
- AND the skill returns `status: success` with the artifact path in `artifacts`

#### Scenario: Enroll called twice with same data — idempotent, no timestamp refresh

- GIVEN `openspec/federation.member.yaml` already exists in the member directory
  with content that is byte-for-byte identical to the supplied data
- WHEN `sdd-workspace enroll` is called again with the same data
- THEN the skill returns `status: success` with no error
- AND the file is NOT rewritten
- AND `updated_at` MUST NOT be refreshed (byte-for-byte stable marker)

---

## 9. Federated Foundation

> Promoted from change `federated-foundation-orchestration` (C3) on 2026-06-19.

### Requirement: Federated Foundation Parameter Passing

Cuando opera en un espacio de trabajo federado (multirepo), la fase `sdd-foundation` acepta y utiliza los siguientes parámetros inyectados por el orquestador:
- `workspace_yaml`: Ruta física del atlas cache (`openspec/workspace.yaml`) en el coordinador.
- `parent_change`: Nombre del cambio activo en el coordinador.

#### Scenario: Parameters parsed in federated mode
- GIVEN `sdd-foundation` is launched in a federated workspace context
- WHEN the agent evaluates its parameters
- THEN it reads the path to `workspace.yaml` and maps member locations

---

### Requirement: MarkItDown Interactive Fallback Gate

Antes de iniciar las preguntas de descubrimiento, el agente ofrece la posibilidad de ingerir documentos. Si el servidor MCP MarkItDown no está disponible en el cliente actual, se detiene el flujo de ingesta y se presenta un gate interactivo al usuario mediante `vscode/askQuestions` con tres opciones de remediación:
1. **Configurar MarkItDown automáticamente**: Intentar la instalación/configuración del servidor MCP localmente.
2. **Configurar manualmente con guía**: Suspender la ingesta y proveer instrucciones paso a paso para configurar el servidor.
3. **Saltar ingesta de documentos**: Omitir la ingesta y continuar al descubrimiento manual.

#### Scenario: Interactive fallback gate triggered on missing MCP
- GIVEN `mcp__microsoft_markitdown__convert_to_markdown` is not available
- WHEN the document ingestion step is executed
- THEN the agent triggers `vscode/askQuestions` with the three setup choices
- AND waits for user input instead of falling back silently

---

### Requirement: Mapa de Contratos e Interacciones Synthesis

En modo federado, la documentación técnica del coordinador (`docs/architecture/technical-baseline.md`) debe incluir obligatoriamente la sección **"Mapa de Contratos e Interacciones"** detallando de forma estructurada qué contratos `provides` y `consumers` están definidos entre los módulos del atlas.

#### Scenario: Synthesis includes Contracts Matrix
- GIVEN the foundation documents are synthesized in federated mode
- WHEN the technical baseline is created or updated
- THEN the section "Mapa de Contratos e Interacciones" is added containing provides/consumers definitions

---

## 11. ADR Integration in the SDD Flow

> Reconciled from PR #32 (A5) on 2026-07-03.

### Requirement: sdd-design ADR Extraction

The `sdd-design` skill MUST, after writing `design.md` (Step 3b), promote each
**significant** Architecture Decision to a standalone ADR file at
`openspec/changes/{change-name}/decisions/adr-NNN.md` (`NNN` = 001, 002, … in
design order). A decision is significant when it meets AT LEAST ONE of: affects
a public contract, changes a data model, introduces a new dependency, or
establishes a cross-cutting pattern. Non-significant decisions stay only in
`design.md`; no ADR is created for them.

#### Scenario: Significant decision promoted to ADR

- GIVEN `design.md` documents a decision that introduces a new external dependency
- WHEN `sdd-design` completes Step 3b
- THEN `openspec/changes/{change-name}/decisions/adr-001.md` is created mirroring the design's `### Decision:` entry
- AND the ADR path appears in the phase's `artifacts` list

#### Scenario: No significant decision — no ADR directory

- GIVEN none of the design's decisions meet the significance bar
- WHEN `sdd-design` completes Step 3b
- THEN no `decisions/` directory is created
- AND the return summary notes "No ADR-worthy decisions"

### Requirement: sdd-archive ADR Promotion

The `sdd-archive` skill MUST, after persisting the archive report and writing
resolved decisions to memory, include every ADR from
`openspec/changes/{change-name}/decisions/adr-*.md` whose decision was NOT
invalidated during verify as an `adr_promotions[]` entry in `archive-plan.json`
(source path, intended `docs/adr/adr-{YYYYMMDD}-{NNN}-{kebab-title}.md` target,
`content_sha256`). On planned filename collision, the plan MUST bump `NNN` past the
highest existing suffix for that date. The skill MUST NOT write live `docs/adr/**`
files itself; the archive transaction runtime applies promotions during commit.
Change-local `decisions/` copies stay in the change folder and travel unchanged into
the archived folder as the audit trail; `docs/adr/` remains the living project memory
once the runtime commits.

(Previously: `sdd-archive` copied ADRs into `docs/adr/` during Step 4b before the
folder move.)

#### Scenario: ADR listed in plan for runtime promotion

- GIVEN a change folder contains `decisions/adr-001.md` with `Status: proposed`
- WHEN `sdd-archive` emits `archive-plan.json`
- THEN `adr_promotions` includes that ADR with target under `docs/adr/` and
  `content_sha256`
- AND the skill has not yet created the live `docs/adr/` file

#### Scenario: No decisions directory — empty promotions

- GIVEN a change folder has no `decisions/` directory
- WHEN `sdd-archive` emits the plan
- THEN `adr_promotions` is an empty array and plan emission continues without error

### Requirement: Compact Phase Summaries in state.yaml

Per `skills/_shared/sdd-phase-common.md` §C, every SDD phase skill that persists
an artifact MUST, on completion (`done` or `partial`), extend its own
`phases.{phase}` entry in `state.yaml` with a `summary` (≤160 chars, factual,
stating WHAT the phase produced/decided — no process narration) and, when
applicable, up to 3 `key_decisions` entries. Both fields MUST be derived only
from the artifact just written; the full artifact remains the source of truth
and the summary is a cache for continuation prompts.

#### Scenario: Continuation briefed from state alone

- GIVEN a phase completes with `status: done` and writes its artifact
- WHEN the phase extends its `state.yaml` entry
- THEN the entry gains a `summary` line and, if applicable, `key_decisions`
- AND a later continuation can be briefed without re-reading the full artifact

#### Scenario: Summary never invents content

- GIVEN a phase artifact contains no explicit rationale for a choice
- WHEN the phase writes its `summary`/`key_decisions`
- THEN it MUST NOT fabricate a decision not present in the artifact — it omits `key_decisions` instead

---

## 13. Mentorship Mode (Communication Calibration)

> Reconciled from PR #32 (A4) on 2026-07-03.

### Requirement: Per-Mode Mentorship Semantics

Per `skills/_shared/sdd-phase-common.md` §F, every phase skill MUST calibrate
its user-facing prose (`executive_summary`, `detailed_report`, `question_gate`
text) according to an orchestrator-supplied `Mentorship mode: {mode}` line,
without altering persisted artifacts, code, identifiers, file paths, or
evidence tables:
- `mentor`: append a "Por qué así" section (2-4 bullets naming discarded
  alternatives and rationale) plus at most one teachable concept when one
  genuinely applies; expand `question_gate` option `description` with didactic
  context.
- `balanced` (default, and when the line is absent): rationale only for
  architectural decisions and gate questions; skip the teachable concept.
- `expert`: minimal executive summaries; rationale only for irreversible
  decisions.

#### Scenario: Mentor mode expands rationale

- GIVEN the orchestrator passes `Mentorship mode: mentor`
- WHEN a phase skill returns its `executive_summary`
- THEN the summary includes a "Por qué así" section naming discarded alternatives
- AND persisted OpenSpec artifacts remain unaffected by the mode

#### Scenario: Mode line absent defaults to balanced

- GIVEN no `Mentorship mode` line is present in the launch prompt
- WHEN a phase skill composes its summary
- THEN it behaves as `balanced` — rationale only for architectural/gate decisions

---

## 14. Change Collision Gate (Skills Slice)

> Reconciled from PR #33 (B2) on 2026-07-03. The multi-team overlap procedure
> itself (`findActiveChanges`, the `AskUserQuestion` overlap gate, `collisions:`
> audit entries, owner stamping) is fully specified in
> `skills/_shared/gate-change-collision.md`; this section covers only the
> phase-skill fingerprint contract that lives inside `sdd-spec` and
> `sdd-archive`.

### Requirement: Baseline Fingerprint Recording and Verification

`sdd-spec` MUST declare, for each delta domain it writes (Step 5b), the domain name
under a `touched_baseline_domains:` list in its return envelope — it MUST NOT compute
or write the SHA-256 fingerprint itself, since it has no execute tool capable of
hashing files. Immediately after `sdd-spec` returns `status: success`, the
ORCHESTRATOR MUST compute the SHA-256 fingerprint of each declared domain's current
baseline `openspec/specs/{domain}/spec.md` (or `null` if no baseline exists yet) and
write it into `state.yaml`'s `baseline_fingerprints:` block (see agents domain spec,
Orchestrator-Computed Baseline Fingerprints).

At archive time, stale-baseline detection MUST be enforced by the archive transaction
runtime during preflight (comparing `state.yaml` fingerprints and each plan
`spec_writes[].target_before_sha256` to live target bytes). `sdd-archive` MUST embed
the expected before-hashes in `archive-plan.json` and MUST NOT blind-merge deltas into
`openspec/specs/`. On mismatch the runtime MUST fail closed; the archive skill MUST
surface that failure via its return path / orchestrator halt rather than merging.
A missing `baseline_fingerprints` block (pre-feature changes) MAY skip the fingerprint
portion of preflight only when the plan's `target_before_sha256` checks still pass.

(Previously: `sdd-archive` itself re-hashed baselines in Step 2 and returned
`blocker_type: stale-baseline` before merging.)

#### Scenario: sdd-spec declares a touched domain without computing a hash

- GIVEN `sdd-spec` writes a delta for domain `auth`
- WHEN Step 5b runs
- THEN `sdd-spec` adds `auth` to `touched_baseline_domains` in its return envelope
- AND `sdd-spec` does NOT compute or write any SHA-256 value itself
- AND `state.yaml.baseline_fingerprints` is left untouched by `sdd-spec`

#### Scenario: Fingerprint computed by the orchestrator after spec returns

- GIVEN `sdd-spec` returned `status: success` with `touched_baseline_domains: [auth]`
- WHEN the orchestrator processes the return
- THEN `state.yaml.baseline_fingerprints.auth` holds the SHA-256 of the current
  baseline spec (or `null` if no baseline exists yet), written by the orchestrator

#### Scenario: Stale baseline detected at archive preflight

- GIVEN another change already merged into `openspec/specs/auth/spec.md` after this
  change's fingerprint / `target_before_sha256` was recorded
- WHEN the archive transaction runtime runs preflight for the plan
- THEN the hashes mismatch and the transaction fails closed
- AND live specs are not blind-merged by `sdd-archive`

### Requirement: sdd-archive Plan-and-Report Contract

`sdd-archive` MUST be scoped to semantic archive work the executor can perform:
interpreting deltas, preparing resulting spec content (with hashes), detecting
semantic conflicts, proposing ADR promotions, recording accepted warnings,
persisting the archive report, and emitting `archive-plan.json` plus a return
envelope that references the plan. The executor MUST NOT delete the source directory
`openspec/changes/{change-name}/`, MUST NOT copy the change folder to
`openspec/changes/archive/...` as the completion mechanism, MUST NOT write live
`openspec/specs/**` as the closure write path, and MUST NOT claim in its return
envelope or report that the move is "complete" or that the source no longer exists —
completion (transaction + receipt) is the orchestrator's runtime invocation
responsibility (see agents domain, Orchestrator-Owned Archive Move Completion).

The plan's `archive_inventory` MUST list the origin paths that the runtime must
preserve into the archived folder. The executor MAY still materialize prepared
content as change-local artifacts for hashing, but live promotion/commit is runtime-
owned.

(Previously: Copy-and-Report — executor copied artifacts to the destination archive
path and reported a copy-inventory list for an orchestrator ad-hoc diff.)

#### Scenario: Executor reports plan instead of claiming completion

- GIVEN `sdd-archive` finishes semantic preparation
- WHEN it composes its return envelope
- THEN the envelope references `archive-plan.json` (path and/or inventory summary)
- AND the envelope does NOT assert that the source directory has been deleted or that
  the "move is complete"

#### Scenario: Partial semantic prep is reported, not concealed

- GIVEN the executor cannot produce a complete valid plan (e.g. unresolved semantic
  conflict or missing prepared content hash)
- WHEN it returns to the orchestrator
- THEN it MUST NOT return `status: success` with an incomplete plan presented as ready
- AND it MUST NOT imply that the archive operation is finished
- Evidence: static contract-test anchor on Plan-and-Report / "MUST NOT claim" strings

#### Scenario: Source directory left intact by the executor in all cases

- GIVEN `sdd-archive` completes plan emission and archive-report persistence
- WHEN the executor's run ends
- THEN the source directory `openspec/changes/{change-name}/` still exists on disk
- AND no instruction in the `sdd-archive` skill directs the executor to delete it
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text

### Requirement: sdd-archive Cost Summary Block

Archive cost for closure authority MUST appear on the transaction runtime receipt
(see `archive-transaction-runtime`). The receipt MUST aggregate
`.ospec/session/{change-name}/phase-costs.jsonl` when present:

- **Aggregation Rules**: Group records by `phase`, summing `duration_ms` and each of
  the four estimated token categories (`estimated_prompt_tokens`,
  `estimated_artifact_tokens`, `estimated_tool_output_tokens`, and
  `estimated_output_tokens`), listing distinct `model_tier`s and return `status`es.
- **Relaunches calculation**: `invocations - 1` (floored at 0) per phase.
- **Total user questions asked**: sum of `gates.*.questions_asked` from `state.yaml`.
- **Fail-safe Fallback**: If the cost JSONL is missing or empty, receipt emission
  MUST NOT fail; cost MUST be marked unavailable / empty explicitly.

The `sdd-archive` skill MAY still render a human-readable `## Cost` section in
`archive-report.md` using the same rules, but that section MUST NOT be treated as
proof that the archive move completed. Token column headers/values MUST remain
labeled "estimated".

(Previously: `sdd-archive` alone parsed JSONL and appended Cost to `archive-report.md`
as the Cost contract.)

#### Scenario: Cost data on success receipt

- GIVEN the change has cost entries in `phase-costs.jsonl`
- WHEN the runtime emits a success receipt
- THEN the receipt includes the aggregated cost table fields
- AND all token fields remain labeled as estimated

#### Scenario: Missing cost data does not block receipt

- GIVEN `phase-costs.jsonl` is missing or empty
- WHEN the runtime emits a receipt after an otherwise successful transaction
- THEN cost is explicitly marked unavailable / empty
- AND outcome remains driven by transaction success, not cost presence

### Requirement: Stable REQ ids in Delta Specs

`sdd-spec` MUST assign every `ADDED` requirement heading a stable id suffix
`{#REQ-{domain}-{NNN}}`, continuing numbering from the highest existing id in
the baseline spec. `MODIFIED` requirements keep their existing id unchanged;
ids are never reused after removal.

### Requirement: Task-Level REQ Coverage

`sdd-tasks`, when the change's specs carry stable REQ ids, MUST tag each
implementation task with the REQ id(s) it covers as a trailing
`[REQ-{domain}-{NNN}]` tag, and every MUST requirement MUST appear in at least
one task.

### Requirement: Commit Trailers from sdd-apply

`sdd-apply` MUST append `Ospec-Change: {change-name}` and
`Ospec-Task: {task-number}` (comma-separated for multiple tasks) trailers to
each commit message body for work units belonging to an active change, so
commits can be joined to tasks and REQs downstream.

### Requirement: Verify Traceability Matrix

`sdd-verify` MUST emit a `### Traceability Matrix` section (columns: REQ,
Tasks, Commits, Tests, Status) in its report whenever the change's specs carry
stable REQ ids, sourced from task `[REQ-...]` tags, commit trailers, and test
names/files citing the REQ id. This section MUST be omitted entirely when no
stable REQ ids exist. A MUST requirement with no linked test is a WARNING
(CRITICAL under Strict TDD); a REQ absent from every task is a `tasks-gap`
finding.

#### Scenario: REQ id assigned and carried through

- GIVEN a delta spec adds a new MUST requirement
- WHEN `sdd-spec` writes the heading
- THEN it carries `{#REQ-{domain}-{NNN}}` continuing from the highest existing id

#### Scenario: Task tags REQ coverage

- GIVEN the spec assigns `REQ-auth-003` to a MUST requirement
- WHEN `sdd-tasks` writes the implementation task for that requirement
- THEN the task line ends with `[REQ-auth-003]`

#### Scenario: Traceability matrix omitted when no REQ ids

- GIVEN a change's specs carry no stable REQ ids
- WHEN `sdd-verify` composes the report
- THEN the `### Traceability Matrix` section is omitted entirely

#### Scenario: REQ without linked test flagged

- GIVEN `REQ-auth-004` is tagged on a task with a completed commit but no test references it
- WHEN `sdd-verify` builds the traceability matrix
- THEN the row for `REQ-auth-004` shows `WARNING — REQ without linked test`

---

## 16. Scale Presets (sdd-init)

> Reconciled from PR #33 (B5) on 2026-07-03.

### Requirement: Scale Preset Materialization at Init

`sdd-init`, in `openspec` mode (Step 6b), MUST read a
`scale: <solo|team|enterprise>` line from the `## Parameters` prompt block
(the orchestrator asks the user once at first init; absent → default `team`,
`sdd-init` asks nothing itself), persist `scale: {value}` into
`openspec/config.yaml`, and materialize the corresponding preset. Presets only
materialize other config blocks at init time — later manual edits to those
blocks always take precedence over the preset. On re-init with an existing
`scale:` key, the value MUST be preserved unchanged (same rule as the
`baseline` block).

| Preset | Materialized behavior |
|---|---|
| `solo` | No extra blocks; routing prefers `lite` for trivial/small; clarify fires only on `residual_ambiguity`; 4R excluded from default route gates |
| `team` (default) | Unchanged defaults; the Change Collision Gate applies whenever other active changes exist; traceability trailers stay advisory |
| `enterprise` | Writes `strict_tdd: true` (when a runner exists), `traceability: { trailers: required }`, `mentorship: { mode: balanced }`; keeps 4R in the standard route gates; recommends declaring `quality_gates:` with `on_fail: halt` |

#### Scenario: First init writes solo preset

- GIVEN a first-time `sdd-init` run receives `scale: solo` in `## Parameters`
- WHEN Step 6b runs
- THEN `openspec/config.yaml` gets `scale: solo`
- AND no extra `quality_gates`/`traceability`/`mentorship` blocks are written

#### Scenario: Re-init preserves existing scale

- GIVEN `openspec/config.yaml` already has `scale: enterprise`
- WHEN `sdd-init` re-runs Step 6b
- THEN the existing `scale: enterprise` value is preserved unchanged

---

## 17. Compact-Rule Token Budget Cap

> Reconciled from PR #34 (C4) on 2026-07-03. Enforcement lives outside this
> domain's globs — this section normativizes the budget; it does not claim
> ownership of the enforcing test files (same pattern the `hooks` domain uses
> for its Go mirror of E1).

### Requirement: Hard Cap on Compact Skill Block Size

Per `skills/_shared/token-budget.md`, a compact skill block injected into a
sub-agent's `## Project Standards` block MUST target 50-150 estimated tokens
and MUST NOT exceed a **hard cap of 500 estimated tokens**. The cap applies to
every compact-rule block regardless of source (registry cache extraction,
`skill-registry.js`, or manual `SKILL: Load` fallback). The cap ratchets down
as current offenders shrink — it MUST NOT be raised to accommodate a new block
that would otherwise exceed it; the authoring skill must be trimmed instead.

### Requirement: External Enforcement, Not Domain Ownership

The 500-token hard cap is enforced by `scripts/docs-lint.test.js` (a pre-commit
lint check) and covered by `scripts/eje-c-contract.test.js`. Both files live
outside `skills/**/*.md` and belong to their own domain(s); this spec
documents the normative budget and rationale only — it does not assert
ownership over those test files or their location.

#### Scenario: Oversized compact block rejected pre-commit

- GIVEN a skill's extracted compact-rule block is estimated above 500 tokens
- WHEN `scripts/docs-lint.test.js` runs in pre-commit
- THEN the lint fails, blocking the commit until the skill body is trimmed

#### Scenario: Cap never raised to admit a new fat skill

- GIVEN a new skill would produce a compact-rule block exceeding the current cap
- WHEN authors are tempted to raise the cap to admit it
- THEN the cap MUST NOT be raised — the skill body must be trimmed to fit instead

---

## 17a. `static-lint` Evidence Level

> Reconciled from change `unified-contract-lint` on 2026-07-07.

### Requirement: `static-lint` Evidence Level {#REQ-skills-002}

The Evidence Levels taxonomy used by `sdd-verify` (`skills/sdd-verify/SKILL.md`
and `skills/sdd-verify/references/report-format.md`) MUST include a
`static-lint` level, ranked between `static-proof` and `inspection-proof`.
`static-lint` denotes a check that inspects declared artifacts (skill
manifests, frontmatter, config files, commit trailers) via grep/parse/string
comparison — including a check that runs inside the automated test runner but
exercises no real runtime code path — as distinct from `runtime-test`, which
drives actual code execution and observes real output.

`sdd-verify` MUST classify unified-contract-lint findings, and any other
grep/parse-based structural contract test (e.g. the existing
commands↔agents and hooks-budget↔lock-constant tests), as `static-lint`, never
as `runtime-test`. A MUST scenario whose text specifies real runtime behavior
(e.g. "the function returns X when called with Y") MUST NOT be satisfied by
`static-lint` evidence alone. `static-lint` MAY satisfy a MUST scenario whose
own text describes a structural/declarative contract (e.g. "file X MUST
contain Y", "field A MUST equal field B").

#### Scenario: static-lint rejected for a behavior-describing MUST scenario

- GIVEN a MUST scenario describes real runtime behavior of a function
- AND the only evidence found is a `static-lint` grep-based check
- WHEN `sdd-verify` builds the compliance matrix
- THEN the scenario is marked CRITICAL — `static-lint` is insufficient for a
  behavior-describing MUST scenario

#### Scenario: static-lint accepted for a structural MUST scenario

- GIVEN a MUST scenario describes a structural/declarative contract (e.g. two
  config values must match)
- AND a grep/parse-based test proves it
- WHEN `sdd-verify` builds the compliance matrix
- THEN the scenario is marked PASS with evidence level `static-lint`

#### Scenario: Existing structural contract tests reclassified

- GIVEN the pre-existing commands↔agents test (REQ-agents-007) and the
  hooks-budget↔lock-constant test are grep/parse-based, no-LLM, no-runtime-
  execution checks
- WHEN `sdd-verify` classifies their evidence level going forward
- THEN both MUST be labeled `static-lint`, not `runtime-test`

---

### Requirement: sdd-spec Ambiguity Signal Contract {#REQ-skills-003}

Every `sdd-spec` return with `status: success` MUST include these fields in its
strict `json:result-envelope` object and prose-adjacent envelope:

| Field | Type |
|---|---|
| `residual_ambiguity` | boolean |
| `public_contract_questions` | array of strings |
| `conflicting_requirements` | array of strings |
| `missing_acceptance_criteria` | array of strings |

The JavaScript and Go result-envelope validators MUST enforce the boolean, array,
and array-element types consistently. These fields are REQUIRED only for successful
`sdd-spec` returns; other phases and non-successful `sdd-spec` returns MUST retain
their existing envelope requirements.

The clarify predicate MUST evaluate to `false` only when
`residual_ambiguity` is `false` and all three arrays are empty. It MUST evaluate to
`true` when `residual_ambiguity` is `true` or any array is non-empty.

#### Scenario: Well-defined spec emits the skip signal

- GIVEN `sdd-spec` completes with no unresolved contract, requirement, or acceptance gap
- WHEN it emits a successful result envelope
- THEN `residual_ambiguity` MUST be `false`
- AND all three signal arrays MUST be empty

#### Scenario: Any ambiguity category triggers the predicate

- GIVEN `sdd-spec` identifies at least one unresolved item in any signal category
- WHEN it emits a successful result envelope
- THEN the corresponding array MUST contain that item or `residual_ambiguity` MUST be `true`
- AND the clarify predicate MUST evaluate to `true`

#### Scenario: Validator rejects a missing signal

- GIVEN a successful `sdd-spec` envelope omits any of the four fields
- WHEN either canonical validator checks it
- THEN validation MUST fail with an error identifying the missing field
- AND the envelope MUST NOT be accepted as a valid successful `sdd-spec` result

#### Scenario: Validator rejects a malformed signal

- GIVEN a successful `sdd-spec` envelope uses a non-boolean ambiguity flag, a non-array signal, or a non-string array element
- WHEN either canonical validator checks it
- THEN validation MUST fail with an error identifying the malformed field
- AND JavaScript and Go MUST return equivalent validity outcomes

---

## 18. Cross-References

- `skill-registry` domain spec — registry cache schema, fingerprint algorithm,
  SessionStart refresh, and compact-rule injection protocol.
- `hooks` domain spec — SessionStart hook that triggers registry refresh.
- `routing` domain spec — how the orchestrator selects which skill to load for a given
  SDD route.
- `skills/_shared/skill-resolver.md` — full resolution order for sub-agent skill
  injection.
- `skills/skill-creator/references/skill-style-guide.md` — normative style guide for
  creating and refactoring skills.
- `capability-registry` domain spec — schema and semantics of capability names
- `skill-registry` domain spec — how `capabilities` is read from frontmatter and stored in the cache entry schema
- `agents` domain spec — how capabilities gate stack-skill injection into sub-agents
- `hooks` domain spec — `commit-msg` hook's advisory/required enforcement of `Ospec-Change`/`Ospec-Task` trailers (§15 above documents only the phase-skill side of traceability)
- `agents` domain spec — the Phase Summary Block's Recovery Rule (orchestrator-side continuation behavior) and the `blocker_type` registry (§D of `sdd-phase-common.md`)

## 19. Generalist and Specialist Review Skills

### Requirement: `review-change` Decision Contract {#REQ-skills-004}

The `review-change` skill MUST be read-only and residual-only. It MUST return exactly one routing payload with `classification_status`, `added_domains`, and `reason`. `classification_status` MUST be `sufficient` or `ambiguous` when invoked; `added_domains` MUST be a deduplicated array containing only `trust`, `runtime`, `evolution`, or `efficiency` in canonical order. `reason` MUST use only the allowlisted grammar documented in `skills/review-change/SKILL.md` referencing ambiguity codes and bounded evidence; free-form prose, paths, diff text, secrets, and extra suffixes MUST be rejected. The skill MUST NOT return findings, severity, or remediation. The enclosing result MUST have `artifacts: []`.

(Previously: returned `clear|needs-specialist` with 4R specialist IDs and mandatory generalist screening.)

#### Scenario: Router adds domains from cross-capability residue

- GIVEN ambiguity reason `cross-capability-blast-radius` with 2 unattributed behavioral capabilities
- WHEN `review-change` resolves residue
- THEN `added_domains` MAY include domains justified by those capabilities only
- AND `reason` MUST reference the allowlisted ambiguity code

#### Scenario: Router adds domains from runtime-code residue

- GIVEN ambiguity reason `runtime-code-without-domain-attribution`
- WHEN `review-change` resolves residue
- THEN `added_domains` MAY include `runtime`
- AND `reason` MUST reference the allowlisted ambiguity code

#### Scenario: Router output without findings

- GIVEN `review-change` completes routing
- WHEN its envelope is validated
- THEN it MUST contain no `findings` field and no severity assignments
- AND validation MUST reject any finding-like payload

### Requirement: Generalist Competence Boundary {#REQ-skills-005}

`review-change` resolves quality-domain attribution for deterministic residue only. For `cross-capability-blast-radius`, residue is exactly the unattributed behavioral capabilities. It MUST NOT claim deep specialist conclusions, assign severities, perform remediation, remove deterministically selected domains, or consume complete change context when only a subset remains unresolved. It MAY add domains justified by residue and MUST constrain output to canonical domain identifiers.

(Previously: the generalist screened all four 4R dimensions and could request specialist expertise with bounded signals.)

#### Scenario: Residual router cannot strip deterministic domains

- GIVEN deterministic selection already includes `trust` and `runtime`
- WHEN `review-change` returns its routing payload
- THEN the final selected set MUST still include `trust` and `runtime`
- AND the router MUST NOT emit a payload that removes them

#### Scenario: Residual router cannot overclaim

- GIVEN residue requires semantic interpretation of an architectural boundary
- WHEN `review-change` adds `evolution`
- THEN it MUST state bounded justification in `reason`
- AND MUST NOT assert a definitive exploit or production failure

### Requirement: Review Skill Compatibility and Parity {#REQ-skills-006}

Replacing the 4R specialist skills with quality-domain skills MUST preserve envelope shape, severity taxonomy, no-findings behavior, and correction compatibility. Registry/model metadata and generated targets MUST expose the new roster and residual-only `review-change` contract wherever the Quality Review Gate is supported. Contract tests MUST validate source and every supported generated target.

(Previously: adding `review-change` MUST NOT modify the four existing 4R specialist skills.)

#### Scenario: New specialist clean envelope unchanged

- GIVEN `review-trust` finds no issue
- WHEN it returns under the Quality Review Gate
- THEN its no-findings body and empty findings contract MUST remain valid
- AND the router decision MUST NOT substitute for that envelope

#### Scenario: Target missing quality roster fails parity

- GIVEN a generated target lists `review-risk` but omits `review-trust`
- WHEN parity contracts run
- THEN validation MUST fail
- AND the target MUST NOT be considered equivalent to source

### Requirement: One-Shot Review and Slice-Targeted Validation Boundary {#REQ-skills-007}

The review lifecycle MUST distinguish initial read-only discovery from correction validation. `review-change` and each selected quality specialist MUST execute at most once per lineage. `review-correction` MUST receive frozen finding IDs whose owners are quality domains, validate only the active slice, and MUST NOT relaunch discovery reviewers. Unrelated observations MUST remain non-blocking follow-ups. The same boundary MUST appear in every supported target.

(Previously: referenced generalist and four 4R specialists without quality-domain owners.)

#### Scenario: Validator accepts evolution-owned finding

- GIVEN a frozen finding owned by `evolution`
- WHEN `review-correction` validates remediation
- THEN it MUST evaluate that ID against evolution acceptance criteria
- AND MUST NOT relaunch `review-evolution` for discovery

### Requirement: Structured Strict TDD Evidence and Bounded Repair Rules {#REQ-skills-008}

The Strict TDD apply and verify skills MUST define a structured evidence record
that is sufficient to verify provenance, required RED/GREEN/TRIANGULATE/
REFACTOR fields, test-file references, and the functional candidate identity.
Evidence validation MUST distinguish an equivalent format-only defect
(`evidence-format-gap`) from absent, unverifiable, or fabricated evidence.
Legacy `working-tree` cycles are immutable `legacy-unverifiable` history, not
live proof. A new live cycle MUST carry a reconciled external candidate receipt,
matching test digest and runtime command; absent or altered bindings fail closed.
Every record MUST declare `historical` or `live`; only `live` can classify, with an externally reconciled candidate ID.

For an equivalent gap, the apply skill MUST constrain repairs to the evidence
artifact allowlist, preserve the immutable identity and genesis paths, record the
classification and before/after checks, and enforce the configured bounded
changed-line and cost limits. The verify skill MUST run one focal recheck against
the repaired evidence and report whether the frozen findings are resolved. The
skills MUST NOT permit the fast path to change production code, specifications,
or tests, weaken Strict TDD requirements, fabricate missing records, or retry
without bound. Any violation MUST remain CRITICAL and fail closed for ordinary
routing.

#### Scenario: Valid evidence record is accepted

- GIVEN an apply-progress record contains required structured fields, real test-file references, and provenance
- WHEN the Strict TDD validator checks it
- THEN it MUST accept the record and compute a stable functional identity
- AND a formatting-only marker defect MAY be classified as `evidence-format-gap`

#### Scenario: Missing or fabricated record is critical

- GIVEN required evidence or provenance is absent, unverifiable, or fabricated
- WHEN apply or verify validates the record
- THEN it MUST emit a CRITICAL failure
- AND it MUST NOT create or repair evidence to make the record pass

#### Scenario: Repair allowlist and identity are immutable

- GIVEN an `evidence-format-gap` candidate is eligible for repair
- WHEN the repair is applied
- THEN writes MUST be limited to the evidence artifact allowlist
- AND the functional identity and genesis paths MUST match before and after

#### Scenario: Focused verify recheck is bounded

- GIVEN an evidence-only repair completes with an unchanged identity
- WHEN verify runs the remediation check
- THEN it MUST execute one focal recheck at most and report its outcome
- AND it MUST route any failed recheck or material delta to the ordinary workflow

#### Scenario: Evidence tests enforce routing and cost boundaries

- GIVEN tests exercise equivalent drift, functional failure, missing evidence, identity drift, and over-budget requests
- WHEN the Strict TDD contract tests run
- THEN they MUST assert distinct classifications, fail-closed CRITICAL outcomes, allowlist enforcement, and the one-recheck/cost bound

### Requirement: Named `review-correction` Skill Contract {#REQ-skills-009}

The catalog MUST include `skills/review-correction/SKILL.md` as a read-only targeted validator compatible with findings owned by `trust`, `runtime`, `evolution`, or `efficiency`. It MUST receive one immutable lineage id/revision, the active slice's frozen unresolved finding IDs with owners and acceptance criteria, a genesis-path-limited correction delta, corrected candidate identity, and targeted test evidence. Its result MUST return `resolved|unresolved` for every supplied ID exactly once, non-empty `regression.evidence`, and only non-blocking follow-ups. It MUST NOT relaunch discovery reviewers, add blocking finding IDs, expand paths, alter slice budgets, or authorize a successor.

(Previously: finding owners referenced 4R dimensions implicitly.)

#### Scenario: Correction rejects unknown domain owner

- GIVEN a frozen finding lists owner `reliability`
- WHEN live taxonomy expects quality domains
- THEN validation MUST fail closed for contract remediation
- AND MUST NOT treat the finding as eligible for correction dispatch

### Requirement: Evidence Remediation Cap Config Key {#REQ-skills-010}

`sdd-init` guidance and project config MAY document `rules.verify.strict_tdd_evidence_remediation_max_changed_lines`. The value MUST be a positive integer no greater than 40. Absent or invalid values MUST disable the evidence fast path and preserve ordinary CRITICAL remediation.

#### Scenario: Over-cap config disables the fast path

- GIVEN `strict_tdd_evidence_remediation_max_changed_lines` is missing, non-positive, or greater than 40
- WHEN Strict TDD evidence remediation classification runs
- THEN the evidence-format-gap fast path MUST be unavailable
- AND ordinary CRITICAL routing MUST remain in force

---


### Requirement: Quality Domain Specialist Skill Contracts {#REQ-skills-011}

The catalog MUST provide `skills/review-trust/`, `skills/review-runtime/`, `skills/review-evolution/`, and `skills/review-efficiency/` with competence boundaries, unique canonical attribute ownership, do-not-flag rules, and evidence-backed finding contracts. Each specialist MUST execute read-only, emit concrete findings with canonical domain ownership, and distinguish demonstrated defects from unsupported speculation. Style-only or premature-optimization observations MUST NOT be findings.

| Domain | Primary ownership (non-exhaustive) |
|--------|-------------------------------------|
| `trust` | Security, privacy, auditability, integrity, authn/z |
| `runtime` | Reliability, resilience, concurrency, error paths, observability |
| `evolution` | Maintainability, modularity, testability, deployability, readability |
| `efficiency` | Performance, scalability, latency, resource proportionality |

#### Scenario: Evolution rejects style-only findings

- GIVEN a naming preference with no material maintainability impact
- WHEN `review-evolution` evaluates the change
- THEN it MUST NOT emit a blocking finding
- AND MAY record no finding or a non-blocking observation outside the blocking set

#### Scenario: Efficiency rejects premature optimization

- GIVEN no concrete efficiency defect or measurable risk
- WHEN `review-efficiency` evaluates the change
- THEN it MUST NOT emit a speculative optimization finding

### Requirement: Deterministic Signals Are Not Findings {#REQ-skills-012}

Quality-domain signal codes and classifier facts MUST inform routing and specialist context but MUST NOT themselves be emitted as reviewer findings. Findings MUST cite concrete evidence beyond lexical signal presence.

#### Scenario: Signal activation does not auto-create finding

- GIVEN the classifier records `network-flow` for a change
- WHEN `review-runtime` executes
- THEN it MUST NOT emit a finding consisting only of the signal name
- AND MUST cite concrete runtime evidence if it reports an issue

## 20. Shared Judgment References and Skill Authority Hierarchy

> Reconciled by `/sdd-reconcile skills` on 2026-09-05 (window `359deff..HEAD`,
> commit 1129bbd "docs(skills): extraer juicio compartido de revision y
> compactar agentes review").

### Requirement: Shared Review Judgment Protocol {#REQ-skills-013}

The catalog MUST ship `skills/_shared/review-judgment.md` as the single shared
protocol for discovery specialists — the four v2 quality domains and the
legacy 4R reviewers. The review skills (`skills/review-*/SKILL.md`) MUST
delegate evidence, finding-output, severity, and lineage-literal rules to it
instead of duplicating per-skill rule blocks. `review-change` (residual
router) and `review-correction` (targeted validation) MUST NOT consume this
protocol as discovery authority. The protocol MUST define, at minimum:

- An evidence-before-findings loop: trigger and trace (precise path/line/
  snippet), consequence (violated contract or concrete cost, distinguishing
  observed defect from conditional risk), counterevidence (callers, upstream
  validation, tests, documented tradeoffs), and an actionable outcome.
  Keyword/checklist/classifier-signal matches are reasons to inspect, never
  proof of a defect.
- The specialist finding fields `severity` (exactly `BLOCKER`, `CRITICAL`,
  `WARNING`, `SUGGESTION`), `affected_files` (within the supplied scope),
  `evidence`, and `why_it_matters`; owner taxonomy per matching skill (v2
  quality domains / v1 4R) never mixed or renamed.
- Bounded-lineage dispatch fields: non-empty `summary` and
  `acceptance_criteria`, each at most 1000 characters, phrased to survive
  normalization; acceptance criteria test the reported problem, not a preferred
  implementation.
- The clean-report literal: after a completed review with no supported
  findings, the findings report text is exactly `No findings.` — governing the
  findings report text (placed in `detailed_report` where applicable) while
  structured outputs use `findings: []`; no appended mentorship prose or
  placeholders.
- Arbitrary numeric thresholds (e.g. nesting depth limits, mock-count ratios)
  MUST NOT appear as finding rules; severity calibrates to demonstrated impact
  and supported exposure.

#### Scenario: Especialista sin hallazgos emite el literal exacto

- GIVEN a completed `review-runtime` dispatch with no supported findings
- WHEN the specialist returns
- THEN its findings report text is exactly `No findings.` inside the required
  outer envelope
- AND structured consumers receive `findings: []`

#### Scenario: Señal determinista no es hallazgo por sí sola

- GIVEN a classifier signal or checklist match with no traced trigger and
  consequence
- WHEN the specialist evaluates it under the shared protocol
- THEN it MUST NOT emit a finding on that basis alone

### Requirement: Engineering Judgment Reference {#REQ-skills-014}

The catalog MUST ship `skills/_shared/engineering-judgment.md`. The
`sdd-design`, `sdd-apply` (including the Strict TDD module's REFACTOR step),
and review skills MUST apply it as the shared criteria for: grounding
consequential decisions in the change (evidence vs assumption, simplest viable
local change vs realistic alternative), making quality claims verifiable
(trigger and conditions → observable response → verification, with recorded
limitations instead of invented passes), and keeping structure proportional
(no speculative layers, interface/dependency/extension points only for present
requirements, refactoring only for the assigned behavior or a demonstrated
defect, no extraction merely to reduce mock counts). The reference defines
reasoning criteria only — it MUST NOT create a new phase, gate, artifact, or
remediation-expanding permission, and both shared references MUST be shipped
in every supported generated target.

#### Scenario: REFACTOR estricto aplica proporcionalidad

- GIVEN a Strict TDD REFACTOR step where an extraction would not improve the
  assigned behavior's clarity or remove demonstrated coupling
- WHEN the executor applies `engineering-judgment.md`
- THEN it MUST skip the unnecessary extraction
- AND the mandatory post-refactor green run contract is unchanged

### Requirement: Skill-Resolver Authority Hierarchy {#REQ-skills-015}

Per `skills/_shared/skill-resolver.md`, the resolution order resolves
**supplementary project standards** only — it MUST NOT replace the executor's
own phase/review procedure or required shared references, which are read once
and never reinjected as supplementary skills. An empty `## Project Standards`
block, empty registry, or source with no applicable compact rules does NOT
satisfy resolution: the resolver continues to the next source, reports what
was actually used, and MUST NOT report `injected` solely because an empty
heading exists. Supplementary skills supply technical judgment within the
assigned task and MUST NOT grant write/delegation permissions, change
artifact ownership, select a different workflow, add approval gates, or
override the phase's behavior contract, TDD mode, or bounded review scope; a
conflict with the behavior contract routes through the phase's existing
blocker protocol. Five-skill-cap selection MUST rank by relevance to the
actual decision or risk (task context as well as file extensions — design and
boundary reviews MUST NOT lose architecture guidance merely because several
language skills match), MUST NOT fill unused slots or select a
framework/architecture merely because its skill exists, and MUST deduplicate
by skill id and overlapping rule content, preserving conditional rules with
their applicability conditions.

#### Scenario: Bloque vacío no cuenta como inyección

- GIVEN a launch prompt containing `## Project Standards (auto-resolved)` with
  no content and a registry with applicable entries
- WHEN the executor resolves skills
- THEN it continues to the next available source and reports what was used
- AND `skill_resolution` MUST NOT be `injected` on the empty block alone

#### Scenario: Skill técnico no otorga permisos

- GIVEN a read-only reviewer receives an ADR-authoring supplementary skill
- WHEN it composes its review
- THEN it MUST NOT create `docs/adr/` files
- AND any conflict with its read-only contract routes through the blocker
  protocol rather than silent redesign

### Requirement: sdd-apply Modo y Guards de Resolución TDD {#REQ-skills-016}

The `sdd-apply` skill MUST resolve the TDD mode as follows: `testing.tdd_mode:
strict` selects Strict TDD even when the test runner is missing/unavailable —
execution is deferred under the module's `STATIC_VALIDATED`/`DEFERRED`
evidence semantics (an execution limitation, never a runtime pass; tasks stay
`[~]` until local execution passes) — and MUST NEVER silently resolve to
Standard Mode. Standard applies only when `tdd_mode: standard` OR no runner
exists AND the mode is not strict. Strict/Focused TDD modules replace only the
Step 4a Standard Workflow test cycle; the parent skill's common guards
(contract/scope check, remediation routing, workload re-estimation,
persistence limits, task-status semantics) remain mandatory in every mode. In
artifact-store `none` mode, `sdd-apply` MUST return proposed
implementation/progress inline only — no creation or modification of project
files (source, tests, tasks, progress, lineage state) and no mutating
remediation path. A low-risk workload forecast MUST NOT require a chain
strategy merely because the field is absent.

#### Scenario: Strict sin runner no degrada a Standard

- GIVEN `testing.tdd_mode: strict` and no available test runner
- WHEN `sdd-apply` resolves its mode
- THEN it stays in Strict TDD with deferred execution recorded via
  `STATIC_VALIDATED`/`DEFERRED`
- AND tasks remain `[~]` until execution passes

#### Scenario: Modo none no escribe archivos de proyecto

- GIVEN the orchestrator launches `sdd-apply` with artifact-store mode `none`
- WHEN the phase completes
- THEN it returns proposed changes and progress inline
- AND no project file (source, tests, `tasks.md`, `apply-progress.md`,
  lineage state) is created or modified

## Clarifications

### Session 2026-06-20

- Q: Must a stack skill's `description` frontmatter field be meaningful enough to support orchestrator judgment-based selection without an explicit domain field? → A: Yes. The `description` MUST describe the technology domain and key use cases clearly (e.g., "Angular frontend framework — components, reactive forms, routing, signals") so the orchestrator can semantically match it against task intent. There is no `domain:` field on skill frontmatter; `description` is the sole signal for judgment-based selection.

### Session 2026-07-07

- Q: ¿Qué subconjunto de SKILL.md existentes debe retrofittear runtime_capabilities: en este change? → A: Solo los 14 SDD-phase skills (recomendado). Rationale: es el alcance estructuralmente necesario para que el checker I1 pase — dirección (b) (declaración precisa obligatoria) solo aplica al tier SDD-phase, 1:1 bound a su agente; utility/stack/_shared solo necesitan dirección (a), que es vacuously satisfied sin declarar nada. Utility/stack/_shared quedan exentos en este change: usan el fallback ausente=false indefinidamente, sin fecha de vencimiento fijada para cerrar ese gap; extender el MUST a esos tiers queda fuera de alcance y se revisitaría en un change futuro.

