# Project Repository

Read on demand from `skills/idd/SKILL.md` when the router sends a project
request here and there is no project yet: no git work tree, or one whose top
level is `$HOME` or `/`. A system fix or a loose script never comes here: it
is done directly. `ospec` opens no change until the repository exists.

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
