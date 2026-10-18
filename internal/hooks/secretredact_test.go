// Tests for secretredact.go over the corpus shared with
// scripts/hooks/lib/secret-redact.test.js (Go/JS parity).
package hooks

import (
	"encoding/json"
	"os"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

const secretRedactionCorpus = "../testdata/secret-redaction/cases.json"

var (
	corpusCycles = map[string]string{
		"fill":  "aB3xY7kM9pQ2wE5rT8uI1oP4",
		"alpha": "aBxYkMpQwErTuIoP",
		"upper": "AB3XY7KM9PQ2WE5R",
	}
	corpusFillRe = regexp.MustCompile(`\{\{(fill|alpha|upper):(\d+)\}\}`)
)

func expandCorpus(text string) string {
	text = corpusFillRe.ReplaceAllStringFunc(text, func(match string) string {
		parts := corpusFillRe.FindStringSubmatch(match)
		n, _ := strconv.Atoi(parts[2])
		cycle := corpusCycles[parts[1]]
		return strings.Repeat(cycle, n/len(cycle)+1)[:n]
	})
	return strings.NewReplacer("{{dash5}}", "-----", "{{sq}}", "'").Replace(text)
}

type redactionCase struct {
	Name   string   `json:"name"`
	Input  string   `json:"input"`
	Output *string  `json:"output"`
	Kinds  []string `json:"kinds"`
	// SensitiveFile mirrors sensitive_file: redaction of a file the name
	// classifier flags.
	SensitiveFile bool `json:"sensitive_file"`
}

func TestRedactSecrets_SharedCorpus(t *testing.T) {
	data, err := os.ReadFile(secretRedactionCorpus)
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []redactionCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) == 0 {
		t.Fatal("empty corpus")
	}
	for _, tc := range corpus.Cases {
		input := expandCorpus(tc.Input)
		want := input
		if tc.Output != nil {
			want = expandCorpus(*tc.Output)
		}
		got, kinds := redactSecrets(input, tc.SensitiveFile)
		if got != want {
			t.Errorf("%s:\n got %q\nwant %q", tc.Name, got, want)
		}
		if len(kinds) != 0 || len(tc.Kinds) != 0 {
			if !reflect.DeepEqual(kinds, tc.Kinds) {
				t.Errorf("%s: kinds %v, want %v", tc.Name, kinds, tc.Kinds)
			}
		}
		if again, _ := redactSecrets(got, tc.SensitiveFile); again != got {
			t.Errorf("%s: not idempotent: %q", tc.Name, again)
		}
	}
}

func TestRedactDeep_KeepsShape(t *testing.T) {
	token := "ghp_" + strings.Repeat("aB3", 12)
	var response interface{}
	raw := `{"type":"text","file":{"filePath":"/repo/.env","content":"A=1\nGH_TOKEN=` + token + `\n","numLines":3},"interrupted":false}`
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&response); err != nil {
		t.Fatal(err)
	}
	value, kinds := redactDeep(response, false)
	if !reflect.DeepEqual(kinds, []string{"github-token"}) {
		t.Fatalf("kinds %v", kinds)
	}
	out, _ := json.Marshal(value)
	want := `{"file":{"content":"A=1\nGH_TOKEN=[REDACTED:github-token]\n","filePath":"/repo/.env","numLines":3},"interrupted":false,"type":"text"}`
	if string(out) != want {
		t.Fatalf("got %s\nwant %s", out, want)
	}
}

func TestContainsRedactionMarker(t *testing.T) {
	if !containsRedactionMarker("DB_PASSWORD=[REDACTED:assigned-secret]") || containsRedactionMarker("DB_PASSWORD=[REDACTED]") || containsRedactionMarker("") {
		t.Fatal("marker detection")
	}
}
