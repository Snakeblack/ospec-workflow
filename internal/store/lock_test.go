package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWithLockFailsClosedAfterContention(t *testing.T) {
	target := filepath.Join(t.TempDir(), "phase-costs.jsonl")
	lockPath := target + ".lock"
	if err := os.WriteFile(lockPath, []byte("held"), 0600); err != nil {
		t.Fatal(err)
	}

	called := false
	err := withLock(target, func() error {
		called = true
		return nil
	})
	if !errors.Is(err, errLockContended) {
		t.Fatalf("withLock error = %v, want lock contention", err)
	}
	if called {
		t.Fatal("withLock ran callback without acquiring the lock")
	}
}
