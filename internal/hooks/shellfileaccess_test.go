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
		{"grep API_KEY .env", []string{"API_KEY", ".env"}},
		{"sed -n 1p .env", []string{"1p", ".env"}},
		{"awk '{print}' .env", []string{"{print}", ".env"}},
		{"base64 .env", []string{".env"}},
		{"xxd .env", []string{".env"}},
		{"cp .env /tmp/out.env", []string{".env", "/tmp/out.env"}},
		{"od -c .env", []string{".env"}},
		{"tar cf - .env", []string{"cf", ".env"}},
		{"tar -czf out.tgz .env", []string{"out.tgz", ".env"}},
		{"scp .env host:", []string{".env", "host:"}},
		{"scp -i ~/.ssh/id_rsa notes.txt host:", []string{"notes.txt", "host:"}},
		{"scp -o IdentityFile=~/.ssh/id_rsa notes.txt host:", []string{"notes.txt", "host:"}},
	} {
		if got := extractShellReadPaths(tc.command); !reflect.DeepEqual(got, tc.paths) {
			t.Errorf("%s: got %v, want %v", tc.command, got, tc.paths)
		}
	}
}
