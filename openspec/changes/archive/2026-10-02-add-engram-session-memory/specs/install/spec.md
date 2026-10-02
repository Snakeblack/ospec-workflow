# Delta for install

## ADDED Requirements

### Requirement: setup:claude Detects Engram Fail-Open {#REQ-install-028}

`setup:claude` MUST detect, by capability and not by version, whether the Engram binary is on PATH, what `engram doctor` (JSON output where available) reports, and whether the `engram` plugin/MCP server is already registered. Detection MUST be non-fatal: absence, probe failure or timeout MUST NOT change the build/registration outcome, exit code, or the existing REQ-install-014 exit-code checks for ospec's own steps. No other target installer MAY perform Engram detection. The installer MUST NOT download or install the Engram binary.

#### Scenario: Engram absent

- GIVEN no Engram binary on PATH
- WHEN `npm run setup:claude` runs
- THEN it prints informational guidance only and exits 0 if ospec's own steps succeed

#### Scenario: Doctor probe fails

- GIVEN the binary exists but `engram doctor` errors or times out
- WHEN `setup:claude` runs
- THEN a warning is printed and the exit code is unaffected

### Requirement: Engram Setup Execution Requires Explicit Opt-In {#REQ-install-029}

By default `setup:claude` MUST only print guidance for `engram setup claude-code` and installing the upstream `engram` plugin. It MUST execute those commands only after an explicit user opt-in. The guidance SHOULD warn that the upstream plugin may require bash (Git Bash on Windows). Without opt-in, no Engram-related command that mutates user configuration MAY run.

#### Scenario: Default run does not mutate Engram config

- GIVEN Engram is installed but not registered and no opt-in was given
- WHEN `setup:claude` runs
- THEN no registration or plugin-install command is executed and guidance is printed

#### Scenario: Opt-in executes upstream setup

- GIVEN the user explicitly opted in
- WHEN `setup:claude` runs
- THEN the upstream setup/plugin commands run and a non-zero result is reported as a warning without failing ospec's own install

### Requirement: Engram Registration Is Idempotent {#REQ-install-030}

When the `engram` plugin or MCP server is already registered, `setup:claude` MUST NOT register it again, even with opt-in, and MUST report it as already configured. Re-running MUST converge to the same state.

#### Scenario: Already registered

- GIVEN the Engram MCP server and plugin are already registered
- WHEN `setup:claude` runs with opt-in
- THEN no registration command is issued and the output states it is already configured
