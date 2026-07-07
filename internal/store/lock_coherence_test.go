// Package store — white-box coherence tests for the lock retry/staleness
// budget (I3). Declared in the same package (not store_test) because they
// assert against the unexported lockRetryAttempts/lockRetryDelay/staleLockAge
// constants directly, mirroring the JS-side coherence test in
// scripts/lib/ospec-state.test.js.
package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
	"time"
)

func TestLockStaleWindowCoherentWithSessionStartTimeout(t *testing.T) {
	hooksPath := filepath.Join("..", "..", "hooks", "hooks.json")
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		t.Fatalf("read hooks.json: %v", err)
	}

	var hooksConfig struct {
		Hooks map[string][]struct {
			Timeout float64 `json:"timeout"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(data, &hooksConfig); err != nil {
		t.Fatalf("parse hooks.json: %v", err)
	}

	sessionStart, ok := hooksConfig.Hooks["SessionStart"]
	if !ok || len(sessionStart) == 0 {
		t.Fatal("SessionStart entry missing from hooks.json")
	}
	if sessionStart[0].Timeout <= 0 {
		t.Fatal("hooks/hooks.json SessionStart entry must declare a positive numeric timeout")
	}

	sessionStartBudget := time.Duration(sessionStart[0].Timeout * float64(time.Second))

	if staleLockAge > sessionStartBudget {
		t.Fatalf(
			"staleLockAge (%s) must not exceed the SessionStart timeout budget (%s)",
			staleLockAge, sessionStartBudget,
		)
	}

	retryFloor := time.Duration(lockRetryAttempts) * lockRetryDelay
	if staleLockAge < retryFloor {
		t.Fatalf(
			"staleLockAge (%s) must be >= the retry-window floor (%s)",
			staleLockAge, retryFloor,
		)
	}
}

func TestLockStaleAgeMatchesJSConstant(t *testing.T) {
	jsPath := filepath.Join("..", "..", "scripts", "lib", "ospec-state.js")
	data, err := os.ReadFile(jsPath)
	if err != nil {
		t.Fatalf("read ospec-state.js: %v", err)
	}

	re := regexp.MustCompile(`LOCK_STALE_MS\s*=\s*(\d+)`)
	match := re.FindSubmatch(data)
	if match == nil {
		t.Fatal("LOCK_STALE_MS constant not found in scripts/lib/ospec-state.js")
	}

	jsValue, err := strconv.ParseInt(string(match[1]), 10, 64)
	if err != nil {
		t.Fatalf("parse LOCK_STALE_MS value: %v", err)
	}

	if jsValue != staleLockAge.Milliseconds() {
		t.Fatalf(
			"LOCK_STALE_MS (JS=%dms) must equal staleLockAge (Go=%dms)",
			jsValue, staleLockAge.Milliseconds(),
		)
	}
}
