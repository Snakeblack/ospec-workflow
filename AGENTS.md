## Delivery Order (Branches, Commits, PRs and Merges)

This repository delivers one change at a time: at most one open pull request (`delivery.branching: serial` in [idd/config.yaml](idd/config.yaml), whose rules `ospec team` prints). Every PR adds its line to `CHANGELOG.md`, most touch `docs/roadmaps/harness-evolution.md`, and the one that publishes a version touches the four version manifests listed below; `scripts/manifest-sync.test.js` also requires each changelog version to have its tag before the next one. So two PRs in flight collide. The agent **MUST** follow this order:

1. **Before creating a branch:** run `git switch main`, `git pull --ff-only` and `git fetch --tags --prune`. Check that `git status` is clean, that `gh pr list --state open` is empty and that `ospec status` shows no other open IDD change. If a PR or a change is still in flight, finish it (CI, merge, release) or ask the user; never start a second one.
2. **One branch per change**, created from that up-to-date `main` and named `<type>/<change-id>` (`feat/`, `fix/`, `docs/`, `refactor/`, `perf/`, `ci/` or `chore/`). Never commit on `main`.
3. **Commits by work unit** (the `work-unit-commits` skill): Conventional Commits in Spanish. A work unit is the smallest part of the change that can be reverted alone and passes the checks, with its tests and docs. A change that is one unit is one commit. Several commits belong in a PR only when the change has several such units, for example a preparatory refactor and then the behavior that needs it; never one commit per file or per step of the work. The IDD archive goes with the unit it closes, and so does the line `ospec close` writes under `## [Unreleased]` of `CHANGELOG.md` (`delivery.changelog`). When the PR publishes a version (see What Publishes a Version), the release commit (`chore(release): actualizar versión a X.Y.Z y changelog`) goes last, and it is the only commit that touches the version manifests.
4. **Integrating `main`:** before the first push the branch may be rebased onto `origin/main`. Once pushed, its history is shared: integrate with `git merge origin/main` and never rewrite it, because the hooks deny `git push --force` and `--force-with-lease`. With serial delivery `main` only moves when the previous PR merges, so this is rare.
5. **Pull request:** run `node scripts/check.js` locally before pushing (plus the Go gate of [CONTRIBUTING.md](CONTRIBUTING.md) when `cmd/` or `internal/` changed), open the PR with the `branch-pr` skill and add one `type:*` label. One PR delivers one change. A chain of PRs (the `chained-pr` skill) is only for a change above the review budget `ospec team` prints, and counts as one delivery: its PRs may be open together, and only the last one carries the release commit.
6. **Merge** only with the user's explicit approval for that PR and green CI, as a merge commit: `gh pr merge <number> --merge --delete-branch`. In a chain, first re-target the next PR to the base of the one being merged (`gh pr edit <next> --base <tracker or main>`): deleting a branch can close the PRs based on it instead of re-targeting them, and a closed PR cannot be re-targeted. Then run `git switch main`, `git pull --ff-only` and `git branch -d <branch>`.
7. **Release right after the merge** when the PR carries a release commit, before the next branch exists: step 6 of the Post-Archive Flow tags the merge commit. Check that Publish Marketplace finishes green. A PR without a release commit ends at its merge.
8. **Never delete or push to the `release` branch:** Publish Marketplace owns it.

## What Publishes a Version

A version is what the users of the plugin receive, so not every PR publishes one (`delivery.release: batched` in [idd/config.yaml](idd/config.yaml)).

- **A PR publishes a version when it changes what the plugin delivers:** `agents/`, `commands/`, `rules/`, `skills/`, `hooks/`, `schemas/`, `profiles/`, `models.yaml`, `bin/`, `cmd/`, `internal/`, the plugin manifests, and `scripts/` except its tests and `scripts/evals/`. When in doubt whether a path reaches the published plugin, it does.
- **Any other PR merges without a version:** documentation (`docs/`, `handbook/`, `web-doc/`, the READMEs, this file), the roadmap, CI (`.github/`), tests, the bench and the IDD or OpenSpec records. It has no release commit, no tag and no GitHub Release, and its changelog line stays under `## [Unreleased]`.
- **A version groups every PR merged since the previous one.** The PR that publishes moves everything under `## [Unreleased]` into its version, so exactly one PR per version carries the release commit: the last one.
- **The version number:** a minor when `## [Unreleased]` holds an `### Added` section and a patch otherwise, raised from the latest version in the changelog. A major only with the user's answer.
- **The user can ask for a version at any time,** for example to publish what `## [Unreleased]` holds: a `chore/release-x.y.z` PR with only the release commit.

## Post-Archive Flow (Release and Publication)

After a change is closed (the `sdd-archive` phase in SDD mode, or the completion of a direct change such as a roadmap item), the agent **MUST** deliver it in the order above. When the change publishes a version, the PR also carries the release and publication steps below; otherwise skip steps 1, 2 and 6 and leave the version files untouched. The steps to follow are:

1. **Version Update:**
   - Take the version from What Publishes a Version: with `delivery.release: batched`, `ospec close` returns no `release`. Ask the user only whether the change breaks compatibility (a `major`) when it could.
   - Consistently update the version in the following files:
     - [package.json](package.json) (field `"version"`)
     - [openspec/config.yaml](openspec/config.yaml) (field `project.version`)
     - [.plugin.json](.plugin.json) (field `"version"`)
     - [.claude-plugin/plugin.json](.claude-plugin/plugin.json) (field `"version"`)

2. **Changelog Update:**
   - Move the entries of `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) under a new section with the new version and the current date, and leave `## [Unreleased]` empty above it.
   - Expand each line `ospec close` wrote into the changes its change introduced, in a concise and structured manner. The section covers every change merged since the previous version.
   - End the section with the line `scripts/manifest-sync.test.js` reads, unless it cites an `openspec/changes/archive/<change>/` with its verify report: ``**Verificación directa**: `node scripts/check.js` (N tests pasando, 0 fallos y M omitidos)``, with the counts of the last local run, followed by whatever else ran (Go gate, trust review, CI).

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
- A new SDD review requires an explicitly approved successor linked to a terminal predecessor. `createSuccessor` keeps that approval reference. Retries and gates never reset attempts, budget, paths, findings, or reviewer executions.
- An IDD trust successor does not ask for a separate approval. `ospec review start` opens it only when the reviewed code changed, at most three times per change, with one bounded correction on each review. A retry, a check or a close does not restore attempts or launch another discovery reviewer.
- An approved IDD review that froze advisory findings and used no correction may spend that one correction on them: `ospec review correct` records it beside the lineage, which stays approved and untouched, and only the `review-correction` validator checks those IDs and the regression. It passes when each named finding is resolved and no regression is detected, and it does not count as a review; a failed one leaves the change to a successor.
