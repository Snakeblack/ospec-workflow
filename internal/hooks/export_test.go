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
