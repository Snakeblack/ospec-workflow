## Post-Archive Flow (Release and Publication)

Immediately after successfully completing the `sdd-archive` phase of any change, the agent **MUST** propose and initiate the release and publication workflow in this repository. The steps to follow are:

1. **Version Update:**
   - Ask the user if the change corresponds to a `patch`, `minor`, or `major` version increment, or if they want to define a specific version.
   - Consistently update the version in the following files:
     - [package.json](package.json) (field `"version"`)
     - [openspec/config.yaml](openspec/config.yaml) (field `project.version`)
     - [.plugin.json](.plugin.json) (field `"version"`)
     - [.claude-plugin/plugin.json](.claude-plugin/plugin.json) (field `"version"`)

2. **Changelog Update:**
   - Add a new section in [CHANGELOG.md](CHANGELOG.md) with the new version and the current date.
   - Detail the changes introduced by the archived change in a concise and structured manner.

3. **Documentation Update:**
   - If the change affects product or technical documentation in `docs/`, update the corresponding files to reflect the final state concisely.

4. **Commit and PR Confirmation:**
   - Create a commit with the version, changelog, and documentation updates using Conventional Commits in Spanish (e.g., `chore(release): actualizar versión a X.Y.Z y changelog`).
   - **IMPORTANT:** Do not include any attribution to AI models or code generation tools in the commit messages or the PR (title or description).
   - Push the branch and create a Pull Request (PR) on GitHub.

5. **CI Verification and Merge:**
   - Verify that the continuous integration (CI) checks pass successfully on the PR.
   - Merge the PR once it is approved and CI is green.

6. **GitHub Release Creation:**
   - Create a new Release on GitHub with the corresponding tag (e.g., `vX.Y.Z`) and the content of the changelog section.

## Bounded Review Lifecycle

- A selective 4R run freezes one review lineage before specialist dispatch: candidate identity, genesis paths, classification, selected dimensions, immutable finding IDs, and correction budget.
- The generalist and each selected specialist run at most once. After findings freeze, use only the read-only `review-correction` validator for the frozen unresolved IDs; never relaunch a discovery reviewer.
- Unrelated late observations are non-blocking follow-ups. Three failed targeted validations, including zero-delta attempts, exhaust the lineage.
- Unknown mutation outcomes require exact reconciliation before any further action. Verify, delivery, and archive are read-only identity checks.
- A new review requires an explicitly approved successor linked to a terminal predecessor. Retries and gates never reset attempts, budget, paths, findings, or reviewer executions.
