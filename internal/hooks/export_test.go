// export_test.go — test-only exports for the hooks_test (external) package.
// This file is compiled only during `go test` runs.
package hooks

import "context"

// SetGitRunnerForTest replaces the package-level git runner and returns a
// restore function. Use with `defer restore()` in tests.
//
// This follows the standard Go export_test.go idiom: internal test file (package
// hooks) whose symbols are accessible to external tests (package hooks_test).
var SetGitRunnerForTest = func(fn func(ctx context.Context, args []string) (string, error)) (restore func()) {
	old := gitRunner
	gitRunner = fn
	return func() { gitRunner = old }
}

var ResolveDispatchStatusForTest = resolveDispatchStatus
var PersistResultEnvelopeForTest = persistResultEnvelope

// SetCountTurnForTest replaces how a Stop counts its turn end, and returns a
// restore function.
func SetCountTurnForTest(fn func(workspace string) error) (restore func()) {
	old := countTurn
	countTurn = fn
	return func() { countTurn = old }
}

// CountTurnEndForTest is the real count, for a replacement that fails after it.
var CountTurnEndForTest = countTurnEnd

// SetUncountTurnForTest replaces how a Stop that asks to continue takes back
// its turn end, and returns a restore function.
func SetUncountTurnForTest(fn func(workspace string) error) (restore func()) {
	old := uncountTurn
	uncountTurn = fn
	return func() { uncountTurn = old }
}

// NudgeFingerprint exposes the open-change nudge fingerprint (E1.51) to the
// shared cases of internal/testdata/idd-nudge/.
var NudgeFingerprint = nudgeFingerprint
