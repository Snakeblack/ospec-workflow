### Handbook Route Handler

This handler is read via the `read` tool exactly once per `handbook` route,
per the Circumstantial Handler Pointer Table. Its content stays in your context
for the rest of the route — do NOT re-read it on later gate boundaries within
the same route.

Trigger: the user asks, inside SDD, to document the repository, write or
update its handbook, or build its documentation website. There is no slash
command; outside SDD the user loads the `handbook` skill directly.

#### 1. Dispatch

Before each dispatch of the `handbook` agent (the first one and every
relaunch after a `blocked` return), record in the route `state.yaml` what
the boundary check of §2 compares against. List files, not directories: run
`git status --porcelain --untracked-files=all` here and in §2.

```yaml
gates:
  handbook-boundary:
    web: false          # see the rule below; null when there is none
    baseline:           # each status line before this dispatch
      - line: " M src/app.js"
        hash: "<git hash-object src/app.js; null for a deleted path>"
```

`web` is the `web` of `handbook/handbook.json` before the first dispatch,
and afterwards the user's latest `handbook-settings` answer or the previous
record: never the file again, because the agent could have written it. The
agent can write files, so keep in your context the recorded `web` and the
`git hash-object` of the whole route `state.yaml` after each of your own
writes to it; §2 compares them with what is on disk.

Then delegate to the `handbook` sub-agent. It reads its settings from
`handbook/handbook.json`; on a first run, or when it finds an `openwiki/`
directory to migrate, it returns `status: blocked` with a `question_gate`.
A `blocked` return reaches the session that dispatched it: run the check of
§2 (steps 1 to 5) on it right away, against the record of that dispatch and
before asking anything, so no write of a blocked run is absorbed by the next
record. Only when it passes, ask those questions through the active host
question protocol, record each answer as an approval-ledger entry under
`state.yaml approvals:` with `gate: handbook-settings` (its resolution names
the language, `web` and whether the user accepted an `openwiki/`
migration), take the record above again, and relaunch the agent with the
answers. If the ledger write fails,
retry it once; if it still fails, relaunch anyway and warn the user in the
completion report that the decision was not recorded.

#### 2. Post-run write boundary check (MANDATORY)

After `handbook` returns `status: success` (and after each `blocked`
return, see §1), check the write boundary yourself before closing the route
or asking the agent's questions. The agent's own report is NOT evidence
of compliance.

1. Compare the `git hash-object` of the route `state.yaml` with the one you
   kept after your last write (§1). A difference means the run changed that
   file: count it as a path outside the boundary. If you no longer hold that
   hash or the recorded `web` (the session changed between the dispatch and
   its return), the check is INCONCLUSIVE: halt with the gate of step 5
   and say in `executive_summary` that the check could not compare because
   the session changed. Take `web` from your copy, never from a file the
   agent could write. The boundary is `handbook/`, plus `web-doc/` when that
   `web` is true, plus the top-level `AGENTS.md` and `CLAUDE.md`, plus
   `openwiki/` only for renames to `handbook/` and the deletion of
   `openwiki/.last-update.json` when the `handbook-settings` approval
   accepted the migration.
2. Run `git status --porcelain --untracked-files=all` and compare every
   changed or untracked path with the boundary. A path does not count when
   its status line is in the baseline and `git hash-object` still gives the
   recorded hash (or it is still deleted); the route's own `state.yaml`
   does not count once step 1 matched its hash. If
   `handbook/handbook.json` now has a `web` different from your copy, treat
   it as a path outside the boundary.
3. If `git status` fails, the check is INCONCLUSIVE, never a pass: halt with
   the gate of step 5, and say in `executive_summary` that the check could
   not run and why.
4. If every path is inside the boundary, continue to §3 without asking.
5. If a path is outside, halt and ask with a `question_gate` that names it
   and offers exactly two options: "Abort the route and leave the files for
   manual review" (recommended) and "Acknowledge and close the route anyway
   (accepted risk)". Never close the route without one of them.

#### 3. Post-run content review (MANDATORY)

After the boundary check, review the content yourself, inline. You are not
the generator, and its report never replaces this review.

1. Take the pages the run created or changed from `git status` on
   `handbook/`, not from the agent's report.
2. Read every one of them for structure, clarity, duplication and thin
   pages.
3. Check `max(3, ceil(0.2 * claims))` of their numbers, versions, paths,
   commands and configuration keys against the repository.
4. If the review cannot run (a tool or read error), it is INCONCLUSIVE:
   halt with the gate of step 6, and say in `executive_summary` that the
   review could not finish and why.
5. Record the outcome in the route `state.yaml` before closing:

```yaml
gates:
  content-qa:
    status: "pass"   # pass | findings
    summary: "<one line>"
```

   The route does not close as success without this record.
6. With no confirmed defect, record `pass` and close the route. With a
   confirmed factual error or a severe defect, record `findings` and ask
   with a `question_gate` that names it and offers exactly two options:
   "Relaunch the handbook agent to fix the affected pages" (recommended) and
   "Acknowledge and close the route anyway (accepted risk)". A relaunch
   fixes only those pages and is followed by a new review of them.
