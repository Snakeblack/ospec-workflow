# Calibration protocol (real agents)

Recorded worker outputs for the Adaptive Repair pilot calibration. Each record
holds one agent run per arm and fixture; `node scripts/k12-campaign.js --paired
--worker-record <record>` replays them through the deterministic pipeline.

## How a record is produced

1. **Workspace:** one isolated directory per fixture and arm, containing the
   fixture's base files (`pilot.json` `files`), an empty `work/`, and
   `BRIEF.md` with the record's `brief` (symptom, reproduction, and intent).
   The hidden checks are never copied into the workspace.
2. **Worker:** the model in the record's `worker`, launched as a Claude Code
   subagent with the arm's prompt below. Notes and tests go under `work/`;
   product code stays under `src/`.
3. **Record:** the patch is the diff of `src/` against the base files, the
   artifacts are the files under `work/`, and the usage (tokens, tool uses,
   duration) comes from the subagent completion notice.

## Shared rules (both arms)

```text
You are the worker agent for one bug-fix task in an isolated workspace: <workspace>
Rules:
- Work ONLY inside that directory. Do not read, search, list, or open any file outside it.
- Product code lives under src/. Put every note and test you write under work/ — never under src/.
  Do not create new files under src/.
- Tests are plain Node scripts run with `node work/<file>.js`, using `require("node:assert/strict")`
  and requiring modules by absolute path.
- Read BRIEF.md for the bug report.
Follow exactly these phases, in order, finishing each one before starting the next:
<arm phases>
Reply with one line only: DONE or BLOCKED: <reason>.
```

## Arm phases

**`fixed` (live `bugfix` route):**

1. explore — read the code and the brief; write work/explore.md with the root cause, the options you considered, and the chosen approach.
2. tasks — write work/tasks.md: a numbered checklist of the concrete implementation steps.
3. apply (strict TDD) — write a test under work/ that fails against the current code (RED: run it and confirm the failure), then change src/ until it passes (GREEN).
4. verify — run your tests again; write work/verify.md with the commands, the results, and whether every requirement in BRIEF.md is met.
5. archive — write work/archive.md: a short summary of the change for the project history.

**`adaptive-repair-v1` (Repair recipe):**

1. reproduce — write a test under work/ that reproduces the reported bug; run it and confirm it fails on the current code.
2. repair — make the smallest change in src/ that fixes the bug without changing other behavior.
3. verify — run the reproduction and any other test you need; write work/verify.md with the commands, the results, and whether every requirement in BRIEF.md is met.

## Limits

- One agent runs every phase of its arm in a single context. The real `bugfix`
  route hands off between phase agents, each paying its own base context, so
  the recorded savings understate the real ones.
- Isolation is by instruction: the agent could technically read outside its
  workspace. The hidden checks live in the repository, not in the workspace.
