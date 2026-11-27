---
name: cognitive-doc-design
description: "Write documentation a reader can use on the first pass. Trigger: docs, README, guide, handbook, ADR, quickstart."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill to write or rework a document people will read to use or
change a project: a README, a quickstart, a guide, a reference page, an
architecture decision. The `handbook` skill loads it as its quality bar. A
comment on a thread belongs to `comment-writer`, and the body of a pull
request to `branch-pr`.

## Rules

- Decide who reads the page and what they will do after it, and cut whatever serves neither.
- Give a page one job: teach a first use, guide a task, list facts to look up, or explain a decision.
- Put the answer first: the first screen says what this is, whether it is for the reader and what to do first.
- Run every command and open every path and link before writing them down; mark what could not be verified.
- State a fact in one place and link to it elsewhere; a number or a name copied into two pages drifts.
- Write steps as a numbered list with one action each, and end the procedure with what the reader should see.
- Use a table to compare or to look up, a list for items of the same kind, and prose for reasoning.
- Name each thing with one word throughout, and define a term where it first appears.
- Write in the project's language, or in the language the file or its documentation tree already uses.
- Say what the thing does and how to use it; leave out how the change came about, the tool that wrote the page and the conversation behind it.
- Keep sentences short and concrete, and delete any that a reader would skip.

## The Job of the Page

| The reader is | The page is | It holds |
|---|---|---|
| Starting | A quickstart or tutorial | One path that works, from nothing to a first result |
| Doing a task | A guide | The steps, their prerequisites and how to tell it worked |
| Looking something up | A reference | Every option, in a fixed order, with no narrative |
| Deciding or understanding | An explanation or an ADR | The context, the choice, what it costs and what was ruled out |

A page that mixes two jobs is split, and each half links to the other.

## Steps

1. Write one sentence: who reads this and what they do next. Keep it in view.
2. Pick the job of the page from the table, and the headings a reader of that
   job would look for.
3. Draft from the top: the answer, then the common path, then the exceptions.
4. Verify: run the commands in a clean shell, follow the links, and read the
   numbers from their source.
5. Read only the headings and the first line of each section. If the page
   cannot be followed that way, rewrite those lines.
6. Cut: history, repeated facts, hedges, and anything a reader of this page
   does not need.

## Where Each Thing Goes in ospec

| Content | Home |
|---|---|
| Why an architecture decision was taken | An ADR under `docs/architecture/decisions/`, through `foundation` |
| What a change decided while it was built | Its `change.md`, which the CLI writes from `--decision` |
| What a version changed for users | The changelog |
| How to use the product | The README and the documentation |

The project's language is the `language` line of `ospec team`; when it prints
none, follow the language of the existing documentation.

## Output

Report the pages written or changed, the commands and links verified, and
what is still unverified.
