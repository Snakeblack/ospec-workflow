# Latest Session

- Ended at: `2026-10-09T12:00:00Z`
- Session: `session-idd`
- Active change: `add-export`, `a-config`, `b-docs`, `c-facts` (ambiguous: 4 open changes)
- Current phase: `multiple`
- Change status: `multiple`
- Detailed summary: `None`

## Next recommended action
Several changes are open; choose the one to resume:
- `add-export` (sdd): Run `sdd-apply add-export`.
- `a-config` (idd): Configure the project checks before `checks-pass`: `ospec next --change a-config` proposes the command, which needs the user's approval.
- `b-docs` (idd): Declare the plan: `ospec signals --change b-docs --path <file>... [--work-units <n>] [--decision] [--operation <op>]`.
- `c-facts` (idd): Resolve the `open-facts` gate with the user: `ospec next --change c-facts` shows what to ask.
