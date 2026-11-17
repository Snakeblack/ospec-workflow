// Tests over the corpus of the secret guards (E1.92), shared with
// scripts/hooks/lib/secret-guards.corpus.test.js (Go/JS parity).
package hooks

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

const secretGuardsCorpus = "../testdata/secret-guards/cases.json"

func TestSecretGuards_SharedCorpus(t *testing.T) {
	data, err := os.ReadFile(secretGuardsCorpus)
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Content []struct {
			Name      string   `json:"name"`
			Input     string   `json:"input"`
			Scanner   string   `json:"scanner"`
			Redaction []string `json:"redaction"`
		} `json:"content"`
		Shell []struct {
			Name    string    `json:"name"`
			Command string    `json:"command"`
			Deny    bool      `json:"deny"`
			Reads   *[]string `json:"reads"`
		} `json:"shell"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Content) == 0 || len(corpus.Shell) == 0 {
		t.Fatal("empty corpus")
	}
	for _, tc := range corpus.Content {
		input := expandCorpus(tc.Input)
		if _, patternID := scanContentForSecrets(input); patternID != tc.Scanner {
			t.Errorf("%s: scanner %q, want %q", tc.Name, patternID, tc.Scanner)
		}
		if _, kinds := redactSecrets(input, false); len(kinds) != 0 || len(tc.Redaction) != 0 {
			if !reflect.DeepEqual(kinds, tc.Redaction) {
				t.Errorf("%s: redaction %v, want %v", tc.Name, kinds, tc.Redaction)
			}
		}
	}
	for _, tc := range corpus.Shell {
		if got := namesDeniedFile(tc.Command, nil); got != tc.Deny {
			t.Errorf("%s: deny %v, want %v", tc.Name, got, tc.Deny)
		}
		if tc.Reads != nil {
			if got := shellReadFiles(tc.Command, nil); len(got) != 0 || len(*tc.Reads) != 0 {
				if !reflect.DeepEqual(got, *tc.Reads) {
					t.Errorf("%s: reads %v, want %v", tc.Name, got, *tc.Reads)
				}
			}
		}
	}
}
