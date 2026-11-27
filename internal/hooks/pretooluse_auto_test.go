// The shared cases of internal/testdata/auto-permission/, which the Node hook
// runs too (scripts/hooks/pre-tool-use-auto.test.js), so both compute the same
// key, apply the same permission policy in an automatic run (E1.111) and leave
// the same request.
package hooks_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/hooks"
)

type autoCall struct {
	Tool  string                 `json:"tool"`
	Input map[string]interface{} `json:"input"`
}

type autoRequest struct {
	Tool   string                 `json:"tool"`
	Input  map[string]interface{} `json:"input"`
	Reason string                 `json:"reason"`
}

type autoCase struct {
	Name  string            `json:"name"`
	Stdin string            `json:"stdin"`
	Allow []autoCall        `json:"allow"`
	Env   map[string]string `json:"env"`
	Files map[string]int    `json:"files"`
	Git   string            `json:"git"`
	// RequestsFile leaves the request file as a "symlink" to a file outside
	// the run or as a "fifo" (POSIX only).
	RequestsFile string `json:"requestsFile"`
	Expect       struct {
		Decision            string       `json:"decision"`
		Reason              *string      `json:"reason"`
		ReasonPrefix        *string      `json:"reasonPrefix"`
		SystemMessagePrefix *string      `json:"systemMessagePrefix"`
		Request             *autoRequest `json:"request"`
	} `json:"expect"`
}

type autoShared struct {
	Keys []struct {
		autoCall
		Sha256 string `json:"sha256"`
		SameAs *int   `json:"sameAs"`
	} `json:"keys"`
	Cases []autoCase `json:"cases"`
}

func readAutoShared(t *testing.T) autoShared {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "testdata", "auto-permission", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var shared autoShared
	if err := json.Unmarshal(raw, &shared); err != nil {
		t.Fatal(err)
	}
	return shared
}

func TestPreToolUse_AutoRunCallKey(t *testing.T) {
	keys := readAutoShared(t).Keys
	for index, entry := range keys {
		if got := hooks.CallKeyForTest(entry.Tool, entry.Input); got != entry.Sha256 {
			t.Errorf("key of %s %v = %s, want %s", entry.Tool, entry.Input, got, entry.Sha256)
		}
		for at := index + 1; at < len(keys); at++ {
			same := keys[at].SameAs != nil && *keys[at].SameAs == index
			if (entry.Sha256 == keys[at].Sha256) != same {
				t.Errorf("keys %d and %d: equal %v, want %v", index, at, entry.Sha256 == keys[at].Sha256, same)
			}
		}
	}
}

// dirtyRepository: a repository on a branch other than the default one, with
// an untracked file.
func dirtyRepository(t *testing.T, dir string) {
	t.Helper()
	gitconfig := filepath.Join(t.TempDir(), "gitconfig")
	if err := os.WriteFile(gitconfig, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", gitconfig)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	run := func(args ...string) {
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "README.md")
	run("-c", "user.name=ospec", "-c", "user.email=ospec@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base")
	run("switch", "-q", "-c", "feat/run")
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("untracked\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPreToolUse_AutoRunPolicy(t *testing.T) {
	for _, entry := range readAutoShared(t).Cases {
		t.Run(entry.Name, func(t *testing.T) {
			base := t.TempDir()
			dir := filepath.Join(base, "work")
			session := filepath.Join(base, "run")
			for _, made := range []string{dir, session} {
				if err := os.Mkdir(made, 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if entry.RequestsFile != "" && runtime.GOOS == "windows" {
				t.Skip("symlinks and FIFOs need POSIX")
			}
			if entry.Git == "dirty" {
				dirtyRepository(t, dir)
			}
			requests := filepath.Join(session, "permission-requests.jsonl")
			outside := filepath.Join(base, "outside.txt")
			if err := os.WriteFile(outside, []byte("keep\n"), 0o644); err != nil {
				t.Fatal(err)
			}
			switch entry.RequestsFile {
			case "symlink":
				if err := os.Symlink(outside, requests); err != nil {
					t.Fatal(err)
				}
			case "hardlink":
				if err := os.Link(outside, requests); err != nil {
					t.Fatal(err)
				}
			case "fifo":
				if out, err := exec.Command("mkfifo", requests).CombinedOutput(); err != nil {
					t.Fatalf("mkfifo: %v %s", err, out)
				}
			}
			for file, size := range entry.Files {
				if err := os.WriteFile(filepath.Join(dir, file), []byte(strings.Repeat("a", size)), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			t.Chdir(dir)
			for _, key := range []string{"DISABLE_AGENT_SHIELD", "DISABLE_SECRET_REDACTION", "OSPEC_TARGET", "OSPEC_CODEX_WRAPPER", "OSPEC_OUTPUT_REDACTION"} {
				t.Setenv(key, "")
			}
			t.Setenv("DISABLE_TOKEN_ADVISOR", "true")
			t.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
			t.Setenv("DISABLE_SPEC_DRIFT_GUARD", "true")
			t.Setenv("OSPEC_AUTO_SESSION", session)
			keys := make([]string, 0, len(entry.Allow))
			for _, call := range entry.Allow {
				keys = append(keys, hooks.CallKeyForTest(call.Tool, call.Input))
			}
			t.Setenv("OSPEC_AUTO_ALLOW", strings.Join(keys, ","))
			for key, value := range entry.Env {
				t.Setenv(key, value)
			}

			out, code := hooks.Dispatch([]string{"pre-tool-use"}, []byte(entry.Stdin))
			if code != 0 {
				t.Fatalf("exit %d", code)
			}
			// No decision is no output, or only an advisory for the host's own
			// permissions to go with.
			expect := entry.Expect
			var output struct {
				SystemMessage      string     `json:"systemMessage"`
				HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
			}
			if len(out) > 0 {
				if err := json.Unmarshal(out, &output); err != nil {
					t.Fatalf("parse %q: %v", out, err)
				}
			}
			got := output.HookSpecificOutput
			if got.PermissionDecision != expect.Decision {
				t.Fatalf("decision %q, want %q (%s)", got.PermissionDecision, expect.Decision, out)
			}
			if expect.Reason != nil && got.PermissionDecisionReason != *expect.Reason {
				t.Fatalf("reason %q, want %q", got.PermissionDecisionReason, *expect.Reason)
			}
			if expect.ReasonPrefix != nil && !strings.HasPrefix(got.PermissionDecisionReason, *expect.ReasonPrefix) {
				t.Fatalf("reason %q, want prefix %q", got.PermissionDecisionReason, *expect.ReasonPrefix)
			}
			if expect.SystemMessagePrefix != nil {
				if !strings.HasPrefix(output.SystemMessage, *expect.SystemMessagePrefix) {
					t.Fatalf("systemMessage %q, want prefix %q", output.SystemMessage, *expect.SystemMessagePrefix)
				}
			} else if expect.Decision == "" && len(out) != 0 {
				t.Fatalf("want no output, got %s", out)
			}

			if kept, _ := os.ReadFile(outside); string(kept) != "keep\n" {
				t.Fatalf("a file outside the run changed: %q", kept)
			}
			if entry.RequestsFile != "" {
				if info, err := os.Lstat(requests); entry.RequestsFile != "hardlink" && (err != nil || info.Mode().IsRegular()) {
					t.Fatalf("what the session left there must stay as it was: %v %v", info, err)
				}
				return
			}
			lines, err := os.ReadFile(requests)
			if expect.Request == nil {
				if err == nil {
					t.Fatalf("want no request, got %s", lines)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			parts := strings.Split(strings.TrimSpace(string(lines)), "\n")
			if len(parts) != 1 {
				t.Fatalf("want one request, got %q", lines)
			}
			var request autoRequest
			if err := json.Unmarshal([]byte(parts[0]), &request); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(request, *expect.Request) {
				t.Fatalf("request %+v, want %+v", request, *expect.Request)
			}
		})
	}
}

func TestPreToolUse_AskWithoutAutoRunMark(t *testing.T) {
	t.Setenv("OSPEC_AUTO_SESSION", "")
	t.Setenv("OSPEC_TARGET", "")
	t.Setenv("OSPEC_CODEX_WRAPPER", "")
	got, _ := runPreToolUse(t, []byte(`{"tool_name":"Bash","tool_input":{"command":"npm install"}}`))
	if got.PermissionDecision != "ask" {
		t.Fatalf("decision %q, want ask", got.PermissionDecision)
	}
}

// A link that appears between the hook's check of the request file and its
// opening is never written through, nor is its missing target created.
func TestPreToolUse_AutoRunRequestLinkSwappedIn(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need POSIX")
	}
	for _, scenario := range []struct {
		name             string
		existing, target bool
	}{{"missing file, target outside", false, true}, {"missing file, dangling link", false, false}, {"existing file swapped", true, true}} {
		t.Run(scenario.name, func(t *testing.T) {
			base := t.TempDir()
			session := filepath.Join(base, "run")
			if err := os.Mkdir(session, 0o755); err != nil {
				t.Fatal(err)
			}
			requests := filepath.Join(session, "permission-requests.jsonl")
			target := filepath.Join(base, "outside.txt")
			if scenario.target {
				if err := os.WriteFile(target, []byte("keep\n"), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			if scenario.existing {
				if err := os.WriteFile(requests, nil, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			t.Chdir(base)
			for _, key := range []string{"DISABLE_TOKEN_ADVISOR", "DISABLE_GIT_COLLABORATION_GUARD", "DISABLE_SPEC_DRIFT_GUARD"} {
				t.Setenv(key, "true")
			}
			t.Setenv("OSPEC_TARGET", "")
			t.Setenv("OSPEC_AUTO_ALLOW", "")
			t.Setenv("OSPEC_AUTO_SESSION", session)
			defer hooks.SetBeforeAutoRequestOpenForTest(func(file string) {
				_ = os.Remove(file)
				_ = os.Symlink(target, file)
			})()
			got, _ := runPreToolUse(t, []byte(`{"tool_name":"Bash","tool_input":{"command":"npm install"}}`))
			if got.PermissionDecision != "deny" {
				t.Fatalf("decision %q, want deny", got.PermissionDecision)
			}
			content, err := os.ReadFile(target)
			if !scenario.target {
				if err == nil {
					t.Fatalf("the dangling link's target was created: %q", content)
				}
			} else if string(content) != "keep\n" {
				t.Fatalf("the link's target changed: %q", content)
			}
		})
	}
}
