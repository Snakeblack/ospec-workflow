## Delivery Order (Branches, Commits, PRs and Merges)

This repository delivers one change at a time: at most one open pull request (`delivery.branching: serial` in [idd/config.yaml](idd/config.yaml), whose rules `ospec team` prints). Nearly every PR touches the same release files (`CHANGELOG.md`, the four version manifests listed below and `docs/roadmaps/harness-evolution.md`), and `scripts/manifest-sync.test.js` requires each changelog version to have its tag before the next one, so two PRs in flight always collide. The agent **MUST** follow this order:

1. **Before creating a branch:** run `git switch main`, `git pull --ff-only` and `git fetch --tags --prune`. Check that `git status` is clean, that `gh pr list --state open` is empty and that `ospec status` shows no other open IDD change. If a PR or a change is still in flight, finish it (CI, merge, release) or ask the user; never start a second one.
2. **One branch per change**, created from that up-to-date `main` and named `<type>/<change-id>` (`feat/`, `fix/`, `docs/`, `refactor/`, `perf/`, `ci/` or `chore/`). Never commit on `main`.
3. **Commits by work unit** (the `work-unit-commits` skill): Conventional Commits in Spanish, each unit with its tests and docs, and the IDD archive with the unit it closes. The release commit (`chore(release): actualizar versión a X.Y.Z y changelog`) goes last, and it is the only commit that touches the version manifests. `ospec close` writes the change's line under `## [Unreleased]` of `CHANGELOG.md` (`delivery.changelog`), and that line goes with the IDD archive; the release commit moves it under the new version and expands it.
4. **Integrating `main`:** before the first push the branch may be rebased onto `origin/main`. Once pushed, its history is shared: integrate with `git merge origin/main` and never rewrite it, because the hooks deny `git push --force` and `--force-with-lease`. With serial delivery `main` only moves when the previous PR merges, so this is rare.
5. **Pull request:** run `node scripts/check.js` locally before pushing (plus the Go gate of [CONTRIBUTING.md](CONTRIBUTING.md) when `cmd/` or `internal/` changed), open the PR with the `branch-pr` skill and add one `type:*` label. A chain of PRs (the `chained-pr` skill) counts as one delivery: its PRs may be open together, and only the last one carries the release commit.
6. **Merge** only with the user's explicit approval for that PR and green CI, as a merge commit: `gh pr merge <number> --merge --delete-branch`. Then run `git switch main`, `git pull --ff-only` and `git branch -d <branch>`.
7. **Release right after the merge**, before the next branch exists: step 6 of the Post-Archive Flow tags the merge commit. Check that Publish Marketplace finishes green.
8. **Never delete or push to the `release` branch:** Publish Marketplace owns it.

## Post-Archive Flow (Release and Publication)

Immediately after a change is closed (the `sdd-archive` phase in SDD mode, or the completion of a direct change such as a roadmap item), the agent **MUST** propose and initiate the release and publication workflow in this repository. The steps to follow are:

1. **Version Update:**
   - Propose the `release` that `ospec close` returned (`delivery.release: per-change`): its version, raised from the latest one in the changelog, and its tag. Ask the user whether the change breaks compatibility (a `major`) or they want another version.
   - Consistently update the version in the following files:
     - [package.json](package.json) (field `"version"`)
     - [openspec/config.yaml](openspec/config.yaml) (field `project.version`)
     - [.plugin.json](.plugin.json) (field `"version"`)
     - [.claude-plugin/plugin.json](.claude-plugin/plugin.json) (field `"version"`)

2. **Changelog Update:**
   - Move the entries of `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) under a new section with the new version and the current date, and leave `## [Unreleased]` empty above it.
   - Expand the line `ospec close` wrote into the changes introduced by the archived change, in a concise and structured manner.

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
