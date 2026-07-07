// Package store is a Go port of the artifact-store.js surface used by the
// five runtime hook handlers.  It operates against the openspec single-repo
// backend only (no workspace-federated mode in Phase 1).
package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/yamllite"
)

// ── layout constants ──────────────────────────────────────────────────────────

const (
	// CacheRelPath is the workspace-relative path to the skill-registry cache.
	CacheRelPath = ".ospec/cache/skill-registry.cache.json"
	// LatestRelPath is the workspace-relative path to the latest-session trace.
	LatestRelPath = ".ospec/session/latest.md"
	// RuntimeEventsRelPath is the workspace-relative path to the JSONL events file.
	RuntimeEventsRelPath = ".ospec/runtime/subagent-events.jsonl"
	// PhaseCostFileName is the JSONL file name for per-change phase-cost records.
	PhaseCostFileName = "phase-costs.jsonl"
)

// terminalStatuses matches ospec-state.js TERMINAL_STATUSES.
var terminalStatuses = map[string]bool{
	"archived":  true,
	"closed":    true,
	"complete":  true,
	"completed": true,
	"done":      true,
}

// ── public types ──────────────────────────────────────────────────────────────

// ActiveChange holds the parsed metadata of a non-terminal openspec change.
type ActiveChange struct {
	Content         string // raw state.yaml content
	DirectoryName   string // e.g. "harness-go-migration"
	ChangeDirectory string // absolute path to the change directory
	ModifiedAt      int64  // state.yaml mtime in milliseconds
}

// WriteResult is returned by WriteSessionSummary.
type WriteResult struct {
	Status string // "written" or "fresh"
	Path   string // workspace-relative portable path
}

// BaselineState holds the parsed baseline section from openspec/config.yaml.
type BaselineState struct {
	Status         string
	DomainsPending []string
	DomainsDone    []string
	StaleDomains   []string
	LastChecked    string
}

// Store provides artifact access scoped to a single workspace.
type Store struct {
	// Workspace is the resolved absolute path of the project root.
	Workspace string
	// CacheRelPath is the workspace-relative path to the skill-registry cache.
	CacheRelPath string
}

// NewStore constructs a Store for the given workspace directory.
func NewStore(workspace string) *Store {
	return &Store{
		Workspace:    workspace,
		CacheRelPath: CacheRelPath,
	}
}

// ── path helpers ──────────────────────────────────────────────────────────────

// CachePath returns the absolute path to the skill-registry cache file.
func (s *Store) CachePath() string {
	return filepath.Join(s.Workspace, filepath.FromSlash(CacheRelPath))
}

// LatestSessionPath returns the absolute path to the latest-session trace.
func (s *Store) LatestSessionPath() string {
	return filepath.Join(s.Workspace, filepath.FromSlash(LatestRelPath))
}

// SessionSummaryPath returns the absolute path to the session summary for a change.
func (s *Store) SessionSummaryPath(changeName string) string {
	return filepath.Join(s.Workspace, ".ospec", "session", changeName, "session-summary.md")
}

// SessionPhaseCostPath returns the absolute path to the per-change phase-cost
// JSONL file (REQ-hooks-001).
func (s *Store) SessionPhaseCostPath(changeName string) string {
	return filepath.Join(s.Workspace, ".ospec", "session", changeName, PhaseCostFileName)
}

// runtimeEventsPath returns the absolute path to the runtime JSONL events file.
func (s *Store) runtimeEventsPath() string {
	return filepath.Join(s.Workspace, filepath.FromSlash(RuntimeEventsRelPath))
}

// configPath returns the absolute path to openspec/config.yaml.
func (s *Store) configPath() string {
	return filepath.Join(s.Workspace, "openspec", "config.yaml")
}

// ── IsInitialized ─────────────────────────────────────────────────────────────

// IsInitialized reports whether openspec/config.yaml exists in the workspace.
func (s *Store) IsInitialized() (bool, error) {
	if _, err := os.Stat(s.configPath()); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("store.IsInitialized: %w", err)
	}
	return true, nil
}

// ── ReadConfig ────────────────────────────────────────────────────────────────

// ReadConfig reads openspec/config.yaml and returns its contents.
// Returns nil (no error) when the file does not exist.
func (s *Store) ReadConfig() ([]byte, error) {
	data, err := os.ReadFile(s.configPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("store.ReadConfig: %w", err)
	}
	return data, nil
}

// ── FindActiveChanges ─────────────────────────────────────────────────────────

// readStatus extracts the primary status string from state.yaml content.
// Checks change.status first, then top-level status (same logic as ospec-state.js).
func readStatus(content string) string {
	s := yamllite.ExtractFirstScalar(content, [][]string{
		{"change", "status"},
		{"status"},
	})
	return strings.ToLower(s)
}

// FindActiveChanges scans openspec/changes/ and returns all non-terminal
// changes, sorted by state.yaml modification time (newest first) then by
// directory name (ascending) for deterministic tie-breaking.
func (s *Store) FindActiveChanges() ([]*ActiveChange, error) {
	changesDir := filepath.Join(s.Workspace, "openspec", "changes")
	entries, err := os.ReadDir(changesDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("store.FindActiveChanges: %w", err)
	}

	var changes []*ActiveChange
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "archive" {
			continue
		}
		statePath := filepath.Join(changesDir, e.Name(), "state.yaml")
		data, err := os.ReadFile(statePath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, fmt.Errorf("store.FindActiveChanges: reading %s: %w", statePath, err)
		}
		info, err := os.Stat(statePath)
		if err != nil {
			return nil, fmt.Errorf("store.FindActiveChanges: stat %s: %w", statePath, err)
		}
		status := readStatus(string(data))
		if terminalStatuses[status] {
			continue
		}
		changes = append(changes, &ActiveChange{
			Content:         string(data),
			DirectoryName:   e.Name(),
			ChangeDirectory: filepath.Join(changesDir, e.Name()),
			ModifiedAt:      info.ModTime().UnixMilli(),
		})
	}

	sort.Slice(changes, func(i, j int) bool {
		if changes[i].ModifiedAt != changes[j].ModifiedAt {
			return changes[i].ModifiedAt > changes[j].ModifiedAt
		}
		return changes[i].DirectoryName < changes[j].DirectoryName
	})

	return changes, nil
}

// ── WriteSessionSummary ───────────────────────────────────────────────────────

// WriteSessionSummary atomically writes content to the session summary for
// changeName.  If the file already contains an identical content it returns
// status "fresh" without a write; otherwise it returns "written".
func (s *Store) WriteSessionSummary(changeName, content string) (*WriteResult, error) {
	summaryPath := s.SessionSummaryPath(changeName)

	// Idempotency check.
	if existing, err := os.ReadFile(summaryPath); err == nil {
		if string(existing) == content {
			return &WriteResult{
				Status: "fresh",
				Path:   toPortableRelPath(s.Workspace, summaryPath),
			}, nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("store.WriteSessionSummary: read check: %w", err)
	}

	if err := atomicWriteFile(summaryPath, content); err != nil {
		return nil, fmt.Errorf("store.WriteSessionSummary: %w", err)
	}
	return &WriteResult{
		Status: "written",
		Path:   toPortableRelPath(s.Workspace, summaryPath),
	}, nil
}

// ── AppendRuntimeEvent ────────────────────────────────────────────────────────

// AppendRuntimeEvent appends line + "\n" to the runtime JSONL events file,
// using an advisory lock (.lock sibling) to serialise concurrent writers.
func (s *Store) AppendRuntimeEvent(line []byte) error {
	evPath := s.runtimeEventsPath()
	if err := os.MkdirAll(filepath.Dir(evPath), 0755); err != nil {
		return fmt.Errorf("store.AppendRuntimeEvent: mkdir: %w", err)
	}
	return withLock(evPath, func() error {
		f, err := os.OpenFile(evPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return fmt.Errorf("store.AppendRuntimeEvent: open: %w", err)
		}
		data := append(append([]byte(nil), line...), '\n')
		if _, werr := f.Write(data); werr != nil {
			f.Close()
			return fmt.Errorf("store.AppendRuntimeEvent: write: %w", werr)
		}
		if cerr := f.Close(); cerr != nil {
			return fmt.Errorf("store.AppendRuntimeEvent: close: %w", cerr)
		}
		return nil
	})
}

// ── AppendPhaseCost ───────────────────────────────────────────────────────────

// AppendPhaseCost appends line + "\n" to the per-change phase-cost JSONL file
// under .ospec/session/{changeName}/phase-costs.jsonl, using the same
// advisory-lock convention as AppendRuntimeEvent.
func (s *Store) AppendPhaseCost(changeName string, line []byte) error {
	costPath := s.SessionPhaseCostPath(changeName)
	if err := os.MkdirAll(filepath.Dir(costPath), 0755); err != nil {
		return fmt.Errorf("store.AppendPhaseCost: mkdir: %w", err)
	}
	return withLock(costPath, func() error {
		f, err := os.OpenFile(costPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return fmt.Errorf("store.AppendPhaseCost: open: %w", err)
		}
		data := append(append([]byte(nil), line...), '\n')
		if _, werr := f.Write(data); werr != nil {
			f.Close()
			return fmt.Errorf("store.AppendPhaseCost: write: %w", werr)
		}
		if cerr := f.Close(); cerr != nil {
			return fmt.Errorf("store.AppendPhaseCost: close: %w", cerr)
		}
		return nil
	})
}

// ── ReadBaselineState ─────────────────────────────────────────────────────────

// ReadBaselineState parses the baseline: section from config.yaml content.
// Returns nil if no baseline section is found.
// Ports readBaselineState from scripts/lib/ospec-state.js.
func ReadBaselineState(configContent string) *BaselineState {
	const (
		topKey       = "baseline:"
		fieldIndent  = 2
		listIndent   = 4
	)
	lines := strings.Split(strings.ReplaceAll(configContent, "\r\n", "\n"), "\n")
	foundBaseline := false
	inBaseline := false
	currentListKey := ""
	result := &BaselineState{}

	for _, raw := range lines {
		raw = strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(raw)
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))

		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if indent == 0 {
			inBaseline = trimmed == topKey
			if inBaseline {
				foundBaseline = true
			}
			currentListKey = ""
			continue
		}
		if !inBaseline {
			continue
		}
		if indent == fieldIndent {
			currentListKey = applyBaselineField(trimmed, result)
		} else if indent >= listIndent && currentListKey != "" {
			appendBaselineListItem(trimmed, currentListKey, result)
		}
	}

	if !foundBaseline {
		return nil
	}
	return result
}

// applyBaselineField applies an indent-2 field line to result and returns the
// list key that subsequent list items belong to ("" for scalar / non-list
// fields or an inline empty list).
func applyBaselineField(trimmed string, result *BaselineState) string {
	// Inline empty list: "key: []" — list stays empty (already initialised).
	if strings.HasSuffix(trimmed, ": []") {
		return ""
	}
	sep := strings.IndexByte(trimmed, ':')
	if sep == -1 {
		return ""
	}
	key := trimmed[:sep]
	val := strings.TrimSpace(trimmed[sep+1:])
	switch key {
	case "status":
		result.Status = stripInlineComment(val)
	case "last_checked":
		result.LastChecked = stripInlineComment(stripQuotes(val))
	case "domains_pending", "domains_done", "stale_domains":
		if val == "" {
			return key
		}
	}
	return ""
}

// appendBaselineListItem appends an indent>=4 "- item" line to the list named
// by currentListKey.
func appendBaselineListItem(trimmed, currentListKey string, result *BaselineState) {
	m := strings.TrimPrefix(trimmed, "- ")
	if m == trimmed {
		return
	}
	item := strings.TrimSpace(m)
	switch currentListKey {
	case "domains_pending":
		result.DomainsPending = append(result.DomainsPending, item)
	case "domains_done":
		result.DomainsDone = append(result.DomainsDone, item)
	case "stale_domains":
		result.StaleDomains = append(result.StaleDomains, item)
	}
}

// ── internal helpers ──────────────────────────────────────────────────────────

// atomicWriteFile writes content to dst using a temp-file + rename pattern.
func atomicWriteFile(dst, content string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return fmt.Errorf("atomicWriteFile: mkdir: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".write-*")
	if err != nil {
		return fmt.Errorf("atomicWriteFile: create temp: %w", err)
	}
	tmpPath := tmp.Name()

	_, writeErr := tmp.WriteString(content)
	closeErr := tmp.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(tmpPath)
		if writeErr != nil {
			return fmt.Errorf("atomicWriteFile: write: %w", writeErr)
		}
		return fmt.Errorf("atomicWriteFile: close: %w", closeErr)
	}
	if err := os.Rename(tmpPath, dst); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("atomicWriteFile: rename: %w", err)
	}
	return nil
}

// WithLock serialises fn around an advisory lock file at path+".lock". Exported
// so other packages (e.g. internal/hooks, for the C5 result-envelope
// persistence path) can reuse the same cross-platform lock primitive that
// AppendRuntimeEvent already relies on, instead of duplicating it. Mirrors
// scripts/lib/ospec-state.js#withFileLock.
func WithLock(path string, fn func() error) error {
	return withLock(path, fn)
}

// withLock serialises fn around an advisory lock file.
var errLockContended = errors.New("lock contended")

// Lock retry/staleness budget — MUST stay coherent with SessionStart's
// declared hook timeout in hooks/hooks.json (see openspec/specs/hooks/spec.md
// §9 and openspec/specs/hooks-runtime/spec.md NFR). Mirrored in
// scripts/lib/ospec-state.js (LOCK_RETRY_ATTEMPTS/LOCK_RETRY_DELAY_MS/
// LOCK_STALE_MS) — keep both sides numerically identical; TestLockStaleAgeMatchesJSConstant
// cross-checks this at test time.
const (
	lockRetryAttempts = 100
	lockRetryDelay    = 15 * time.Millisecond
	staleLockAge      = 5 * time.Second
)

func withLock(path string, fn func() error) error {
	lockPath := path + ".lock"
	for attempt := 0; ; attempt++ {
		if err := tryLock(lockPath, fn); err != errLockContended {
			return err
		}
		if attempt >= lockRetryAttempts {
			// Best-effort after exhausting retries.
			return fn()
		}
		time.Sleep(lockRetryDelay)
	}
}

func tryLock(lockPath string, fn func() error) error {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			// Reclaim stale lock.
			if info, err2 := os.Stat(lockPath); err2 == nil {
				if time.Since(info.ModTime()) > staleLockAge {
					_ = os.Remove(lockPath)
				}
			}
			return errLockContended
		}
		return err
	}
	defer func() {
		_ = f.Close()
		_ = os.Remove(lockPath)
	}()
	return fn()
}

// toPortableRelPath returns the workspace-relative path with forward slashes.
func toPortableRelPath(workspace, absPath string) string {
	rel, err := filepath.Rel(workspace, absPath)
	if err != nil {
		return absPath
	}
	return filepath.ToSlash(rel)
}

// stripInlineComment removes trailing " # comment" from a YAML scalar.
func stripInlineComment(s string) string {
	trimmed := strings.TrimSpace(s)
	// Find " #" sequence (preceded by whitespace)
	for i := 1; i < len(trimmed); i++ {
		if trimmed[i] == '#' && (trimmed[i-1] == ' ' || trimmed[i-1] == '\t') {
			return strings.TrimSpace(trimmed[:i])
		}
	}
	return trimmed
}

// stripQuotes removes surrounding single or double quotes.
func stripQuotes(s string) string {
	if n := len(s); n >= 2 {
		q := s[0]
		if (q == '"' || q == '\'') && s[n-1] == q {
			return s[1 : n-1]
		}
	}
	return s
}
