---
name: gh-release-notes
description: "Trigger: release notes, changelog entries, tag release. Generate homogeneous release notes in the project's format and language."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "1.1"
---

## Activation Contract

Activate this skill when generating, writing, or updating GitHub release notes, changelog entries, or change summaries for a project version.

## Hard Rules

- The output release notes MUST be written in the project's language, in a neutral, professional register: the `language` that `ospec team` prints, else the language of the existing changelog.
- Version headings MUST strictly use the format: `## [Version] - YYYY-MM-DD` (e.g., `## [2.18.0] - 2026-07-06`).
- Section categories MUST use Keep a Changelog headings in English: `### Added`, `### Changed`, `### Fixed`, or `### Security`.
- Bullet points MUST start with a bold subject and optional parenthesized component/metadata: `- **[Change Name] ([Component])**: [Description].`.
- Descriptions MUST be technical and specify key files changed, requirements/specs involved, and test evidence summaries.
- If the change followed the SDD process, the bullet or section MUST include the SDD traceability statement, in the project's language: the route, the TDD mode, the review gate and the verification result.

## Decision Gates

| Change Type | Target Category | Example Content |
|---|---|---|
| New feature, new agent, stack capability | `### Added` | New commands, new `.agent.md` files |
| Refactoring, token optimization, architecture | `### Changed` | Prompt cleanup, code modularization |
| Bug fixes, race conditions, error resolution | `### Fixed` | ENOENT fixes, hook false positives resolved |
| Security configurations, secret scans | `### Security` | AgentShield integration, secret scanning |

## Execution Steps

1. Identify the target version and resolve the current local date in YYYY-MM-DD format.
2. Analyze git logs (using commands like `git log`) or active SDD change artifacts to gather the exact list of changes, touched files, and test results.
3. Classify each change item into Keep a Changelog categories (Added, Changed, Fixed, Security).
4. Write each bullet point in technical, neutral prose detailing files changed and testing stats (e.g., passing tests count).
5. Structure the final Markdown output according to the established nomenclature.

## Output Contract

Return:
- The formatted release notes in a Markdown block.
- The list of files analyzed to compile the changes.

## References

- [CHANGELOG.md](../../CHANGELOG.md) — Source of truth for existing release note examples.
