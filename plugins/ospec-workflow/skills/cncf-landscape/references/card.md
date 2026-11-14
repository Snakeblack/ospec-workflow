# Landscape card

A card records one candidate for one need. It is not an adoption decision.

| Field | Meaning |
| --- | --- |
| `need`, `category`, `candidate` | The concrete need, the catalog area consulted and the candidate's identity. |
| `fit`, `constraints`, `tradeoffs` | Fit to this project, exclusions, operating cost, competencies and the simple alternative. |
| `maturity`, `maturity_source` | The published state and its link. Independent of `fit`. |
| `claims` | A bounded claim with status `verified`, `unknown` or `stale`, plus scope and evidence. |
| `sources` | `url`, `revision` when available, the real `retrieved_at`, and the relevant section. |
| `owner`, `refresh_trigger` | Who keeps the card, and what would make it be checked again. |
| `decision_status` | `proposed`, `pending` or a link to the project decision. A retrieved page is not acceptance. |

Graduated, incubating, sandbox or any other published state does not show fit, absence of vulnerabilities or contractual support. Verify maturity from the project's own source. Not every landscape item is a CNCF project.

A static reference pinned to a revision reproduces the analysis. A live read checks a fact that changes. Do not mix their dates or revisions.

`retrieved_at` is only when the source was retrieved. A review you could not fetch is `unknown`.

Without a connection, reuse the references already stored, mark how old they are and leave unchecked claims `unknown`. If the open decision depends on a current feature you cannot check, that decision stays `pending`. Do not invent the answer. Other decisions continue.
