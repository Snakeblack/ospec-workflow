package store

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestWithLockFailsClosedAfterContention(t *testing.T) {
	target := filepath.Join(t.TempDir(), "phase-costs.jsonl")
	lockPath := target + ".lock"
	if err := os.WriteFile(lockPath, []byte("held"), 0600); err != nil {
		t.Fatal(err)
	}

	called := false
	err := withLock(target, func(func() error) error {
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

// E1.46 state-durability: the lock names its owner, who keeps it fresh while
// it runs and never removes a lock another process took over. Mirrors
// scripts/lib/ospec-state.test.js.
func TestWithLockLeavesATakenOverLockToItsNewOwner(t *testing.T) {
	target := filepath.Join(t.TempDir(), "state.yaml")
	lockPath := target + ".lock"
	var lost error

	err := WithLock(target, func(owned func() error) error {
		if err := owned(); err != nil {
			return err
		}
		if err := os.WriteFile(lockPath, []byte("4242:another-owner"), 0600); err != nil {
			return err
		}
		lost = owned()
		return nil
	})

	if err != nil {
		t.Fatalf("WithLock: %v", err)
	}
	if !errors.Is(lost, ErrLockLost) {
		t.Fatalf("owned() after a takeover = %v, want ErrLockLost", lost)
	}
	content, err := os.ReadFile(lockPath)
	if err != nil || string(content) != "4242:another-owner" {
		t.Fatalf("the new owner's lock = %q, %v; want it untouched", content, err)
	}
}

func TestWithLockReclaimsAStaleTokenlessLockOfAnEarlierVersion(t *testing.T) {
	target := filepath.Join(t.TempDir(), "state.yaml")
	lockPath := target + ".lock"
	if err := os.WriteFile(lockPath, nil, 0600); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-time.Minute)
	if err := os.Chtimes(lockPath, past, past); err != nil {
		t.Fatal(err)
	}

	err := WithLock(target, func(owned func() error) error { return owned() })

	if err != nil {
		t.Fatalf("WithLock over a stale earlier lock: %v", err)
	}
	if _, err := os.Stat(lockPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("lock left behind: %v", err)
	}
}

func TestWithLockHeartbeatKeepsALiveOwnersLockFresh(t *testing.T) {
	timing := lockTiming{stale: 150 * time.Millisecond, heartbeat: 30 * time.Millisecond}
	target := filepath.Join(t.TempDir(), "state.yaml")
	var mu sync.Mutex
	var events []string
	record := func(event string) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, event)
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		errs[0] = withLockTiming(target, timing, func(func() error) error {
			record("start-1")
			time.Sleep(500 * time.Millisecond)
			record("end-1")
			return nil
		})
	}()
	time.Sleep(20 * time.Millisecond)
	go func() {
		defer wg.Done()
		errs[1] = withLockTiming(target, timing, func(func() error) error {
			record("start-2")
			return nil
		})
	}()
	wg.Wait()

	for _, err := range errs {
		if err != nil {
			t.Fatalf("WithLock: %v", err)
		}
	}
	if len(events) != 3 || events[0] != "start-1" || events[1] != "end-1" || events[2] != "start-2" {
		t.Fatalf("events = %v, want [start-1 end-1 start-2]", events)
	}
	if _, err := os.Stat(target + ".lock"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("lock left behind: %v", err)
	}
}

func TestWriteFileAtomicRemovesOnlyItsTargetsStaleTemporaryFiles(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "state.yaml")
	past := time.Now().Add(-time.Minute)
	stale := []string{target + ".tmp", target + ".999-dead.tmp"}
	kept := []string{target + ".1000-live.tmp", filepath.Join(dir, "other.yaml.999-dead.tmp")}
	for _, file := range append(append([]string{}, stale...), kept...) {
		if err := os.WriteFile(file, []byte("half written"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range append(append([]string{}, stale...), kept[1]) {
		if err := os.Chtimes(file, past, past); err != nil {
			t.Fatal(err)
		}
	}

	if err := WriteFileAtomic(target, "new content"); err != nil {
		t.Fatalf("WriteFileAtomic: %v", err)
	}

	if content, err := os.ReadFile(target); err != nil || string(content) != "new content" {
		t.Fatalf("target = %q, %v", content, err)
	}
	for _, file := range stale {
		if _, err := os.Stat(file); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s survived the write: %v", file, err)
		}
	}
	for _, file := range kept {
		if _, err := os.Stat(file); err != nil {
			t.Errorf("%s was removed: %v", file, err)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1+len(kept) {
		t.Errorf("the write left %d entries, want only the target and the kept files", len(entries))
	}
}
