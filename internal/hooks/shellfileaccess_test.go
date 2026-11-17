package hooks

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLiteralReadOperands(t *testing.T) {
	for _, tc := range []struct {
		command string
		paths   []string
	}{
		{`cat '.en'v`, []string{".env"}},
		{`cat "a b/.env"`, []string{"a b/.env"}},
		{`Get-Content -Encoding utf8 -LiteralPath C:\project\.env`, []string{`C:\project\.env`}},
		{`cat file\ name/.env`, []string{"file name/.env"}},
		{`echo 'cat .env'; cat README.md`, []string{"README.md"}},
		{`cat README.md > .env`, []string{"README.md"}},
		{`cat < .env`, []string{".env"}},
		{`cat << .env`, nil},
		{"cat <<'EOF'\ncat id_rsa\nEOF\ncat .env", []string{".env"}},
		{"cat README\u00a0.env", []string{"README\u00a0.env"}},
		{`cat "$FILE"`, nil},
		{`echo ok # ; cat .env`, nil},
		{`cat '.env`, nil},
		{"grep API_KEY .env", []string{".env"}},
		{"sed -n 1p .env", []string{".env"}},
		{"awk '{print}' .env", []string{".env"}},
		{"base64 .env", []string{".env"}},
		{"xxd .env", []string{".env"}},
		{"cp .env /tmp/out.env", []string{".env", "/tmp/out.env"}},
		{"od -c .env", []string{".env"}},
		{"tar cf - .env", []string{"cf", ".env"}},
		{"tar -czf out.tgz .env", []string{"out.tgz", ".env"}},
		{"scp .env host:", []string{".env", "host:"}},
		{"scp -i ~/.ssh/id_rsa notes.txt host:", []string{"notes.txt", "host:"}},
		{"scp -o IdentityFile=~/.ssh/id_rsa notes.txt host:", []string{"notes.txt", "host:"}},
		// $'…' quoting: \' does not close it, so the next command stays visible.
		{`echo $'\'' ; cat .env`, []string{".env"}},
		{`cat $'.env`, nil},
		// A backslash before a line break continues the line; a `<<` without its
		// delimiter (an arithmetic shift) hides nothing after it.
		{"cat \\\n  .env", []string{".env"}},
		{"echo $((1<<2))\ncat .env", []string{".env"}},
	} {
		if got := extractShellReadPaths(tc.command); !reflect.DeepEqual(got, tc.paths) {
			t.Errorf("%s: got %v, want %v", tc.command, got, tc.paths)
		}
	}
}

func TestIDNameCountsAsKeyOnlyWhenItIsAFile(t *testing.T) {
	workspace := t.TempDir()
	if err := os.Mkdir(filepath.Join(workspace, "id_service"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "id_deploy"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(workspace)
	for _, command := range []string{"cd id_service && npm test", "go test ./id_service", "git add id_service"} {
		if namesDeniedFile(command, shellFileExists) {
			t.Errorf("%s: denied, want no objection", command)
		}
	}
	if !namesDeniedFile("openssl rsa -in id_deploy -text", shellFileExists) {
		t.Error("openssl rsa -in id_deploy -text: want deny")
	}
}
