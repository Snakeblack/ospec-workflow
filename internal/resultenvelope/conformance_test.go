package resultenvelope_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/resultenvelope"
)

func loadFixturesFromDir(t *testing.T, relDir string) []struct {
	Name    string
	Payload map[string]any
} {
	t.Helper()

	matches, err := filepath.Glob(filepath.Join(relDir, "*.json"))
	if err != nil {
		t.Fatalf("failed to glob fixtures in %s: %v", relDir, err)
	}
	if len(matches) == 0 {
		t.Fatalf("no fixtures found in %s", relDir)
	}

	var results []struct {
		Name    string
		Payload map[string]any
	}

	for _, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read fixture %s: %v", path, err)
		}

		var payload map[string]any
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("failed to unmarshal fixture %s: %v", path, err)
		}

		results = append(results, struct {
			Name    string
			Payload map[string]any
		}{
			Name:    filepath.Base(path),
			Payload: payload,
		})
	}

	return results
}

func TestConformance_AllValidFixturesPass(t *testing.T) {
	fixtures := loadFixturesFromDir(t, filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "valid"))

	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			valid, errs := resultenvelope.Validate(f.Payload)
			if !valid || len(errs) != 0 {
				t.Fatalf("valid fixture %s unexpectedly failed: %v", f.Name, errs)
			}
		})
	}
}

func TestConformance_AllInvalidFixturesFail(t *testing.T) {
	fixtures := loadFixturesFromDir(t, filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "invalid"))

	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			valid, errs := resultenvelope.Validate(f.Payload)
			if valid || len(errs) == 0 {
				t.Fatalf("invalid fixture %s unexpectedly passed", f.Name)
			}
		})
	}
}

func assertInvalidConformance(t *testing.T, filename, expectedSubstr string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "invalid", filename))
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", filename, err)
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to parse json for %s: %v", filename, err)
	}

	valid, errs := resultenvelope.Validate(payload)
	if valid {
		t.Fatalf("fixture %s must be rejected", filename)
	}

	if expectedSubstr != "" {
		found := false
		for _, errStr := range errs {
			if strings.Contains(errStr, expectedSubstr) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected error mentioning %q in %s, got: %v", expectedSubstr, filename, errs)
		}
	}
}

func TestConformance_BlockedMissingQuestionGate(t *testing.T) {
	assertInvalidConformance(t, "blocked-missing-question-gate.json", "question_gate is required when status is blocked")
}

func TestConformance_EmptyQuestionGateFields(t *testing.T) {
	assertInvalidConformance(t, "empty-question-gate-fields.json", "must be a non-empty string")
}

func TestConformance_EmptyAssumptionFields(t *testing.T) {
	assertInvalidConformance(t, "empty-assumption-fields.json", "must be a non-empty string")
}

func TestConformance_WhitespaceOnlyRequiredStrings(t *testing.T) {
	assertInvalidConformance(t, "whitespace-only-required-strings.json", "must be a non-empty string")
}

func TestConformance_NonStringDetailedReport(t *testing.T) {
	assertInvalidConformance(t, "non-string-detailed-report.json", "detailed_report must be a string")
}

func TestConformance_ExplicitNullQuestionGateOnNonBlockedStatus(t *testing.T) {
	assertInvalidConformance(t, "null-question-gate.json", "question_gate must be an object")
}

func TestConformance_BomWhitespaceOnlyStrings(t *testing.T) {
	assertInvalidConformance(t, "bom-whitespace-only-strings.json", "must be a non-empty string")
}

// F-6f7aad9d4ee43fa6: bind the five top-level fixtures to their valid//invalid/
// corpus copies so the Go conformance loops always evaluate the same content
// the JS suite does. legacy-unversioned is legacy-adapter input (out of
// remediation scope); its differential expectation — rejection by canonical
// v1 validators — is exactly what the invalid/ copy asserts.
func TestConformance_TopLevelFixturesMatchCorpusCopies(t *testing.T) {
	fixturesRoot := filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures")
	copies := []struct{ topLevel, corpusDir, corpusFile string }{
		{"valid-v1.json", "valid", "valid-v1.json"},
		{"blocked-v1.json", "valid", "blocked-v1.json"},
		{"ambiguity-spec-v1.json", "valid", "ambiguity-spec-v1.json"},
		{"invalid-v1.json", "invalid", "invalid-v1.json"},
		{"legacy-unversioned.json", "invalid", "legacy-unversioned.json"},
	}

	for _, c := range copies {
		t.Run(c.topLevel, func(t *testing.T) {
			top, err := os.ReadFile(filepath.Join(fixturesRoot, c.topLevel))
			if err != nil {
				t.Fatalf("failed to read top-level fixture: %v", err)
			}
			corpus, err := os.ReadFile(filepath.Join(fixturesRoot, c.corpusDir, c.corpusFile))
			if err != nil {
				t.Fatalf("failed to read corpus copy: %v", err)
			}
			if string(top) != string(corpus) {
				t.Errorf("%s diverged from %s/%s — edit the corpus copy or sync both", c.topLevel, c.corpusDir, c.corpusFile)
			}
		})
	}
}
