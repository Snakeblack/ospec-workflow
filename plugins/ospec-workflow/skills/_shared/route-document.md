### Document Route Handler

This handler is read via the `Read` tool exactly once per `/sdd-document` route,
per the Circumstantial Handler Pointer Table. Its content stays in your context
for the rest of the route — do NOT re-read it on later gate boundaries within
the same route.

Trigger: `/sdd-document` is invoked, or route dispatch selects the
`sdd-document` phase.

#### 1. Init-mode launch protocol — batched language+scope gate

When no `.last-update.json` exists yet at any candidate output directory (or
the persisted metadata lacks `doc_language`/`scope_choice`), build ONE
`question_gate` containing TWO independent questions, delivered via a single
`AskUserQuestion` call — never as two separate blocking round-trips:

1. **Language** — offer at minimum English (recommended) and Spanish, with
   `allowFreeformInput: true`.
2. **Scope** — offer Option A (Full Technical Wiki under `openwiki/`,
   recommended), Option B (Lightweight wiki under `docs/wiki/`), Option C
   (custom freeform path), and Option D (OpenWiki + Starlight web — generates
   `openwiki/` plus a static `web-doc/` scaffold synced from it).

Wait for the answer before dispatching `sdd-document`. Do not ask these two
questions in separate gates.

#### 2. Update-mode pre-question — keep or change

When a `.last-update.json` already carries both `doc_language` and
`scope_choice` (found under a previously resolved output directory — check
`openwiki/`, `docs/wiki/`, or a `custom_path` recorded in a prior approval
ledger entry for this repo), ask a short yes/no pre-question BEFORE checking
for any explicit parameter override:

**Precedence when multiple candidate directories each carry a valid
`.last-update.json`**: prefer the directory recorded in the most recent
`gate: document-init` approval-ledger entry for this repo (see §4 below); if
no such entry is recorded, prefer `openwiki/` over `docs/wiki/` over any
`custom_path`, in that fixed order.

"Keep previous documentation language and scope, or change them?"

- **Keep**: reuse the persisted `doc_language`/`scope_choice` values; skip the
  batched gate entirely.
- **Change**: treat this as the explicit override for only the field(s) the
  user selects to change (language, scope, or both). Re-ask only the
  corresponding question(s) from the batched gate above, reusing the
  persisted value for any field not selected for change.

#### 3. Output-dir resolution

Resolve the approved output directory (or, for scope D, directories) from the
resolved `scope_choice`:

- Option A → `openwiki/`
- Option B → `docs/wiki/`
- Option C → the validated `custom_path`
- Option D → the dual-directory pair `{openwiki/, web-doc/}` — both
  directories are approved for this run; a write outside both (and outside
  the `/AGENTS.md`/`/CLAUDE.md` exception) still triggers the sandbox-
  violation halt.

If Option C's `custom_path` resolves outside the repository working tree,
reject it at gate time — do not delegate. Re-prompt the user for a path
inside the repository via `AskUserQuestion` before proceeding. This
ensures the J5 post-run `git status` scoping below always covers a path
`git` can see.

#### 4. Persistence

Before dispatching:

1. Write an approval-ledger entry under `state.yaml approvals:` recording the
   resolved `doc_language`/`scope_choice`/output directory (per the Approval
   Ledger Protocol). Use `gate: document-init` for this entry. The ledger's
   documented gate enum (`skills/_shared/approval-ledger.md`) has no
   dedicated value for language/scope decisions, so `document-init` is the
   fixed, consistent gate id for every language/scope approval this route
   handler records — both the init-mode batched gate (§1) and the
   update-mode keep/change pre-question (§2).
2. The resolved `doc_language` and `scope_choice` are written into
   `.last-update.json` in the resolved output directory by the `sdd-document`
   executor itself (Step 6.4 of its SKILL); the orchestrator does not write
   that file directly. For scope D, "the resolved output directory" here
   means `openwiki/` ONLY — `.last-update.json` is never written under
   `web-doc/`, even though scope D's approved output is the dual-directory
   SET (see §3 above and `skills/sdd-document/references/option-d-starlight.md`
   §4).
3. If writing the approval-ledger entry itself fails (e.g. a `state.yaml`
   write error), this is a non-fatal but reportable condition: retry the
   write once; if it still fails, proceed with the dispatch anyway rather
   than blocking the route, but surface a WARNING in the eventual completion
   report to the user noting the decision was not persisted to the ledger.

#### 5. Dispatch

Delegate to the `sdd-document` sub-agent, passing `doc_language`,
`scope_choice`, and `custom_path` (when Option C) as launch parameters.

#### 6. J5 — orchestrator-owned post-run sandbox inventory (MANDATORY)

After `sdd-document` returns `status: success` (following any number of
`blocked`/resume cycles), perform an independent post-run sandbox inventory
check before considering the route complete. The executor's own completion
report is NOT sufficient evidence of sandbox compliance — this check is
independent and authoritative.

1. Determine the approved output directory (or, for scope D, the SET of both
   `openwiki/` and `web-doc/`) yourself, from the `scope_choice`/`custom_path`
   values already resolved at launch time (Section 3 above) — never by
   trusting the executor's self-report.
2. Run `git status` scoped to exactly: the resolved output directory (or, for
   scope D, both `openwiki/` and `web-doc/`), plus the two declared
   exceptions `/AGENTS.md` and `/CLAUDE.md`. A changed/untracked path under
   either directory of the scope-D SET is inside the sandbox.
3. **If the `git status` command itself fails** (non-zero exit, `git` not
   available, or any other execution error), treat sandbox verification as
   INCONCLUSIVE — never treat a failed check as an automatic pass. Halt and
   present the same `question_gate` as step 5 below, matching the sibling
   handler failure-policy style (verification-inconclusive halts use the
   same gate shape as a confirmed violation), except the
   `executive_summary` MUST state that sandbox verification could not be
   completed (naming the `git status` failure) rather than describing an
   unexpected path.
4. If every changed/untracked path reported falls under that scope, close
   the route silently — no additional user interaction.
5. If any changed/untracked path falls OUTSIDE that scope (not under the
   approved output directory and not one of the two exceptions), halt and
   present a `question_gate` describing the unexpected path before closing
   the route. The gate MUST offer exactly two options:
   - "Abort the route and leave the offending files for manual review"
     (default/recommended).
   - "Acknowledge and close the route anyway (accepted risk)".
   Never close the route without an explicit choice between these two
   options. A pre-existing unrelated untracked path outside the approved
   output directory (predating this run) is excluded by the scoping in step 2
   and MUST NOT trigger this halt.
