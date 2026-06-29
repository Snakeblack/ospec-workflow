# Delta for skills

## ADDED Requirements

### Requirement: Branch-Before-Code Recommendation in branch-pr

The `skills/branch-pr/SKILL.md` body MUST include a prominent "branch before code" step. This guidance MUST:
- Appear as Step 0 (or the first numbered step) in the existing Workflow section, before all other steps.
- State that a feature branch MUST be created before any project file is edited.
- Reference the project's `<type>/<description>` branch naming convention.

The step MUST also be represented as a rule in the Critical Rules section so that it is captured by compact-rule extraction and injected into sub-agent prompts.

#### Scenario: Workflow step visible at top

- GIVEN `skills/branch-pr/SKILL.md` is loaded by an agent
- WHEN the agent reads the Workflow section
- THEN the first actionable step MUST be a branch-creation instruction
- AND it MUST precede the existing "Verify issue has `status:approved` label" step

#### Scenario: Compact rules include branch-before-code

- GIVEN the registry builds compact rules from `branch-pr`'s Critical Rules section via `extractCompactRules`
- WHEN the extraction runs
- THEN the output MUST include a rule stating that a feature branch MUST be created before any code is edited
- AND this rule MUST be present in the sub-agent launch prompt when `branch-pr` is injected

---

### Requirement: Multi-Developer Collaboration Strategies in branch-pr

The `skills/branch-pr/SKILL.md` MUST include a section titled `## Multi-Developer Collaboration` that documents the strategies below. This section MUST appear in the skill body after the Workflow section and before the Commands section.

| Strategy | Required guidance |
|----------|------------------|
| Branch hygiene | One feature branch per task; descriptive names following `<type>/<description>`; delete merged branches |
| Default branch protection | NEVER edit files or commit while on the default branch (e.g., `main`) |
| Sync coordination | Pull the latest default branch before branching; rebase or merge default into feature branches regularly to minimize drift |
| Parallel work | Each developer works on a dedicated branch; changes are integrated via PR only, never by direct push |
| Commit conventions | Use Conventional Commits with Spanish imperative; each commit MUST be atomic and buildable |

The section SHOULD be 10–20 lines so it remains within the skill body budget (§3.1, skills spec).

#### Scenario: Multi-developer section present

- GIVEN `skills/branch-pr/SKILL.md` contains the `## Multi-Developer Collaboration` section
- WHEN the section is read
- THEN all five strategies in the table above MUST be represented

#### Scenario: Compact rules include default-branch protection

- GIVEN `extractCompactRules` processes `branch-pr`
- WHEN the Critical Rules section is scanned
- THEN at least one extracted rule MUST prohibit editing or committing on the default branch
- AND this rule MUST appear in the compact-rule output injected into sub-agent prompts
