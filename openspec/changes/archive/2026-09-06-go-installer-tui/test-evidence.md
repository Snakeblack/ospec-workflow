# Final regression evidence

- Candidate HEAD: `e5dc5cb17529e3798464cf0a2a8676076ed1e7a3`
- Execution date: 2026-09-06
- No installer or live-home action was performed.

## Node

- Command: `npm test`
- Exit code: `0`
- Duration: `96.577 s`
- Result: `3243` passing checkmark assertions; `0` failure markers; `All checks passed.`
- Complete log: `openspec/changes/go-installer-tui/final-node-regression.log`

## Go

- Command: `go test ./...`
- Exit code: `0`
- Duration: `111.931 s`
- Result: `11` packages passed; `1` package reported `[no test files]`; `0` failed packages.
- Complete log: `openspec/changes/go-installer-tui/final-go-regression.log`

No failures were observed in either regression run.
