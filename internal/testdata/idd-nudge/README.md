# IDD nudge shared cases (E1.51)

`case.json` drives both implementations of the open-change nudge:
`scripts/hooks/lib/idd-nudge.parity.test.js` (Node) and
`internal/hooks/iddnudge_test.go` (Go). Each test copies `workspace/` into a
temporary directory, makes it a git repository and commits the `commit`
files with a fixed author, committer, date and an empty git configuration
(`GIT_CONFIG_GLOBAL` an empty file, `GIT_CONFIG_NOSYSTEM=1`), so HEAD and every
fingerprint are the same on every machine.

- `fingerprint`: after writing `write`, the fingerprint of the open changes
  `ids` MUST be `expected`.
- `steps`: in a fresh copy, each step either writes files or runs a hook with
  `input` (plus `cwd`) and MUST answer `expect`, compared as parsed JSON.
- `record`: `.ospec/idd-nudge.json` after the last step, byte for byte.

The `state.yaml` files are valid `idd-state/v1` copied from
`internal/testdata/idd-session/` (`one-idd/fix-a` and `steps/s-close`).
