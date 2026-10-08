package hooks

import (
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
	} {
		if got := extractShellReadPaths(tc.command); !reflect.DeepEqual(got, tc.paths) {
			t.Errorf("%s: got %v, want %v", tc.command, got, tc.paths)
		}
	}
}
