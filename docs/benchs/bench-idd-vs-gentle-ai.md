# Bench: IDD vs gentle-ai (ODD)

[Español](bench-idd-vs-gentle-ai.es.md)

Summary of every bench that compares **IDD** (ospec-workflow) with **gentle-ai** (its ODD flow with RDD, installed with its Engram): the models, personas and conditions of each one, who wins on each axis and why. The numbers come from the versioned records in [`scripts/evals/bench/records/`](../../scripts/evals/bench/records/) and regenerate without rerunning anything:

```sh
node scripts/evals/bench/bench.js report --record <record>
node scripts/evals/bench/bench.js checkpoint --baseline <gentle-ai-…> --candidate <idd-…>
```

Date: 2026-10-14. Bench contract: [`openspec/specs/bench/spec.md`](../../openspec/specs/bench/spec.md). Manual: [`scripts/evals/bench/README.md`](../../scripts/evals/bench/README.md).

## Short conclusion

- **Quality:** IDD escapes fewer defects than gentle-ai in every bench with hidden facts, except `todo-spa` with IDD 2.133.0, where IDD escapes marginally more (6.67 against 6.33, one check, within noise). Neither loses acceptance or regression in any of them.
- **Token cost:** it depends on the host and the kind of task.
  - With **Claude** and small tasks, IDD spends **0.44×** what gentle-ai spends, and half in dollars.
  - With **Gemini 3.8 Flash** (agy), IDD spends more: 2.29× on the six small scenarios and 7.3× on `todo-spa`. On `receta-spa` it spends 0.80×.
- **Reading on complexity:** on complex tasks IDD spends more and delivers better; on small tasks the saving only shows with Claude. This is not a proven law, it is what these records support (section 4).
- **What gentle-ai does better:** it is cheaper and faster with Gemini, and on `todo-spa` it delivers in one turn with no interventions. Its strength, memory across sessions, is not measured here.

## 1. Common conditions

| Element | Value |
| --- | --- |
| IDD | ospec-workflow 2.132.1 to 2.137.0, built from the checkout, no SDD and no Engram. The router loads in the agy arms |
| gentle-ai | gentle-ai 4.1.1 with Engram 3.4.0 (ODD with RDD on), Engram empty and isolated per scenario. On agy, with three environment adjustments that do not touch its content |
| Agent | Claude Code 2.1.289/2.1.296 with `claude-sonnet-5-5`, or Antigravity CLI (`agy`) 1.3.3 to 1.3.5 with `gemini-3.8-flash-high` |
| Persona (the simulated user) | `claude-sonnet-5-5` on Claude; `claude-sonnet-5-5-medium` or `grok-4.7-high` on agy |
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
| **E4.6** | `greenfield` (`7ce1db3ed2ba`) | `todo-spa` and `receta-spa` (9 facts, written and frozen by another session) | 3 | agy 1.3.5, `gemini-3.8-flash-high`, persona `grok-4.7-high` |

Records: E4.2 `gentle-ai-1` vs `idd-3`; E4.9 `gentle-ai-2` vs `idd-4`; E4.5 `gentle-ai-agy-3` vs `idd-agy-3`; E4.6 `gentle-ai-agy-4` vs `idd-agy-4`. SDD (`sdd-baseline-3`, Claude, 65.7 M tokens, 38.64 USD, 93 min, 0 escaped) stays as a historical reference for a flow with every phase.

## 3. Results

Per-bench sums; in E4.5 and E4.6, per-scenario means added up (different repetitions are not summed with each other).

| Bench | Tokens (gentle-ai → IDD) | Cost | Duration | Questions | Acceptance | Facts | Escaped |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| E4.2 Claude, 6 scenarios | 6.16 M → **2.69 M** (0.44×) | 3.43 → **1.71 USD** | 4.3 → 4.7 min | 2 → 6 | 6/6 → 6/6 | 24/26 → **26/26** | 2 → **0** |
| E4.9 agy, 6 scenarios | **10.78 M** → 24.65 M (2.29×) | n/a | **33.7** → 38.1 min | 0 → 3 | 5/6 → **6/6** | 18/26 → **23/26** | 9 → **3** |
| E4.5 agy, `todo-spa` | 2.28 M → **1.92 M** (0.85×) | n/a | 7.7 → **5.5** min | 0 → 0 | 12/12 → 12/12 | 29/48 → 28/48 | **6.33** → 6.67 |
| E4.6 agy, 2 scenarios | **6.55 M** → 18.39 M (2.81×) | n/a | **62.6** → 80.3 min (sum of the 6 runs) | 0 → 0 | 15/15 → 15/15 | 33/75 → **51/75** | 14 → **8** |

Regression passes everywhere (11/11, 3/3 and 6/6 in both arms). Bold: best on the axis.

### E4.6 breakdown, per run

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

E4.6 checkpoint with `bench-margins-9`: **`continue`**. No veto and every margin is met (tokens 2.81× against a 10× ceiling; −6 escaped against a +2 ceiling).

## 4. Who wins and why

**Quality: IDD wins**, with caveats.
- Its `open-facts` gate asks, before editing, what neither the request nor the code settles, and closing requires evidence from runs the CLI observes. In E4.2 it got 24 of 25 facts from the user; gentle-ai got 6 of 25. gentle-ai's escaped defects are facts nobody gave it (a lowercase code, a page below 1).
- With Gemini the model sometimes declares no open facts and skips the gate. In E4.5 both arms escaped nearly the same, and IDD spent less and delivered tests (33.3 % mutation score against 0 %). The E4.6 IDD was built from a checkout that already included the `open-facts-robustness` change (mandatory categories in `record intent`, required tests, content signals): on `todo-spa` it went from 6.67 to 2 escaped on average. That compares two different benches, it is not an A/B of the change.
- On `receta-spa`, IDD's lead (6 against 7.67) rests on a single run (#2). It is the most fragile difference in this document.

**Tokens and speed: it depends.**
- **With Claude IDD wins** (0.44×). gentle-ai loads an 82 KB `CLAUDE.md` on every turn and makes 107 model turns against 76. The saving is structural.
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

- **One repetition** in E4.2 and E4.9; three in E4.5 and E4.6. One hidden-fact check moves the result a lot (in E4.2, 2 against 0 over 26 gives p≈0.49 with a two-sided Fisher test).
- **IDD versions changed** between benches (2.132.1, 2.133.0, 2.136.0, 2.137.0), and the `default` corpus changed between E4.2 and E4.9 (`dde01d7028a9` to `3eed3740a0d6`): they are not compared one to one. IDD was tuned on the `default` corpus; `receta-spa` is the only reserved scenario.
- **The persona models differ** between benches (Claude or Grok), and on agy the agent (Gemini) and the quality judge are not from the same family.
- **gentle-ai's empty Engram** measures a new repository with no prior memory; the value of its memory across sessions is not measured.
- **The E4.5 arms ran in parallel** and share Gemini's request limit: durations may come out inflated.
- **Pending:** rerun the six scenarios with Claude against `idd-4`. The change requires it not to raise questions by more than one per scenario or tokens by more than 20 %, and it has not been run yet.

Detailed analysis of each bench (in Spanish): [E4.2](../analysis/2026-10-12-bench-gentle-ai.md), [E4.5](../analysis/2026-10-13-bench-greenfield.md), [E4.9](../analysis/2026-10-14-bench-arm-symmetry.md).
