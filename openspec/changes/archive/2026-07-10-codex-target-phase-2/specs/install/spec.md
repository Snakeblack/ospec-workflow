# Delta for install

## ADDED Requirements

### Requirement: Codex Plugin and TOML Agent Installation Via Separate Idempotent Channels {#REQ-install-001}

`install-codex.js` MUST install/update the generated plugin payload and the generated
TOML agent files (`.codex/agents/*.toml`) through two separate channels — neither channel
MUST write to, merge into, or otherwise modify the other's target location — and BOTH
channels MUST be idempotent: re-running the same install command a second time MUST
converge to the same final state without duplicating entries or corrupting prior output.
Neither channel MUST create or modify a destination `.codex/config.toml`; any existing
user-owned configuration at that path MUST be left byte-for-byte unchanged (extends the
existing constraint at install §1.3).

#### Scenario: First install writes plugin and agents via separate channels

- GIVEN no prior Codex install exists at the destination
- WHEN `npm run setup:codex` (or `install:codex -- <destRepo>`) runs
- THEN the plugin payload is installed via its channel and `.codex/agents/*.toml` files
  are installed via a separate channel
- AND neither channel's write touches the other channel's target path

#### Scenario: Re-running install is idempotent

- GIVEN a prior successful Codex install exists at the destination
- WHEN the same install command is re-run unchanged
- THEN the resulting plugin and agent files are identical to the prior run (no
  duplicate TOML entries, no drift in unrelated files)

#### Scenario: User config.toml never touched

- GIVEN a destination `.codex/config.toml` exists with user-authored content
- WHEN either the plugin channel or the agent-TOML channel installs or updates
- THEN `.codex/config.toml` MUST remain byte-for-byte unchanged

### Requirement: Codex Installation and Operational Documentation {#REQ-install-002}

`docs/codex/README.md` MUST document, as part of the installation documentation surface:
(a) the install and update flow (`setup:codex` / `install:codex`), (b) how to review and
trust the `/hooks` cache entries for the codex payload, (c) the "new task" flow — a fresh
Codex task invoking the orchestrator via a TOML agent and receiving `SessionStart`
context, and (d) the rollback procedure (reverting to a previously published payload
without touching `.codex/config.toml`). Absence of any one of these four sections MUST
be treated as an incomplete documentation deliverable for this change.

#### Scenario: All four documentation sections present

- GIVEN `docs/codex/README.md` is read
- WHEN each of the four required topics is checked
- THEN install/update, `/hooks` review, new-task flow, and rollback sections are all
  present with concrete command examples

#### Scenario: Missing rollback section fails documentation review

- GIVEN `docs/codex/README.md` omits the rollback procedure
- WHEN the change's documentation deliverable is checked against this requirement
- THEN the documentation MUST be considered incomplete

### Requirement: Codex Smoke Test — Skill to Orchestrator to SessionStart {#REQ-install-003}

A minimal smoke test MUST exercise the published codex payload end-to-end at the
narrowest useful scope: a skill entry point invokes the orchestrator (via a TOML agent),
and the orchestrator's session initialization receives a valid `SessionStart` response
(hooks Requirement REQ-hooks-007). The smoke test MUST run against the actual generated
and installed payload (not a hand-authored fixture) and MUST be part of the standard
`npm test` suite. This smoke test is explicitly narrower than a full E2E apply/verify/4R
cycle (out of scope for this change).

#### Scenario: Smoke test passes over the published payload

- GIVEN the codex payload has been generated and installed
- WHEN the smoke test invokes the entry skill and follows the orchestrator dispatch to
  `SessionStart`
- THEN the `SessionStart` response is well-formed per REQ-hooks-007 and the test exits 0

#### Scenario: Smoke test runs in the standard suite

- GIVEN a contributor runs `npm test`
- WHEN the suite executes
- THEN the codex smoke test runs alongside existing install/generator tests with no
  separate invocation required
