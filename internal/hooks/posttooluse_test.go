package hooks_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/hooks"
)

// TestPostToolUse_ParityFixtures runs internal/testdata/parity/post-tool-use-*
// byte-for-byte, the same fixtures scripts/hooks/parity-contract.test.js runs
// against the JS hook.
func TestPostToolUse_ParityFixtures(t *testing.T) {
	t.Setenv("DISABLE_SECRET_REDACTION", "")
	paths, err := filepath.Glob(filepath.Join("..", "testdata", "parity", "post-tool-use-*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) < 4 {
		t.Fatalf("PostToolUse parity fixture set must not shrink below 4, got %d", len(paths))
	}
	for _, p := range paths {
		name := filepath.Base(p)
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(p)
			if err != nil {
				t.Fatal(err)
			}
			var fix struct {
				Stdin          string `json:"stdin"`
				ExpectedStdout string `json:"expectedStdout"`
			}
			if err := json.Unmarshal(data, &fix); err != nil {
				t.Fatal(err)
			}
			stdout, code := hooks.Dispatch([]string{"post-tool-use"}, []byte(fix.Stdin))
			if code != 0 || string(stdout) != fix.ExpectedStdout {
				t.Errorf("parity mismatch for %s (exit %d)\n  got:  %q\n  want: %q", name, code, stdout, fix.ExpectedStdout)
			}
		})
	}
}

func TestPostToolUse_SwitchAndUnreadablePayload(t *testing.T) {
	token := "ghp_" + strings.Repeat("aB3", 12)
	stdin := []byte(`{"tool_name":"Bash","tool_response":{"stdout":"` + token + `"}}`)

	t.Setenv("DISABLE_SECRET_REDACTION", "true")
	if out, code := hooks.Dispatch([]string{"post-tool-use"}, stdin); out != nil || code != 0 {
		t.Fatalf("disabled redaction must write nothing, got %q (exit %d)", out, code)
	}

	t.Setenv("DISABLE_SECRET_REDACTION", "")
	if out, code := hooks.Dispatch([]string{"post-tool-use"}, []byte("{not json")); out != nil || code != 1 {
		t.Fatalf("an unreadable payload must exit 1 without output, got %q (exit %d)", out, code)
	}
	out, _ := hooks.Dispatch([]string{"post-tool-use"}, stdin)
	if strings.Contains(string(out), token) || !strings.Contains(string(out), "[REDACTED:github-token]") {
		t.Fatalf("the token must be redacted: %s", out)
	}
}

// Review T2: a read of a file classified by name (credentials) is redacted
// in sensitive-file mode; the same content elsewhere is left as is. Mirrors
// post-tool-use.test.js.
func TestPostToolUse_SensitiveFileMode(t *testing.T) {
	t.Setenv("DISABLE_SECRET_REDACTION", "")
	content := `[default]\nregion = eu-west-1\naws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYzR4tQ7nLpK12\n`
	read := func(path string) []byte {
		out, _ := hooks.Dispatch([]string{"post-tool-use"}, []byte(`{"tool_name":"Read","tool_input":{"file_path":"`+path+`"},"tool_response":{"type":"text","file":{"filePath":"`+path+`","content":"`+content+`"}}}`))
		return out
	}
	out := read("/home/user/.aws/credentials")
	if !strings.Contains(string(out), `aws_secret_access_key = [REDACTED:assigned-secret]`) || !strings.Contains(string(out), "region = eu-west-1") {
		t.Fatalf("credentials must be redacted in sensitive-file mode: %s", out)
	}
	if out := read("/repo/notes.txt"); out != nil {
		t.Fatalf("outside a sensitive file the unquoted lowercase form stays, got %s", out)
	}
}

func TestPostToolUse_SensitiveFileModeForShellReads(t *testing.T) {
	t.Setenv("DISABLE_SECRET_REDACTION", "")
	stdout := `region = eu-west-1\naws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYzR4tQ7nLpK12\n`
	run := func(command string) []byte {
		input, _ := json.Marshal(map[string]interface{}{
			"tool_name":     "Bash",
			"tool_input":    map[string]string{"command": command},
			"tool_response": json.RawMessage(`{"stdout":"` + stdout + `","stderr":"","interrupted":false}`),
		})
		out, _ := hooks.Dispatch([]string{"post-tool-use"}, input)
		return out
	}
	redacted := "aws_secret_access_key = [" + "REDACTED" + ":assigned-secret]"
	for _, command := range []string{
		"cat ~/.aws/credentials", "sort .env", `bash -lc "tac $HOME/app/.env.local"`,
		"echo $(cat .env)", `python3 -c "print(open('.env').read())"`, "perl -pe 1 .env",
	} {
		if out := run(command); !strings.Contains(string(out), redacted) || !strings.Contains(string(out), "region = eu-west-1") {
			t.Errorf("%s: must be redacted in sensitive-file mode: %s", command, out)
		}
	}
	// A directory whose name starts with id_ is not a key.
	for _, command := range []string{"cat notes.txt", "source .env", "rg credentials src/", "rg region id_service/"} {
		if out := run(command); out != nil {
			t.Errorf("%s: must keep the normal mode, got %s", command, out)
		}
	}
}

// E1.95: a configuration file is redacted in its own mode. Only the value
// under a sensitive name goes; the same content elsewhere is left as is.
// Mirrors post-tool-use.test.js.
func TestPostToolUse_ConfigFileMode(t *testing.T) {
	t.Setenv("DISABLE_SECRET_REDACTION", "")
	redacted := "[" + "REDACTED" + ":assigned-secret]"
	opaque := "aB3xY7kM9pQ2wE5rT8uI1oP4"
	content := `host: db.internal\nbuild: ` + opaque + `\npassword: hunter#hunter;x,y # local\n`
	read := func(path string) []byte {
		out, _ := hooks.Dispatch([]string{"post-tool-use"}, []byte(`{"tool_name":"Read","tool_input":{"file_path":"`+path+`"},"tool_response":{"type":"text","file":{"filePath":"`+path+`","content":"`+content+`"}}}`))
		return out
	}
	out := string(read("/repo/config/database.yml"))
	if !strings.Contains(out, `password: `+redacted+` # local\n`) || !strings.Contains(out, "host: db.internal") || !strings.Contains(out, "build: "+opaque) {
		t.Fatalf("only the value under a sensitive name goes: %s", out)
	}
	if out := read("/repo/docs/database.md"); out != nil {
		t.Fatalf("outside a configuration file the form is an expression or a type, got %s", out)
	}
	input, _ := json.Marshal(map[string]interface{}{
		"tool_name":     "Bash",
		"tool_input":    map[string]string{"command": "cat api/appsettings.Development.json"},
		"tool_response": map[string]interface{}{"stdout": "{\n  \"Password\": \"hunterhunter\"\n}\n", "stderr": "", "interrupted": false},
	})
	shell, _ := hooks.Dispatch([]string{"post-tool-use"}, input)
	if !strings.Contains(string(shell), `\"Password\": \"`+redacted+`\"`) {
		t.Fatalf("a configuration JSON read by a shell command redacts a letters-only password: %s", shell)
	}
}
