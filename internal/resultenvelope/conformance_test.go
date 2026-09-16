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

func TestConformance_BlockedMissingQuestionGate(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "invalid", "blocked-missing-question-gate.json"))
	if err != nil {
		t.Fatalf("failed to read fixture: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}

	valid, errs := resultenvelope.Validate(payload)
	if valid {
		t.Fatal("blocked without question_gate must be rejected")
	}

	found := false
	for _, errStr := range errs {
		if strings.Contains(errStr, "question_gate is required when status is blocked") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected question_gate required error, got: %v", errs)
	}
}

func TestConformance_EmptyQuestionGateFields(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "invalid", "empty-question-gate-fields.json"))
	if err != nil {
		t.Fatalf("failed to read fixture: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}

	valid, errs := resultenvelope.Validate(payload)
	if valid {
		t.Fatal("empty question_gate strings must be rejected")
	}

	found := false
	for _, errStr := range errs {
		if strings.Contains(errStr, "must be a non-empty string") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected non-empty string error, got: %v", errs)
	}
}

func TestConformance_EmptyAssumptionFields(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "schemas", "kernel", "result-envelope", "v1", "fixtures", "invalid", "empty-assumption-fields.json"))
	if err != nil {
		t.Fatalf("failed to read fixture: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to parse json: %v", err)
	}

	valid, errs := resultenvelope.Validate(payload)
	if valid {
		t.Fatal("empty assumption strings must be rejected")
	}

	found := false
	for _, errStr := range errs {
		if strings.Contains(errStr, "must be a non-empty string") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected non-empty string error, got: %v", errs)
	}
}
