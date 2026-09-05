# ADR-002: Fail-Closed OSpec Identity Anchor Verification for Shared Roots

- Status: proposed
- Change: fix-cx0-skill-registry-robustness
- Date: 2026-09-05

## Context
In shared skills roots (such as `~/.agents/skills`), foreign agent tools often place their own `SKILL.md` files. Previously, `requireSkills: true` only verified the existence of at least one `SKILL.md`, allowing a broken or uninstalled OSpec bundle in a shared root to satisfy the check and overwrite the registry cache with foreign or empty entries.

## Decision
When `requireSkills: true` is evaluated against an external or shared skills root, enforce that at least one canonical OSpec identity anchor is present: (1) `skills/_shared/` directory, (2) `skills/skill-registry/SKILL.md`, or (3) `.ospec-workflow-install.json` in the skills root or its parent. Reject roots lacking these anchors with a fail-closed error.

## Alternatives
- Retain generic `SKILL.md` count check: rejected because third-party skills falsely satisfy the requirement.
- Require installation manifest exclusively: rejected because development roots and source checkouts may rely on canonical directories (`_shared/`, `skill-registry/`) without an installer manifest.

## Consequences
Prevents cache corruption from foreign tools in shared directories and guarantees that required bundles actually provide OSpec skills. External roots must provide at least one standard OSpec anchor.
