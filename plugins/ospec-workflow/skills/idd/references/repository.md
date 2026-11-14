# Project Repository

Read on demand from `skills/idd/SKILL.md` when the router sends a project
request here and there is no project yet: no git work tree, or one whose top
level is `$HOME` or `/`. A system fix or a loose script never comes here: it
is done directly. `ospec` opens no change until the repository exists. Also
read when a change spans several services or repositories.

## Where the project lives

Ask the user and stop until they answer:

- here: `git init -b main` in the current directory;
- a new folder: create `<name>/` and run `git init -b main` inside it.
  Recommend it when the current directory is `$HOME` or holds other projects.

Never run `git init` inside another repository's work tree without asking:
when the request is a separate project, ask whether it is a package of that
repository or a repository of its own.

## Existing code

When the directory already holds code without version control, the change
needs a baseline commit; without it, the change's diff is the whole project.
First read or propose a `.gitignore` that leaves out secrets, credentials,
dependencies and build output, and list what the commit would hold. Commit
only after the user approves it.

## Then

Use `main` only in a repository created here; never rename an existing branch.
A project with no code yet continues with the `foundation` skill; otherwise
open the change with `ospec record intent`. When `ospec` answers
`git-not-found`, ask the user to install git.

## Several services or repositories

`ospec` works on one repository root. A change across repositories is one
IDD change per repository, each closed on its own evidence. Keep a shared
contract compatible until every consumer moves: extend the provider first,
then migrate the consumers, and remove the old form last. In a monorepo whose
services keep their manifests below the root, propose to the user the
`impact:` entries of `idd/config.yaml` (`stack` and the contract, data and
security paths of each service), as for checks (`references/checks.md`).
