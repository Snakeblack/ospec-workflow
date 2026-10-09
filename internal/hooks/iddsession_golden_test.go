// E1.12 session-hook-idd: the Go Stop and PreCompact hooks write the same
// bytes as the Node hooks for the shared golden cases of
// internal/testdata/idd-session/ (scripts/hooks/idd-session.test.js).
package hooks_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/hooks"
)

const iddSessionCases = "../testdata/idd-session"

func copyTree(t *testing.T, src, dst string) {
	t.Helper()
	err := filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
	if err != nil {
		t.Fatalf("copy %s: %v", src, err)
	}
}

func expectedSessionFiles(t *testing.T, dir string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		files = append(files, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", dir, err)
	}
	sort.Strings(files)
	return files
}

func dispatchContinue(t *testing.T, hook string, payload map[string]any) {
	t.Helper()
	stdin, _ := json.Marshal(payload)
	out, code := hooks.Dispatch([]string{hook}, stdin)
	if code != 0 {
		t.Fatalf("%s exited %d", hook, code)
	}
	var result map[string]any
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatalf("%s output: %v; raw=%q", hook, err, out)
	}
	if result["continue"] != true || result["systemMessage"] != nil {
		t.Fatalf("%s must continue without a message, got %s", hook, out)
	}
}

func TestIddSessionGoldenCases(t *testing.T) {
	for _, name := range []string{"one-idd", "many", "steps", "malformed"} {
		t.Run(name, func(t *testing.T) {
			caseDir := filepath.Join(iddSessionCases, name)
			ws := t.TempDir()
			copyTree(t, filepath.Join(caseDir, "workspace"), ws)

			var input map[string]any
			raw, err := os.ReadFile(filepath.Join(caseDir, "input.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(raw, &input); err != nil {
				t.Fatal(err)
			}
			input["cwd"] = ws

			dispatchContinue(t, "pre-compact", map[string]any{"cwd": ws})
			dispatchContinue(t, "stop", input)

			expectedDir := filepath.Join(caseDir, "expected")
			for _, file := range expectedSessionFiles(t, expectedDir) {
				want, err := os.ReadFile(filepath.Join(expectedDir, filepath.FromSlash(file)))
				if err != nil {
					t.Fatal(err)
				}
				got, err := os.ReadFile(filepath.Join(ws, ".ospec", filepath.FromSlash(file)))
				if err != nil {
					t.Fatalf(".ospec/%s: %v", file, err)
				}
				if string(got) != string(want) {
					t.Errorf(".ospec/%s differs\n--- got ---\n%s\n--- want ---\n%s", file, got, want)
				}
			}
			for _, hidden := range []string{"z-closed", "old", "archive"} {
				if _, err := os.Stat(filepath.Join(ws, ".ospec", "session", hidden)); err == nil {
					t.Errorf("%s is not an open change", hidden)
				}
			}
		})
	}
}

func TestIddSessionSkipsUnreadableStates(t *testing.T) {
	ws := t.TempDir()
	copyTree(t, filepath.Join(iddSessionCases, "one-idd", "workspace"), ws)
	if err := os.MkdirAll(filepath.Join(ws, "idd", "broken"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, "idd", "broken", "state.yaml"), []byte("{ not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(ws, "idd", "no-state"), 0o755); err != nil {
		t.Fatal(err)
	}
	// A state.yaml that is a directory cannot be read either.
	if err := os.MkdirAll(filepath.Join(ws, "idd", "dir-state", "state.yaml"), 0o755); err != nil {
		t.Fatal(err)
	}
	dispatchContinue(t, "pre-compact", map[string]any{"cwd": ws})
	dispatchContinue(t, "stop", map[string]any{"cwd": ws, "timestamp": "t", "session_id": "s"})
	latest, err := os.ReadFile(filepath.Join(ws, ".ospec", "session", "latest.md"))
	if err != nil {
		t.Fatal(err)
	}
	if want := "- Active change: `fix-a`\n"; !strings.Contains(string(latest), want) {
		t.Errorf("latest.md must name fix-a, got:\n%s", latest)
	}
	for _, skipped := range []string{"broken", "no-state", "dir-state"} {
		if _, err := os.Stat(filepath.Join(ws, ".ospec", "session", skipped)); err == nil {
			t.Errorf("%s must be skipped", skipped)
		}
	}
}

func TestIddSessionUnreadableConfigDeclaresNoChecks(t *testing.T) {
	caseDir := filepath.Join(iddSessionCases, "many")
	ws := t.TempDir()
	copyTree(t, filepath.Join(caseDir, "workspace"), ws)
	for _, dir := range []string{filepath.Join("idd", "config.yaml"), filepath.Join("idd", "dir-state", "state.yaml")} {
		if err := os.MkdirAll(filepath.Join(ws, dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	dispatchContinue(t, "pre-compact", map[string]any{"cwd": ws})
	dispatchContinue(t, "stop", map[string]any{"cwd": ws, "timestamp": "2026-10-09T12:00:00Z", "session_id": "session-idd"})
	for _, file := range []string{"session/latest.md", "session/a-config/session-summary.md"} {
		want, err := os.ReadFile(filepath.Join(caseDir, "expected", filepath.FromSlash(file)))
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filepath.Join(ws, ".ospec", filepath.FromSlash(file)))
		if err != nil {
			t.Fatalf(".ospec/%s: %v", file, err)
		}
		if string(got) != string(want) {
			t.Errorf(".ospec/%s differs\n--- got ---\n%s\n--- want ---\n%s", file, got, want)
		}
	}
	if _, err := os.Stat(filepath.Join(ws, ".ospec", "session", "add-export", "session-summary.md")); err != nil {
		t.Errorf("the SDD summary must still be written: %v", err)
	}
}

func TestIddSessionNoOpenChangeCreatesNothingOnPreCompact(t *testing.T) {
	ws := t.TempDir()
	if err := os.MkdirAll(filepath.Join(ws, "idd", "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	dispatchContinue(t, "pre-compact", map[string]any{"cwd": ws})
	if _, err := os.Stat(filepath.Join(ws, ".ospec")); err == nil {
		t.Errorf("PreCompact without open changes must not create .ospec/")
	}
}
