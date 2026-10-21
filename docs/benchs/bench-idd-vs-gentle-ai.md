# Bench: IDD vs gentle-ai (ODD)

[Español](bench-idd-vs-gentle-ai.es.md)

Summary of every bench that compares **IDD** (ospec-workflow) with **gentle-ai** (its ODD flow with RDD, installed with its Engram): the models, personas and conditions of each one, who wins on each axis and why. The numbers come from the versioned records in [`scripts/evals/bench/records/`](../../scripts/evals/bench/records/) and regenerate without rerunning anything:

```sh
node scripts/evals/bench/bench.js report --record <record>
node scripts/evals/bench/bench.js checkpoint --baseline <gentle-ai-…> --candidate <idd-…>
```

Date: 2026-10-22. Bench contract: [`openspec/specs/bench/spec.md`](../../openspec/specs/bench/spec.md). Manual: [`scripts/evals/bench/README.md`](../../scripts/evals/bench/README.md).

## Short conclusion

- **Quality: not demonstrated, though the data lean to IDD.** Regression ties in every bench, and acceptance differs by one check at most (E4.9 and OSP-011 Claude). The escaped defects differ only in hidden-fact checks, and no difference is significant: E4.2 2 against 0 over 26 (one repetition, p≈0.49), E4.9 9 against 3 (one repetition), E4.5 6.33 against 6.67 (IDD escapes one more check), E4.6 agy 14 against 8 summed over means (the `receta-spa` lead rests on one run), E4.6 Claude 9 against 3 (one repetition) and OSP-011 Claude 4.67 against 1.67 summed over means (three repetitions; p≈0.13 per scenario). Up to E4.6 agy, the benches ran Engram only in gentle-ai's arm (OSP-025). E4.6 Claude is the first with Engram in both arms and with the pair's quality collected (OSP-026): mutation score 89.6 % against 98.4 %, and the blind review prefers IDD in 5 of 6 pairs. In OSP-011 Claude, 94.4 % against 92.1 %, and the blind review prefers IDD in 15 of 18 pairs.
- **What holds:** with Sonnet and gentle-ai 4.1.1, the token saving with Claude on small tasks (0.44×), which has a structural cause (section 4). With Haiku and gentle-ai 4.2.0 it does not repeat: IDD spends 2.61× in E4.6 Claude and 2.34× with n = 3 in OSP-011 Claude (95 % CI of the per-scenario ratio: 1.67 to 3.13), so the extra cost with Haiku is consistent.
- **Token cost:** it depends on the host and the kind of task.
  - With **Claude and Sonnet** on small tasks, IDD spends **0.44×** what gentle-ai spends, and half in dollars. With **Claude and Haiku**, 2.61× (0.28 against 0.12 USD) with one repetition and 2.34× with three (0.28 against 0.13 USD per corpus repetition).
  - With **Gemini 3.8 Flash** (agy), IDD spends more: 2.29× on the six small scenarios and 7.3× on `todo-spa`. On `receta-spa` it spends 0.80×.
- **Reading on complexity:** on the complex tasks IDD spent more, and its most expensive runs escaped fewer defects; on small tasks the saving only shows with Claude and Sonnet. This is a correlation over a few runs, not a proven law (section 4).
- **What gentle-ai does better:** it is cheaper and faster with Gemini and with Haiku, and on `todo-spa` it delivers in one turn with no interventions. Its strength, memory across sessions, is not measured here.

## 1. Common conditions

| Element | Value |
| --- | --- |
| IDD | ospec-workflow 2.132.1 to 2.145.1, built from the checkout, no SDD. Up to E4.6 agy, **no Engram**: only gentle-ai's arm had it (OSP-025). E4.6 Claude and OSP-011 Claude load it in both arms (engram 3.5.1). The router loads in the agy arms and in E4.6 Claude |
| gentle-ai | gentle-ai 4.1.1 with Engram 3.4.0; in E4.6 Claude and OSP-011 Claude, 4.2.0 with Engram 3.5.1 (ODD with RDD on). Engram empty and isolated per scenario. On agy, with three environment adjustments that do not touch its content |
| Agent | Claude Code 2.1.289/2.1.296 with `claude-sonnet-5-5`, Claude Code 2.1.304 with `claude-haiku-5-5`, or Antigravity CLI (`agy`) 1.3.3 to 1.3.5 with `gemini-3.8-flash-high` |
| Persona (the simulated user) | `claude-sonnet-5-5` or `claude-haiku-5-5` on Claude; `claude-sonnet-5-5-medium` or `grok-4.7-high` on agy |
| Judge of the checks | Deterministic hidden checks per scenario; for the one-page apps, headless Chromium over CDP |
| Limits | 30 agent turns; 25 USD per scenario on Claude, 30 M tokens on agy (agy reports no cost) |
| Isolation | One workspace per run. On agy, every process runs in bubblewrap with an allowlisted environment |
| Tokens | Input, output, cache reads and cache writes, subagents included. Cache is 86–91 % of the total in both arms. Setup and the persona do not count |

The persona only gives a scenario's hidden facts if the agent asks. A hidden check that fails is an **escaped defect**: the delivery does not do what the user wanted, even if nobody told it.

## 2. What each bench measures

| Bench | Corpus | Scenarios | Repetitions | Host and persona |
| --- | --- | --- | --- | --- |
| **E4.2** | `default` (`dde01d7028a9`) | 6: `cli-local`, `saas-small`, `regulated`, `brownfield`, `public-library`, `bugfix` (4–5 facts each) | 1 | Claude Code, `claude-sonnet-5-5`, persona `claude-sonnet-5-5` |
| **E4.9** | `default` (`3eed3740a0d6`) | The same 6, with the commit in the brief for both arms | 1 | agy 1.3.4, `gemini-3.8-flash-high`, persona `grok-4.7-high` |
| **E4.5** | `greenfield` | `todo-spa` (16 facts), a new page from a README | 3 | agy 1.3.3, `gemini-3.8-flash-high`, persona `claude-sonnet-5-5-medium` |
| **E4.6 agy** | `greenfield` (`7ce1db3ed2ba`) | `todo-spa` and `receta-spa` (9 facts, written and frozen in the same session that tuned IDD, so its independence is not demonstrated) | 3 | agy 1.3.5, `gemini-3.8-flash-high`, persona `grok-4.7-high` |
| **E4.6 Claude** | `default` (`3eed3740a0d6`) | The 6 of E4.9 | 1 | Claude Code 2.1.304, `claude-haiku-5-5`, persona `claude-haiku-5-5`, Engram in both arms |
| **OSP-011 Claude** | `default` (`3eed3740a0d6`) and `reserved` (`bba3c8d0b72e`) | The 6 of E4.9 and `salas` (4 facts, written and frozen in a change that does not touch IDD) | 3 | Claude Code 2.1.304, `claude-haiku-5-5`, persona `claude-haiku-5-5`, Engram in both arms |

Records: E4.2 `gentle-ai-1` vs `idd-3`; E4.9 `gentle-ai-2` vs `idd-4`; E4.5 `gentle-ai-agy-3` vs `idd-agy-3`; E4.6 agy `gentle-ai-agy-4` vs `idd-agy-4`; E4.6 Claude `gentle-ai-3` vs `idd-6`; OSP-011 Claude `gentle-ai-4` vs `idd-7` and `gentle-ai-4-reserved` vs `idd-7-reserved`. SDD (`sdd-baseline-3`, Claude, 65.7 M tokens, 38.64 USD, 93 min, 0 escaped) stays as a historical reference for a flow with every phase.

## 3. Results

Per-bench sums; in E4.5, E4.6 agy and OSP-011 Claude, per-scenario means added up (different repetitions are not summed with each other).

| Bench | Tokens (gentle-ai → IDD) | Cost | Duration | Questions | Acceptance | Facts | Escaped |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| E4.2 Claude, 6 scenarios | 6.16 M → **2.69 M** (0.44×) | 3.43 → **1.71 USD** | 4.3 → 4.7 min | 2 → 6 | 6/6 → 6/6 | 24/26 → **26/26** | 2 → **0** |
| E4.9 agy, 6 scenarios | **10.78 M** → 24.65 M (2.29×) | n/a | **33.7** → 38.1 min | 0 → 3 | 5/6 → **6/6** | 18/26 → **23/26** | 9 → **3** |
| E4.5 agy, `todo-spa` | 2.28 M → **1.92 M** (0.85×) | n/a | 7.7 → **5.5** min | 0 → 0 | 12/12 → 12/12 | 29/48 → 28/48 | **6.33** → 6.67 |
| E4.6 agy, 2 scenarios | **6.55 M** → 18.39 M (2.81×) | n/a | **62.6** → 80.3 min (sum of the 6 runs) | 0 → 0 | 15/15 → 15/15 | 33/75 → **51/75** | 14 → **8** |
| E4.6 Claude, 6 scenarios | **3.92 M** → 10.23 M (2.61×) | **0.12** → 0.28 USD | **4.5** → 11.8 min | 0 → 6 | 5/6 → 5/6 | 18/26 → **24/26** | 9 → **3** |
| OSP-011 Claude, 6 scenarios | **4.18 M** → 9.78 M (2.34×) | **0.13** → 0.28 USD | **4.6** → 10.9 min | 0 → 6.33 | **18/18** → 17/18 | 64/78 → **74/78** | 4.67 → **1.67** |

Regression passes everywhere (11/11, 3/3, 6/6 and 33/33 in both arms). Bold: best on the axis. In OSP-011 Claude, acceptance counts the 18 runs and the escaped defects are 14 against 5 over those 18. Its reserved scenario `salas` gives 707 k → 2,006 k tokens (2.84×), facts 9/12 → 12/12 and escaped 1, 1, 1 → 0, 0, 0 per repetition.

### E4.6 agy breakdown, per run

| Run | gentle-ai: tokens · turns · escaped | IDD: tokens · turns · escaped |
| --- | --- | --- |
| `todo-spa` #1 | 2.66 M · 1 · 6 | **30.95 M** · 6 · **0** |
| `todo-spa` #2 | 1.67 M · 1 · 7 | 8.42 M · 2 · **0** |
| `todo-spa` #3 | 1.74 M · 1 · 6 | 4.92 M · 2 · 6 |
| `receta-spa` #1 | 1.95 M · 1 · 8 | 3.22 M · 1 · 8 |
| `receta-spa` #2 | 8.07 M · 3 · 7 | 5.40 M · 2 · **2** |
| `receta-spa` #3 | 3.57 M · 2 · 8 | 2.26 M · 1 · 8 |
| **`todo-spa` mean** | **2.02 M** · 6.33 | 14.76 M (7.30×) · **2** |
| **`receta-spa` mean** | 4.53 M · 7.67 | **3.63 M** (0.80×) · **6** |

E4.6 agy checkpoint with `bench-margins-9`, as the harness of its time computed it: **`continue`** (tokens 2.81× against a 10× ceiling; −6 escaped against a +2 ceiling). The 10× ceiling does not bound tokens in this campaign, so that part of the verdict says little. The current checkpoint no longer compares this pair: its IDD arm ran without Engram, and the quality its margins declare was never collected (`quality-missing`).

## 4. Who wins and why

**Quality: not demonstrated.** What the records show, and why it does not settle it:
- IDD's `open-facts` gate asks, before editing, what neither the request nor the code settles, and closing requires evidence from runs the CLI observes. In E4.2 it got 24 of 25 facts from the user; gentle-ai got 6 of 25. gentle-ai's escaped defects are facts nobody gave it (a lowercase code, a page below 1).
- With Gemini the model sometimes declares no open facts and skips the gate. In E4.5 both arms escaped nearly the same, and IDD spent less and delivered tests (33.3 % mutation score against 0 %). The E4.6 IDD was built from a checkout that already included the `open-facts-robustness` change (mandatory categories in `record intent`, required tests, content signals): on `todo-spa` it went from 6.67 to 2 escaped on average. That compares two different benches, it is not an A/B of the change.
- On `receta-spa`, IDD's lead (6 against 7.67) rests on a single run (#2). It is the most fragile difference in this document.
- In E4.6 Claude, with Engram in both arms, gentle-ai asks nothing and escapes 9 facts; IDD asks once per scenario and escapes 3. The pair's quality gives `continue`: mutation score 89.6 % against 98.4 %, and the blind review prefers IDD in 5 pairs, gentle-ai in none and is inconsistent in one. The `bench-margins-10` checkpoint gives `revise` for tokens and one regression (`bugfix/invalid-page-size`, a fact IDD did not ask about). With the same IDD, the `idd-5` reference escaped 1, so the run-to-run variance is of the order of that regression.
- In OSP-011 Claude, with three repetitions, gentle-ai still asks nothing and escapes 4.67 facts summed over means; IDD escapes 1.67. IDD escapes fewer on `brownfield`, `public-library`, `bugfix` and the reserved `salas`, and more on `regulated`, where the persona suggested not ruling out `;` though no fact said so. Over the seven scenarios, an exact sign-permutation test gives p≈0.13: not significant. Quality gives `revise` on both corpora by narrow margins. On the default corpus, the blind review prefers IDD in 15 pairs, gentle-ai in 2 and is inconsistent in one; mutation score 94.4 % against 92.1 %. On `salas`, it prefers IDD in all 3 pairs, and the mutation score (90.6 % against 84.1 %) is pulled down by one delivery at 70.3 %. Both `bench-margins-11` checkpoints give `revise` for tokens; the default-corpus one also for three regressions that fail in one of three repetitions (`regulated/export-day-sorted` and `regulated/csv-escaping`, which come from the persona's answer, and `bugfix/invalid-page-size`).

**Tokens and speed: it depends.**
- **With Claude and Sonnet IDD wins** (0.44×, E4.2). gentle-ai 4.1.1 loads an 82 KB `CLAUDE.md` on every turn and makes 107 model turns against 76. The saving is structural.
- **With Claude and Haiku gentle-ai wins** (E4.6 Claude: IDD spends 2.61×). gentle-ai 4.2.0 makes 97 model turns and IDD 194, with one question and a second turn per scenario. The bench does not separate how much comes from the model and how much from the versions. OSP-011 Claude confirms it with three repetitions: 2.34× (95 % CI of the per-scenario ratio: 1.67 to 3.13), with about 31 model turns per run in IDD against 18 in gentle-ai.
- **With Gemini gentle-ai wins** on the small scenarios and on `todo-spa`: it delivers in one turn and stops. IDD keeps going until its obligations are satisfied, and every extra turn reloads the context.

**The idea that IDD saves on the simple and spends more on the complex to deliver better:**
- **What the records support.**
  - On small tasks with Claude, IDD saves (0.44×).
  - In the two E4.6 apps, within each scenario, the IDD run that spent the most is the one that left the fewest defects: `todo-spa` 30.9 M → 0, 8.4 M → 0, 4.9 M → 6; `receta-spa` 5.4 M → 2, 3.2 M → 8, 2.3 M → 8. gentle-ai does not show it: its most expensive `receta-spa` run (8.1 M) escaped 7.
  - IDD's extra spending buys closure: it iterates until the checks pass, while gentle-ai accepts its first delivery.
- **What they do not support.**
  - With Gemini, IDD does not save even on the six small scenarios (2.29×).
  - Complexity was not measured as a predeclared axis: `receta-spa` and `todo-spa` are similar one-page apps and their token ratio goes from 0.80× to 7.30×. A few long repetitions (30.9 M) drive the gap.
  - It is six runs per scenario: a correlation, not a cause.

## 5. Limits

- **One repetition** in E4.2, E4.9 and E4.6 Claude; three in E4.5, E4.6 agy and OSP-011 Claude. One hidden-fact check moves the result a lot (in E4.2, 2 against 0 over 26 gives p≈0.49 with a two-sided Fisher test).
- **IDD versions changed** between benches (2.132.1, 2.133.0, 2.136.0, 2.137.0, 2.143.0, 2.145.1), and so did gentle-ai's (4.1.1 and 4.2.0), and the `default` corpus changed between E4.2 and E4.9 (`dde01d7028a9` to `3eed3740a0d6`): they are not compared one to one. IDD was tuned on the `default` corpus; `receta-spa` and `salas` are the only reserved scenarios.
- **The persona models differ** between benches (Claude or Grok), and on agy the agent (Gemini) and the quality judge are not from the same family. In E4.6 Claude and OSP-011 Claude, Haiku is the agent, the persona and the judge. In OSP-011 Claude, the persona gave a technical hint that was not among its facts (`regulated/r1`).
- **gentle-ai's empty Engram** measures a new repository with no prior memory; the value of its memory across sessions is not measured.
- **The E4.5 arms ran in parallel** and share Gemini's request limit: durations may come out inflated.
- **Engram only in gentle-ai's arm** in every bench up to E4.6 agy (OSP-025): it adds to gentle-ai's tokens and gives it a memory protocol IDD lacked. E4.6 Claude is the first with Engram in both arms (140 bytes of MCP in each), and OSP-011 Claude repeats that symmetry.
- **`receta-spa` was written in the same session** that tuned IDD for E4.6: the reserved scenario's independence from the tuning is not demonstrated (OSP-026). `salas` (OSP-011 Claude) is the first reserved scenario written outside a tuning session: in a change that does not touch IDD and frozen before running, though by the same author who tunes IDD.
- **The E4.6 agy quality was never collected:** the pair's deliveries are no longer on disk. E4.6 Claude's and OSP-011 Claude's were (`scripts/evals/quality/results/gentle-ai-3__idd-6/`, `gentle-ai-4__idd-7/` and `gentle-ai-4-reserved__idd-7-reserved/`).
- **#342, done for Claude:** OSP-011 Claude repeats with n = 3, symmetric arms and the `reserved` corpus (`salas`), with margins `bench-margins-11` declared in v2.145.0 before running. The n ≥ 3 repetition on agy stays pending in a separate issue.

Detailed analysis of each bench (in Spanish): [E4.2](../analysis/2026-10-12-bench-gentle-ai.md), [E4.5](../analysis/2026-10-13-bench-greenfield.md), [E4.9](../analysis/2026-10-14-bench-arm-symmetry.md), [E4.6 Claude](../analysis/2026-10-21-bench-claude-haiku.md), [OSP-011 Claude](../analysis/2026-10-22-bench-claude-n3.md).
