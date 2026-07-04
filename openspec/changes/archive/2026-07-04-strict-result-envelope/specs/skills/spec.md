# Delta for skills

## ADDED Requirements

### Requirement: Strict Result Envelope Emission Format {#REQ-skills-001}

`skills/_shared/sdd-phase-common.md` §D (Return Envelope) MUST specify that every SDD
phase agent emits its return envelope as a strict, machine-parseable JSON block in
addition to the existing prose fields — the emission is additive, not a replacement:
`executive_summary` remains human-readable prose for the user; the fenced block carries
the same fields as structured data for programmatic consumption.

The block MUST use the fence info-string `json:result-envelope`:

<pre>
```json:result-envelope
{ "status": "success", "executive_summary": "...", "artifacts": [...], ... }
```
</pre>

Exactly one such fence MUST appear per phase return. Its JSON content MUST be valid,
directly `JSON.parse`-able with no LLM-assisted extraction required, and MUST carry at
minimum the required §D fields: `status`, `executive_summary`, `artifacts`,
`next_recommended`, `risks`, `skill_resolution`. Optional fields (`blocker_type`,
`question_gate`, `assumptions`) are included only when applicable to the current batch
and otherwise omitted (never emitted as `null`), matching the existing §D omission
convention.

This requirement does NOT change the meaning, enum values, or schema of any existing
§D field — it only mandates a strict serialization alongside the existing prose
envelope. The canonical schema referenced by validators (`scripts/lib/result-envelope.js`
and its Go mirror) is this same §D field table, plus the existing Assumption Entry
Schema and Blocking Question Envelope schemas already defined in §D — neither is
redefined by this requirement.

#### Scenario: Phase emits valid fence alongside prose

- GIVEN `sdd-design` completes a batch with `status: success`
- WHEN it composes its return envelope
- THEN it appends a ```` ```json:result-envelope ```` fence containing the required
  §D fields as valid JSON
- AND `executive_summary` remains present as readable prose, unchanged in meaning

#### Scenario: Fence is machine-parseable without LLM assistance

- GIVEN a phase agent's returned text contains the fence
- WHEN a downstream consumer (e.g. `SubagentStop`) extracts and parses it
- THEN `JSON.parse` succeeds directly on the fence content, without regex-based prose
  scraping or LLM re-interpretation

#### Scenario: Inapplicable optional fields omitted, not nulled

- GIVEN a phase batch has no `blocker_type`, `question_gate`, or `assumptions` to
  report
- WHEN the phase writes the fence
- THEN those keys are entirely absent from the JSON object (not present with a `null`
  value), matching the existing §D omission convention for optional fields

#### Scenario: Existing field meaning unchanged

- GIVEN the `status` field enum (`success` \| `partial` \| `blocked`) as defined in §D
- WHEN a phase agent emits the fence
- THEN the same enum values and meanings apply — this requirement introduces no new
  enum value and does not redefine any existing field's semantics
