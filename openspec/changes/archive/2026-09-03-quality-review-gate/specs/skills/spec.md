# Delta for skills

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Named `review-correction` Skill Contract {#REQ-skills-009}

The catalog MUST include `skills/review-correction/SKILL.md` as a read-only targeted validator compatible with findings owned by `trust`, `runtime`, `evolution`, or `efficiency`. It MUST receive one immutable lineage id/revision, the active slice's frozen unresolved finding IDs with owners and acceptance criteria, a genesis-path-limited correction delta, corrected candidate identity, and targeted test evidence. Its result MUST return `resolved|unresolved` for every supplied ID exactly once, non-empty `regression.evidence`, and only non-blocking follow-ups. It MUST NOT relaunch discovery reviewers, add blocking finding IDs, expand paths, alter slice budgets, or authorize a successor.

(Previously: finding owners referenced 4R dimensions implicitly.)

#### Scenario: Correction rejects unknown domain owner

- GIVEN a frozen finding lists owner `reliability`
- WHEN live taxonomy expects quality domains
- THEN validation MUST fail closed for contract remediation
- AND MUST NOT treat the finding as eligible for correction dispatch

## Clarifications

### Session 2026-09-03

- Q: ¿Cuándo debe dispararse la ambigüedad cross-package/cross-capability blast radius? → A: Atribución incompleta por capability (B5). Residuo de `review-change` para `cross-capability-blast-radius` = exactamente las capabilities conductuales no atribuidas.
