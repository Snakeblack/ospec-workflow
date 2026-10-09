# IDD session golden fixtures (E1.12)

Each case holds a `workspace/` and the files the Stop and PreCompact hooks must
write into it under `expected/`. Both implementations run the same cases:
`scripts/hooks/idd-session.test.js` (Node) and
`internal/hooks/iddsession_golden_test.go` (Go). Each test copies the
workspace, runs PreCompact and then Stop with the input of `input.json`, and
compares every `expected/<path>` byte for byte with `<workspace>/.ospec/<path>`.
The `state.yaml` files are valid `idd-state/v1` written by the CLI reducers.
