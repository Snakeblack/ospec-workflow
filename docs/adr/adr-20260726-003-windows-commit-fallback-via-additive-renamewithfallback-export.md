# ADR-003: Windows commit fallback via an additive `renameWithFallback` export

- Status: proposed
- Change: hybrid-archive-transaction-runtime
- Date: 2026-07-26

## Context

REQ-archive-transaction-runtime-003 demands atomic rename semantics with the repository's
existing `EPERM`/`EEXIST` fallback class, now applied to directories as well as files.
`writeFileAtomic` already implements that fallback and is depended on by `state.yaml`
persistence.

## Decision

Add `renameWithFallback(source, target)` to `scripts/lib/atomic-write.js` as a new export
(rename → on `EPERM`/`EEXIST`: target→`.bak`, retry, unlink `.bak`; restore `.bak` on
failure) and use it for both file and directory commits. `writeFileAtomic` keeps its
current body and behavior.

## Alternatives

- Duplicate the fallback inside the runtime — two copies of a subtle Windows path.
- Generalize `writeFileAtomic` to directories — changes a helper the state layer depends on.

## Consequences

One proven fallback, zero behavioral blast radius on existing callers. `atomic-write.js`
grows a second responsibility (path commit, not just file write). Reversible by inlining
the helper into the runtime.
