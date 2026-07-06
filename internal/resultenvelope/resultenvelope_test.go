// Tests for the resultenvelope package.
// Cases mirror scripts/lib/result-envelope.test.js byte-for-byte in intent.
package resultenvelope_test

import (
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/resultenvelope"
)

func validEnvelope() map[string]any {
	return map[string]any{
		"status":            "success",
		"executive_summary": "Did the thing.",
		"artifacts":         []any{"openspec/changes/foo/design.md"},
		"next_recommended":  "sdd-tasks",
		"risks":             "None",
		"skill_resolution":  "injected",
	}
}

func fence(json string) string {
	return "Some prose before.\n\n```json:result-envelope\n" + json + "\n```\n\nSome prose after."
}

// ── Extract ───────────────────────────────────────────────────────────────────

func TestExtract_FindsAndParsesValidFence(t *testing.T) {
	text := fence(`{"status":"success","executive_summary":"Did the thing.","artifacts":["openspec/changes/foo/design.md"],"next_recommended":"sdd-tasks","risks":"None","skill_resolution":"injected"}`)

	value, found := resultenvelope.Extract(text)
	if !found {
		t.Fatal("expected found=true")
	}
	if value["status"] != "success" {
		t.Errorf("status: got %v, want success", value["status"])
	}
	if value["executive_summary"] != "Did the thing." {
		t.Errorf("executive_summary: got %v", value["executive_summary"])
	}
}

func TestExtract_AbsentFenceReturnsFalse(t *testing.T) {
	value, found := resultenvelope.Extract("Just prose, no fence at all.")
	if found {
		t.Error("expected found=false")
	}
	if value != nil {
		t.Errorf("expected nil value, got %v", value)
	}
}

func TestExtract_MalformedJsonReturnsFoundTrueNilValue(t *testing.T) {
	text := "```json:result-envelope\n{ not valid json \n```"
	value, found := resultenvelope.Extract(text)
	if !found {
		t.Fatal("expected found=true (fence is present, even if malformed)")
	}
	if value != nil {
		t.Errorf("expected nil value for malformed JSON, got %v", value)
	}
}

func TestExtract_DoesNotMatchBareJsonFence(t *testing.T) {
	text := "```json\n{\"status\":\"success\"}\n```"
	_, found := resultenvelope.Extract(text)
	if found {
		t.Error("expected found=false for a bare ```json fence (no info-string suffix)")
	}
}

func TestExtract_NeverPanicsOnEmptyInput(t *testing.T) {
	_, found := resultenvelope.Extract("")
	if found {
		t.Error("expected found=false for empty string")
	}
}

// ── Validate ──────────────────────────────────────────────────────────────────

func TestValidate_ValidEnvelopePassesWithNoErrors(t *testing.T) {
	valid, errs := resultenvelope.Validate(validEnvelope())
	if !valid {
		t.Errorf("expected valid=true, errors=%v", errs)
	}
	if len(errs) != 0 {
		t.Errorf("expected no errors, got %v", errs)
	}
}

func TestValidate_MissingRequiredFields(t *testing.T) {
	fields := []string{
		"status",
		"executive_summary",
		"artifacts",
		"next_recommended",
		"risks",
		"skill_resolution",
	}

	for _, field := range fields {
		t.Run(field, func(t *testing.T) {
			envelope := validEnvelope()
			delete(envelope, field)

			valid, errs := resultenvelope.Validate(envelope)
			if valid {
				t.Errorf("expected valid=false when %q is missing", field)
			}
			if !containsSubstring(errs, field) {
				t.Errorf("expected an error mentioning %q, got %v", field, errs)
			}
		})
	}
}

func TestValidate_BadStatusEnum(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "done"

	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for bad status enum")
	}
	if !containsSubstring(errs, "status") {
		t.Errorf("expected an error mentioning status, got %v", errs)
	}
}

func TestValidate_ArtifactsAcceptsInlineLiteral(t *testing.T) {
	envelope := validEnvelope()
	envelope["artifacts"] = "inline"

	valid, _ := resultenvelope.Validate(envelope)
	if !valid {
		t.Error("expected valid=true when artifacts is the literal string \"inline\"")
	}
}

func TestValidate_RisksAcceptsList(t *testing.T) {
	envelope := validEnvelope()
	envelope["risks"] = []any{"Some risk"}

	valid, _ := resultenvelope.Validate(envelope)
	if !valid {
		t.Error("expected valid=true when risks is a list")
	}
}

func TestValidate_BlockedRequiresQuestionGate(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "blocked"

	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false when status:blocked has no question_gate")
	}
	if !containsSubstring(errs, "question_gate") {
		t.Errorf("expected an error mentioning question_gate, got %v", errs)
	}
}

func TestValidate_BlockedWithQuestionGateIsValid(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "blocked"
	envelope["question_gate"] = map[string]any{"reason": "r", "questions": []any{}}

	valid, errs := resultenvelope.Validate(envelope)
	if !valid {
		t.Errorf("expected valid=true, got errors=%v", errs)
	}
}

func TestValidate_BadBlockerTypeEnum(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "blocked"
	envelope["question_gate"] = map[string]any{"reason": "r", "questions": []any{}}
	envelope["blocker_type"] = "not-a-real-type"

	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for bad blocker_type enum")
	}
	if !containsSubstring(errs, "blocker_type") {
		t.Errorf("expected an error mentioning blocker_type, got %v", errs)
	}
}

func TestValidate_KnownBlockerTypeEnumValuesAreValid(t *testing.T) {
	for _, blockerType := range []string{
		"needs_user_decision",
		"design-mismatch",
		"spec-change-required",
		"workload-escalation",
	} {
		t.Run(blockerType, func(t *testing.T) {
			envelope := validEnvelope()
			envelope["status"] = "blocked"
			envelope["question_gate"] = map[string]any{"reason": "r", "questions": []any{}}
			envelope["blocker_type"] = blockerType

			valid, errs := resultenvelope.Validate(envelope)
			if !valid {
				t.Errorf("expected %q to be valid, got errors=%v", blockerType, errs)
			}
		})
	}
}

func TestValidate_InvalidAssumptionEntryMissingField(t *testing.T) {
	envelope := validEnvelope()
	envelope["assumptions"] = []any{
		map[string]any{
			"id":            "sdd-design-001",
			"phase":         "sdd-design",
			"statement":     "Use camelCase.",
			"reversibility": "high",
			// basis missing
		},
	}

	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for assumptions[] entry missing basis")
	}
	if !containsSubstring(errs, "assumptions") {
		t.Errorf("expected an error mentioning assumptions, got %v", errs)
	}
}

func TestValidate_InvalidAssumptionReversibilityEnum(t *testing.T) {
	envelope := validEnvelope()
	envelope["assumptions"] = []any{
		map[string]any{
			"id":            "sdd-design-001",
			"phase":         "sdd-design",
			"statement":     "Use camelCase.",
			"reversibility": "maybe",
			"basis":         "existing pattern",
		},
	}

	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for bad reversibility enum")
	}
	if !containsSubstring(errs, "reversibility") {
		t.Errorf("expected an error mentioning reversibility, got %v", errs)
	}
}

func TestValidate_WellFormedAssumptionEntryIsValid(t *testing.T) {
	envelope := validEnvelope()
	envelope["assumptions"] = []any{
		map[string]any{
			"id":            "sdd-design-001",
			"phase":         "sdd-design",
			"statement":     "Use camelCase.",
			"reversibility": "high",
			"basis":         "existing pattern",
		},
	}

	valid, errs := resultenvelope.Validate(envelope)
	if !valid {
		t.Errorf("expected valid=true, got errors=%v", errs)
	}
}

func TestValidate_NeverPanicsOnGarbageInput(t *testing.T) {
	valid, _ := resultenvelope.Validate(nil)
	if valid {
		t.Error("expected valid=false for nil input")
	}
}

// ── Deterministic error message parity (mirrored byte-for-byte from JS) ───────

func TestValidate_BadStatusEnumMessageListsValuesInDeclarationOrder(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "nope"

	_, errs := resultenvelope.Validate(envelope)
	want := "status must be one of: success, partial, blocked"
	if !containsSubstring(errs, want) {
		t.Errorf("expected a deterministic, declaration-ordered message %q; got: %v", want, errs)
	}
}

func TestValidate_BadReversibilityEnumMessageListsValuesInDeclarationOrder(t *testing.T) {
	envelope := validEnvelope()
	envelope["assumptions"] = []any{
		map[string]any{"id": "a-1", "phase": "sdd-apply", "statement": "x", "reversibility": "nope", "basis": "y"},
	}

	_, errs := resultenvelope.Validate(envelope)
	want := "assumptions[0].reversibility must be one of: low, high"
	if !containsSubstring(errs, want) {
		t.Errorf("expected a deterministic, declaration-ordered message %q; got: %v", want, errs)
	}
}

func TestValidate_BadBlockerTypeEnumMessageListsValuesInDeclarationOrder(t *testing.T) {
	envelope := validEnvelope()
	envelope["blocker_type"] = "nope"

	_, errs := resultenvelope.Validate(envelope)
	want := "blocker_type must be one of: needs_user_decision, design-mismatch, spec-change-required, workload-escalation"
	if !containsSubstring(errs, want) {
		t.Errorf("expected a deterministic, declaration-ordered message %q; got: %v", want, errs)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func containsSubstring(errs []string, substr string) bool {
	for _, e := range errs {
		if strings.Contains(e, substr) {
			return true
		}
	}
	return false
}
