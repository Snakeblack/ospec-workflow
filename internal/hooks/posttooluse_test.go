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
	if out := read("/repo/settings.ini"); out != nil {
		t.Fatalf("outside a sensitive file the unquoted lowercase form stays, got %s", out)
	}
}
