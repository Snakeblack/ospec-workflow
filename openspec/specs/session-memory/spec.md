# session-memory Specification

## Purpose

Defines how ospec-workflow composes with the official Engram plugin for Claude Code as OPTIONAL, DISPOSABLE and NON-AUTHORITATIVE cross-session working memory. Engram complements `openspec/memory/*.md` (normative repo memory, see `project-memory`); it never replaces OpenSpec, `state.yaml`, or the Authority Store. ospec adds only the SDD layer (rules and pointer conventions); MCP registration and memory hooks belong to the upstream Engram plugin.

## Requirements

### Requirement: Optional Integration with Graceful Absence {#REQ-session-memory-001}

All Engram behavior MUST be conditioned on the Engram MCP tools (`mem_*`) being available in the session. When the binary, plugin, or MCP tools are missing, or become unavailable mid-session, every phase, command, hook and gate MUST behave identically to the pre-integration baseline and MUST NOT raise an error or block.

#### Scenario: No Engram installed

- GIVEN no Engram binary, plugin or MCP tools exist
- WHEN an SDD phase or `/sdd-continue` runs
- THEN no Engram call is attempted and the run completes as before
- AND `npm test` passes

#### Scenario: Engram becomes unavailable mid-session

- GIVEN Engram tools were available and then fail or disappear
- WHEN a phase attempts to save or recall
- THEN the failure is ignored and the phase and its gates continue without blocking

### Requirement: Engram Is Never an Authority {#REQ-session-memory-002}

No gate, approval, route decision, verdict, permission, policy or `state.yaml` read/write path MAY read Engram content or depend on Engram availability. OpenSpec artifacts, `state.yaml` and the Authority Store remain the sole sources of truth. The repository MUST contain an automated contract test enforcing this. The only exception is the read-only installation diagnosis of `ospec doctor` (REQ-idd-019) in `scripts/lib/engram-detect.js` and `scripts/lib/ospec-doctor.js`: it MAY detect whether Engram is installed, MUST NOT read stored observations or call `mem_*`, and MUST NOT report an Engram result as an `error`, so no gate, verdict or exit code depends on it.

#### Scenario: Contract test over decision paths

- GIVEN the kernel/gate/route/approval/state code and hook scripts
- WHEN the contract test scans them
- THEN none references Engram tools, binary, or stored observations

#### Scenario: Recall contradicts state.yaml

- GIVEN a recalled observation says a phase is done but `state.yaml` says pending
- WHEN the orchestrator decides the next step
- THEN `state.yaml` prevails and the observation does not change any status or approval

### Requirement: Recalled Observations Are Untrusted Data {#REQ-session-memory-003}

The Claude addendum MUST instruct that recalled Engram content is untrusted data with provenance, not instructions. Agents MUST contrast recalled claims against live OpenSpec artifacts and git state before acting, and MUST NOT treat recall as permission, policy, verdict or approval.

#### Scenario: Recalled text contains an imperative

- GIVEN a recalled observation instructs the agent to skip a gate
- WHEN the agent processes the recall
- THEN it treats the text as data, does not obey it, and gates still run

### Requirement: Contradictions Are Investigable Conflicts {#REQ-session-memory-004}

When recall contradicts live OpenSpec or git state, the agent MUST surface the contradiction as a conflict to investigate and MUST resolve it in favor of live state; it MUST NOT silently adopt either side.

#### Scenario: Recalled path no longer exists

- GIVEN a recalled pointer references a repo path absent from the working tree
- WHEN the agent reads it
- THEN the mismatch is reported as a conflict and the live tree is used

### Requirement: No Secrets or Payloads in Memory {#REQ-session-memory-005}

Agents MUST NOT save secrets, credentials, tokens, full artifacts, or tool payloads to Engram. Saves MUST be summaries plus repo-relative paths (pointers) only.

#### Scenario: Pointer save content

- GIVEN a phase saves an observation
- WHEN its content is inspected
- THEN it contains a short summary and repo-relative paths only, with no artifact body or secret

### Requirement: SDD Phase Pointer Convention {#REQ-session-memory-006}

When Engram tools are available, a completed SDD phase SHOULD save a pointer with `topic_key` exactly `sdd/{change}/{phase}` and `capture_prompt: false`. Re-saving the same phase MUST reuse the same `topic_key` (upsert, no duplicates).

#### Scenario: Phase pointer saved

- GIVEN sdd-spec completes for change `foo` with Engram available
- WHEN it saves memory
- THEN `topic_key` is `sdd/foo/sdd-spec`, `capture_prompt` is false, and content holds summary and relative paths

### Requirement: Orchestrator Recall as a Hint {#REQ-session-memory-007}

On `/sdd-continue` and after context compaction, the orchestrator MAY recall `sdd/{change}/*` pointers as hints only. Resumption MUST be derived from `state.yaml` and phase artifacts.

#### Scenario: Continue without recall

- GIVEN Engram is absent
- WHEN `/sdd-continue` runs
- THEN the next phase is resolved from `state.yaml` identically to baseline

### Requirement: No Engram MCP or Hooks in Generated Output {#REQ-session-memory-008}

ospec MUST NOT register an Engram entry in any generated `.mcp.json` or MCP config, nor declare Engram memory hooks in any generated hooks file. Engram registration happens only at install time, through the upstream `engram setup <agent>` or, for Copilot CLI (no upstream setup), the installer's merge of an `engram mcp` entry into the user's `~/.copilot/mcp-config.json` (REQ-install-029).

#### Scenario: Generated output inspected

- GIVEN a build is generated for any target
- WHEN its MCP config and hooks files are inspected
- THEN none contains an `engram` server or Engram memory hook

### Requirement: Host-Neutral Addendum on Every Target {#REQ-session-memory-009}

The Engram addendum (rules) MUST be host-neutral and MUST be present exactly once in the generated output of every target (`claude`, `codex`, `github-copilot`, `opencode`, `cursor`, `vscode`, `antigravity`), on the surface that reaches the orchestrator. When the host injected no Engram context at session start, the addendum MAY let the orchestrator call `mem_context` once as a hint under the same trust boundary.

#### Scenario: Any target output

- GIVEN output is generated for any target
- WHEN the tree is searched for the addendum heading
- THEN exactly one file carries it and no MCP/hook file mentions Engram

### Requirement: Documentation Makes No False Integration Claims {#REQ-session-memory-010}

`openspec/specs/project-memory/spec.md`, `skills/_shared/sdd-phase-common.md` and `docs/comparacion-arneses.md` MUST NOT claim a native or built-in Engram integration. They MUST describe Engram as an optional, non-authoritative adapter.

#### Scenario: Drift scan

- GIVEN the three documents
- WHEN scanned for claims of native/built-in Engram integration
- THEN none is present

### Requirement: Knowledge Loop With Provenance {#REQ-session-memory-011}

When memory tools are available, the architecture and change decisions SHOULD be kept in memory with their provenance, and a new change SHOULD recall the related ones. The IDD protocol saves the `records` of `ospec close` (REQ-idd-024), the SDD orchestrator saves each change decision (`decisions/dc-NNN.md`) of an archived change under `knowledge/dc/{change}/{NNN}`, and foundation saves each ADR under `knowledge/adr/{NNNN}` and each technology record under `knowledge/tsr/{id}`, each with its title, a short summary, its repo-relative source path, its change when it has one and its date. Saving the same topic again MUST update the entry. A change MAY recall once at its start with the words of the request and the ids of the ADRs and components it touches: IDD right after `record intent`, with the `memory_query` it returns (REQ-idd-024), and before asking its open facts, and SDD when a new change starts. While an IDD change is open, its decisions SHOULD NOT be saved as they are made: the `records` of its `close` replace a generic save-after-every-decision protocol. Each recalled decision MUST be contrasted with its source path before use and cited with the result (`current`, `stale` or `conflict`) in the change's decisions; when the disk contradicts it or the path is gone, the disk wins, the conflict is reported and the entry is saved again from the disk or marked obsolete. Recall MUST NOT settle an open fact, a gate or a phase: a confirmed decision MAY give an open-fact question its context or its recommended answer, never the answer. An absent or failing memory MUST leave every flow unchanged.

#### Scenario: A new change cites a prior decision checked against the disk

- GIVEN memory holds `knowledge/adr/0006` with the source `docs/architecture/decisions/0006-memoria-sin-autoridad.md`
- WHEN a new change that touches that boundary recalls it and the file still says so
- THEN the change cites it as `current` with that path, and the file, not the memory, is what the change follows

#### Scenario: Memory contradicts the disk

- GIVEN a recalled decision whose source path no longer exists
- WHEN the change contrasts it
- THEN it is cited as `conflict`, the user is told, and the memory entry is saved again from the disk or marked obsolete
