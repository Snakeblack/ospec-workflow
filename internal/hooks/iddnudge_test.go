// E1.51: the shared cases of internal/testdata/idd-nudge/, which the Node
// hooks run too (scripts/hooks/lib/idd-nudge.parity.test.js), so both
// implementations compute the same fingerprint, answer the same and write the
// same record.
package hooks_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/hooks"
)

const iddNudgeCase = "../testdata/idd-nudge"

type nudgeStep struct {
	Hook   string            `json:"hook"`
	Input  map[string]any    `json:"input"`
	Expect any               `json:"expect"`
	Write  map[string]string `json:"write"`
}

type nudgeCase struct {
	Commit      []string `json:"commit"`
	Fingerprint struct {
		Write    map[string]string `json:"write"`
		IDs      []string          `json:"ids"`
		Expected string            `json:"expected"`
	} `json:"fingerprint"`
	Steps  []nudgeStep `json:"steps"`
	Record string      `json:"record"`
}

func readNudgeCase(t *testing.T) nudgeCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(iddNudgeCase, "case.json"))
	if err != nil {
		t.Fatal(err)
	}
	var c nudgeCase
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

// nudgeProject copies the workspace into a git repository whose HEAD is the
// same on every machine: a fixed author, committer and date, and no git
// configuration. The hooks run git with the same environment.
func nudgeProject(t *testing.T, c nudgeCase) string {
	t.Helper()
	base := t.TempDir()
	empty := filepath.Join(base, "empty.gitconfig")
	if err := os.WriteFile(empty, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	stamp := "2026-01-01T00:00:00Z"
	for key, value := range map[string]string{
		"GIT_CONFIG_GLOBAL":   empty,
		"GIT_CONFIG_NOSYSTEM": "1",
		"GIT_AUTHOR_NAME":     "ospec",
		"GIT_AUTHOR_EMAIL":    "ospec@example.invalid",
		"GIT_AUTHOR_DATE":     stamp,
		"GIT_COMMITTER_NAME":  "ospec",
		"GIT_COMMITTER_EMAIL": "ospec@example.invalid",
		"GIT_COMMITTER_DATE":  stamp,
		"DISABLE_IDD_NUDGE":   "",
		"OSPEC_TARGET":        "",
	} {
		t.Setenv(key, value)
	}
	root := filepath.Join(base, "repo")
	copyTree(t, filepath.Join(iddNudgeCase, "workspace"), root)
	git := func(args ...string) {
		t.Helper()
		if out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	git("init", "-q", "-b", "main")
	git(append([]string{"add", "--"}, c.Commit...)...)
	git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "init")
	return root
}

func writeNudgeFiles(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for file, content := range files {
		path := filepath.Join(root, filepath.FromSlash(file))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestIddNudgeSharedFingerprint(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	writeNudgeFiles(t, root, c.Fingerprint.Write)
	got, err := hooks.NudgeFingerprint(root, c.Fingerprint.IDs)
	if err != nil {
		t.Fatal(err)
	}
	if got != c.Fingerprint.Expected {
		t.Fatalf("fingerprint %s, want %s", got, c.Fingerprint.Expected)
	}
}

func TestIddNudgeSharedSteps(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	for index, step := range c.Steps {
		if step.Write != nil {
			writeNudgeFiles(t, root, step.Write)
			continue
		}
		input := map[string]any{"cwd": root}
		for key, value := range step.Input {
			input[key] = value
		}
		stdin, _ := json.Marshal(input)
		out, code := hooks.Dispatch([]string{step.Hook}, stdin)
		if code != 0 {
			t.Fatalf("step %d: %s exited %d: %s", index, step.Hook, code, out)
		}
		var got any
		if err := json.Unmarshal(out, &got); err != nil {
			t.Fatalf("step %d: %s output: %v; raw=%q", index, step.Hook, err, out)
		}
		if !reflect.DeepEqual(got, step.Expect) {
			t.Fatalf("step %d: %s %v answered %s, want %v", index, step.Hook, step.Input, out, step.Expect)
		}
	}
	record, err := os.ReadFile(filepath.Join(root, ".ospec", "idd-nudge.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(record) != c.Record {
		t.Fatalf("record:\n%s\nwant:\n%s", record, c.Record)
	}
}

func dispatchNudge(t *testing.T, hook string, input map[string]any) map[string]any {
	t.Helper()
	stdin, _ := json.Marshal(input)
	out, code := hooks.Dispatch([]string{hook}, stdin)
	if code != 0 {
		t.Fatalf("%s exited %d: %s", hook, code, out)
	}
	var got map[string]any
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("%s output: %v; raw=%q", hook, err, out)
	}
	return got
}

func TestIddNudgeOpenGateAsksNothing(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	copyTree(t, filepath.Join(iddSessionCases, "steps", "workspace", "idd", "s-gate"), filepath.Join(root, "idd", "s-gate"))
	dispatchNudge(t, "session-start", map[string]any{"cwd": root, "session_id": "s1"})
	writeNudgeFiles(t, root, map[string]string{"app.js": "module.exports = 2;\n"})
	if got := dispatchNudge(t, "stop", map[string]any{"cwd": root, "session_id": "s1"}); got["continue"] != true || got["decision"] != nil {
		t.Fatalf("an open gate is a legitimate stop, got %v", got)
	}
}

func TestIddNudgeDisabled(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	t.Setenv("DISABLE_IDD_NUDGE", "true")
	if got := dispatchNudge(t, "session-start", map[string]any{"cwd": root, "session_id": "s1"}); got["hookSpecificOutput"] != nil {
		t.Fatalf("no context when disabled, got %v", got)
	}
	writeNudgeFiles(t, root, map[string]string{"app.js": "module.exports = 2;\n"})
	if got := dispatchNudge(t, "stop", map[string]any{"cwd": root, "session_id": "s1"}); got["continue"] != true {
		t.Fatalf("no request when disabled, got %v", got)
	}
	if _, err := os.Stat(filepath.Join(root, ".ospec", "idd-nudge.json")); !os.IsNotExist(err) {
		t.Fatalf("no record when disabled: %v", err)
	}
}

func TestIddNudgeCursorFirstPromptOnly(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	t.Setenv("OSPEC_TARGET", "cursor")
	prompt := map[string]any{"cwd": root, "conversation_id": "c1"}
	if got := dispatchNudge(t, "session-start", prompt); got["hookSpecificOutput"] == nil {
		t.Fatalf("the first prompt gets the open changes, got %v", got)
	}
	if got := dispatchNudge(t, "session-start", prompt); got["hookSpecificOutput"] != nil {
		t.Fatalf("a later prompt does not, got %v", got)
	}
}

func TestIddNudgeCorruptRecordStartsAgain(t *testing.T) {
	c := readNudgeCase(t)
	root := nudgeProject(t, c)
	writeNudgeFiles(t, root, map[string]string{".ospec/idd-nudge.json": "{not json"})
	dispatchNudge(t, "session-start", map[string]any{"cwd": root, "session_id": "s1"})
	writeNudgeFiles(t, root, map[string]string{"app.js": "module.exports = 2;\n"})
	if got := dispatchNudge(t, "stop", map[string]any{"cwd": root, "session_id": "s1"}); got["decision"] != "block" {
		t.Fatalf("a corrupt record starts again, got %v", got)
	}
}

func TestIddNudgeUnreadableTreeSaysWhy(t *testing.T) {
	t.Setenv("DISABLE_IDD_NUDGE", "")
	ws := t.TempDir()
	copyTree(t, filepath.Join(iddNudgeCase, "workspace"), ws)
	got := dispatchNudge(t, "stop", map[string]any{"cwd": ws, "session_id": "s1"})
	message, _ := got["systemMessage"].(string)
	const prefix = "ospec did not ask to continue the open IDD changes: it could not read the work tree ("
	if got["continue"] != true || len(message) <= len(prefix) || message[:len(prefix)] != prefix {
		t.Fatalf("outside git the Stop continues and says why, got %v", got)
	}
}
