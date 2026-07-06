# ADR-001: Scaffold ships as verbatim asset files, not LLM-authored prose

- Status: accepted
- Change: starlight-web-doc
- Date: 2026-07-06

## Context
Option D must write a fixed Starlight shell (`package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json`, CSS, sync script) deterministically, without installers and without per-run drift, while keeping the SKILL body within its ≤1000-token budget.

## Decision
Store the exact files under `skills/sdd-document/assets/web-doc-template/` and have the executor copy each one byte-for-byte into `web-doc/`, writing only when the target path is missing (presence-only idempotence). `scripts/configure/cli.js walk()` already ships every file under `skills/` to all dist targets.

## Alternatives
- Embed files as fenced code blocks in a references doc for the LLM to re-type — rejected: transform-logic drift, untestable sync code, bloats token budget.
- Run `npm create astro` / installers — rejected: prohibited by REQ-014 (no installs at generation time).

## Consequences
Deterministic, testable (`.mjs` is real code), and cheap to update in one place. Adds an `assets/` convention to this skill (new for the repo). Reversible: delete the asset dir and the Option-D pointer.
