# doctor-hook-probe

## Intent and acceptance

ospec doctor ejecuta el hook PreToolUse instalado de Claude Code y avisa cuando la censura de salida necesita Claude Code >= 2.1.121

Acceptance: Con el hook roto, lento o ausente, doctor da claude/hook-responds error con causa y acción; con el sano, ok; la sonda no escribe ficheros. Con --output-redaction en hooks.json, claude < 2.1.121 o ilegible da claude/output-redaction warn con causa y acción, >= 2.1.121 da ok y sin censura no hay check.

## Plan

- `scripts/lib/ospec-doctor.js`: `claude/hook-responds` runs the installed
  launcher's `pre-tool-use` on a harmless `Read` from `os.tmpdir()` once the
  `hooks` check finds the launcher; `claude/output-redaction` compares
  `claude --version` with 2.1.121 when `hooks.json` passes
  `--output-redaction`. `resolveClaudeBin` becomes `resolveClaudeCli`, which
  also returns the version, and runs once for the hook and Engram checks.
- `scripts/lib/ospec-doctor.test.js`: stubbed probe (healthy, failed, timed
  out, non-zero exit, missing hooks), the real launcher with a failing and a
  healthy child (trees unchanged), and the version table (2.1.13 against
  2.1.121 catches a string comparison).
- `openspec/specs/idd/spec.md` REQ-idd-019: both checks and two scenarios.
- `docs/roadmaps/harness-evolution.md`: E1.31 done.

## Decisions

- The probe judges the output, not the exit code (user, 2026-10-23): the
  launcher answers a failed child with exit 0 and a fail-closed `ask`
  (ADR 0008), so exit 0 alone reported a broken hook as `ok`. A failure is a
  spawn error, a signal, a non-zero exit or an `[ospec error]` line on stderr.
- Only `pre-tool-use`, only Claude Code (user): it shares the binary or Node
  fallback with every other subcommand; the other hosts' launchers are a
  follow-up.
- Timeout 5 s (user): the host's PreToolUse timeout in `hooks.json`; the
  launcher already stops its child at 4 s and reports it as `[ospec error]`.
- An unreadable `claude` version is `warn` (user), as the roadmap set.
- The probe runs from `os.tmpdir()` without creating anything there, and
  clears `OSPEC_TARGET` so it answers in the Claude protocol.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-23T19:58:20.464Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-23T19:58:20.464Z)
- ev-3: living-doc-current for living-doc (2026-10-23T19:58:27.453Z)
<!-- ospec:evidence:end -->
