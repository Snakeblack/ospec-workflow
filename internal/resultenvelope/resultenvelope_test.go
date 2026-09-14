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
		"schema_version":    1,
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
		"schema_version",
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

// ── Phase-aware sdd-spec ambiguity contract ─────────────────────────────────

func validSpecEnvelope() map[string]any {
	envelope := validEnvelope()
	envelope["residual_ambiguity"] = false
	envelope["public_contract_questions"] = []any{}
	envelope["conflicting_requirements"] = []any{}
	envelope["missing_acceptance_criteria"] = []any{}
	return envelope
}

func TestValidateForPhase_GenericCompatibility(t *testing.T) {
	if valid, errs := resultenvelope.Validate(validEnvelope()); !valid || len(errs) != 0 {
		t.Fatalf("generic Validate changed: valid=%v errors=%v", valid, errs)
	}
	if valid, errs := resultenvelope.ValidateForPhase(validEnvelope(), "sdd-design"); !valid || len(errs) != 0 {
		t.Fatalf("non-spec phase changed: valid=%v errors=%v", valid, errs)
	}
}

func TestValidateForPhase_SuccessfulSpecRequiresSignalsInCanonicalOrder(t *testing.T) {
	valid, errs := resultenvelope.ValidateForPhase(validEnvelope(), "sdd-spec")
	want := []string{
		"missing required field: residual_ambiguity",
		"missing required field: public_contract_questions",
		"missing required field: conflicting_requirements",
		"missing required field: missing_acceptance_criteria",
	}
	if valid || strings.Join(errs, "\n") != strings.Join(want, "\n") {
		t.Fatalf("valid=%v errors=%v want=%v", valid, errs, want)
	}
}

func TestValidateForPhase_ValidSuccessfulSpecSignalsPass(t *testing.T) {
	for _, envelope := range []map[string]any{validSpecEnvelope(), func() map[string]any {
		e := validSpecEnvelope()
		e["residual_ambiguity"] = true
		e["public_contract_questions"] = []any{"Public API?"}
		return e
	}()} {
		if valid, errs := resultenvelope.ValidateForPhase(envelope, "sdd-spec"); !valid || len(errs) != 0 {
			t.Fatalf("valid=%v errors=%v", valid, errs)
		}
	}
}

func TestValidateForPhase_SignalTypesAndElementsFailDeterministically(t *testing.T) {
	envelope := validSpecEnvelope()
	envelope["residual_ambiguity"] = "false"
	envelope["public_contract_questions"] = "none"
	envelope["conflicting_requirements"] = []any{"valid", float64(42)}
	envelope["missing_acceptance_criteria"] = []any{nil}

	valid, errs := resultenvelope.ValidateForPhase(envelope, "sdd-spec")
	want := []string{
		"residual_ambiguity must be a boolean",
		"public_contract_questions must be an array of strings",
		"conflicting_requirements[1] must be a string",
		"missing_acceptance_criteria[0] must be a string",
	}
	if valid || strings.Join(errs, "\n") != strings.Join(want, "\n") {
		t.Fatalf("valid=%v errors=%v want=%v", valid, errs, want)
	}
}

func TestValidateForPhase_PresentSignalsAreTypeCheckedGenerically(t *testing.T) {
	envelope := validEnvelope()
	envelope["public_contract_questions"] = []any{false}
	valid, errs := resultenvelope.ValidateForPhase(envelope, "sdd-design")
	want := []string{"public_contract_questions[0] must be a string"}
	if valid || strings.Join(errs, "\n") != strings.Join(want, "\n") {
		t.Fatalf("valid=%v errors=%v want=%v", valid, errs, want)
	}
}

func TestValidateForPhase_NonSuccessfulSpecDoesNotRequireSignals(t *testing.T) {
	partial := validEnvelope()
	partial["status"] = "partial"
	blocked := validEnvelope()
	blocked["status"] = "blocked"
	blocked["question_gate"] = map[string]any{"reason": "Need input", "questions": []any{}}

	for _, envelope := range []map[string]any{partial, blocked} {
		if valid, errs := resultenvelope.ValidateForPhase(envelope, "sdd-spec"); !valid || len(errs) != 0 {
			t.Fatalf("valid=%v errors=%v", valid, errs)
		}
	}
}

func TestValidate_SchemaVersionMustBeOne(t *testing.T) {
	envelope := validEnvelope()
	envelope["schema_version"] = 2
	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false when schema_version != 1")
	}
	if !containsSubstring(errs, "schema_version must be 1") {
		t.Errorf("expected error mentioning 'schema_version must be 1', got: %v", errs)
	}

	envelope["schema_version"] = "1"
	valid, errs = resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false when schema_version is string '1'")
	}
	if !containsSubstring(errs, "schema_version must be 1") {
		t.Errorf("expected error mentioning 'schema_version must be 1', got: %v", errs)
	}
}

func TestValidate_ArtifactsNonStringItems(t *testing.T) {
	envelope := validEnvelope()
	envelope["artifacts"] = []any{"path.md", 42}
	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false when artifacts has non-string items")
	}
	if !containsSubstring(errs, "artifacts[1] must be a string") {
		t.Errorf("expected error mentioning artifacts[1] must be a string, got: %v", errs)
	}
}

func TestValidate_RisksNonStringItems(t *testing.T) {
	envelope := validEnvelope()
	envelope["risks"] = []any{false}
	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false when risks has non-string items")
	}
	if !containsSubstring(errs, "risks[0] must be a string") {
		t.Errorf("expected error mentioning risks[0] must be a string, got: %v", errs)
	}
}

func TestValidate_BadSkillResolutionEnum(t *testing.T) {
	envelope := validEnvelope()
	envelope["skill_resolution"] = "custom"
	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for invalid skill_resolution")
	}
	want := "skill_resolution must be one of: injected, fallback-registry, fallback-path, none"
	if !containsSubstring(errs, want) {
		t.Errorf("expected %q, got: %v", want, errs)
	}
}

func TestValidate_ValidSkillResolutionEnumValues(t *testing.T) {
	for _, res := range []string{"injected", "fallback-registry", "fallback-path", "none"} {
		envelope := validEnvelope()
		envelope["skill_resolution"] = res
		valid, errs := resultenvelope.Validate(envelope)
		if !valid {
			t.Errorf("expected %q to be valid, got errors: %v", res, errs)
		}
	}
}

func TestValidate_BadVerifyOutcomeEnum(t *testing.T) {
	envelope := validEnvelope()
	envelope["verify_outcome"] = "UNKNOWN"
	valid, errs := resultenvelope.Validate(envelope)
	if valid {
		t.Error("expected valid=false for bad verify_outcome")
	}
	want := "verify_outcome must be one of: PASS, PASS WITH WARNINGS, FAIL"
	if !containsSubstring(errs, want) {
		t.Errorf("expected %q, got: %v", want, errs)
	}
}

func TestValidate_ValidVerifyOutcomeEnumValues(t *testing.T) {
	for _, outcome := range []string{"PASS", "PASS WITH WARNINGS", "FAIL"} {
		envelope := validEnvelope()
		envelope["verify_outcome"] = outcome
		valid, errs := resultenvelope.Validate(envelope)
		if !valid {
			t.Errorf("expected %q to be valid, got errors: %v", outcome, errs)
		}
	}
}

func TestValidate_MalformedQuestionGateStructure(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "blocked"
	envelope["question_gate"] = map[string]any{"questions": []any{}}
	valid, errs := resultenvelope.Validate(envelope)
	if valid || !containsSubstring(errs, "question_gate.reason must be a non-empty string") {
		t.Errorf("expected error for missing reason, got: %v", errs)
	}

	envelope["question_gate"] = map[string]any{"reason": "Need decision", "questions": "not-an-array"}
	valid, errs = resultenvelope.Validate(envelope)
	if valid || !containsSubstring(errs, "question_gate.questions must be an array") {
		t.Errorf("expected error for non-array questions, got: %v", errs)
	}

	envelope["question_gate"] = map[string]any{
		"reason": "Need decision",
		"questions": []any{
			map[string]any{"question": "What?", "options": []any{map[string]any{"label": "A"}}},
		},
	}
	valid, errs = resultenvelope.Validate(envelope)
	if valid || !containsSubstring(errs, "question_gate.questions[0].header must be a non-empty string") {
		t.Errorf("expected error for missing header, got: %v", errs)
	}

	envelope["question_gate"] = map[string]any{
		"reason": "Need decision",
		"questions": []any{
			map[string]any{"header": "Choice", "question": "What?"},
		},
	}
	valid, errs = resultenvelope.Validate(envelope)
	if valid || !containsSubstring(errs, "question_gate.questions[0].options must be an array") {
		t.Errorf("expected error for missing options, got: %v", errs)
	}

	envelope["question_gate"] = map[string]any{
		"reason": "Need decision",
		"questions": []any{
			map[string]any{
				"header":   "Choice",
				"question": "What?",
				"options":  []any{map[string]any{}},
			},
		},
	}
	valid, errs = resultenvelope.Validate(envelope)
	if valid || !containsSubstring(errs, "question_gate.questions[0].options[0].label must be a non-empty string") {
		t.Errorf("expected error for missing label, got: %v", errs)
	}
}

func TestValidate_WellFormedQuestionGate(t *testing.T) {
	envelope := validEnvelope()
	envelope["status"] = "blocked"
	envelope["question_gate"] = map[string]any{
		"reason": "Workload decision required",
		"questions": []any{
			map[string]any{
				"header":   "Strategy",
				"question": "Which strategy?",
				"options": []any{
					map[string]any{"label": "single-pr", "description": "All in one", "recommended": true},
					map[string]any{"label": "auto-chain"},
				},
			},
		},
	}
	valid, errs := resultenvelope.Validate(envelope)
	if !valid {
		t.Errorf("expected valid=true, got errors: %v", errs)
	}
}

// ── AdaptLegacyEnvelope ───────────────────────────────────────────────────────

func isOne(v any) bool {
	switch n := v.(type) {
	case int:
		return n == 1
	case int64:
		return n == 1
	case float64:
		return n == 1
	}
	return false
}

func TestAdaptLegacyEnvelope_ValidV1Object(t *testing.T) {
	env := validEnvelope()
	adapted, ok, errs := resultenvelope.AdaptLegacyEnvelope(env)
	if !ok {
		t.Fatalf("expected ok=true, got errs: %v", errs)
	}
	if !isOne(adapted["schema_version"]) {
		t.Errorf("expected schema_version=1, got: %v", adapted["schema_version"])
	}
	if adapted["executive_summary"] != "Did the thing." {
		t.Errorf("expected executive_summary, got: %v", adapted["executive_summary"])
	}
}

func TestAdaptLegacyEnvelope_UnversionedObjectWithSummary(t *testing.T) {
	legacy := map[string]any{
		"status":            "success",
		"summary":           "Legacy summary field",
		"artifacts":         []any{"openspec/changes/foo/design.md"},
		"next_recommended":  "sdd-tasks",
		"risks":             "None",
		"skill_resolution":  "injected",
		"key_decisions":     []any{"Decision 1"},
	}
	adapted, ok, errs := resultenvelope.AdaptLegacyEnvelope(legacy)
	if !ok {
		t.Fatalf("expected ok=true, got errs: %v", errs)
	}
	if !isOne(adapted["schema_version"]) {
		t.Errorf("expected schema_version=1, got: %v", adapted["schema_version"])
	}
	if adapted["executive_summary"] != "Legacy summary field" {
		t.Errorf("expected executive_summary, got: %v", adapted["executive_summary"])
	}
	if _, hasSummary := adapted["summary"]; hasSummary {
		t.Error("expected summary key to be removed")
	}
}

func TestAdaptLegacyEnvelope_UnversionedFenceInText(t *testing.T) {
	text := "Some prose here.\n```json:result-envelope\n{\"status\":\"success\",\"summary\":\"Completed work.\",\"artifacts\":[\"foo.md\"],\"next_recommended\":\"sdd-verify\",\"risks\":\"None\",\"skill_resolution\":\"injected\"}\n```"
	adapted, ok, errs := resultenvelope.AdaptLegacyEnvelope(text)
	if !ok {
		t.Fatalf("expected ok=true, got errs: %v", errs)
	}
	if !isOne(adapted["schema_version"]) {
		t.Errorf("expected schema_version=1, got: %v", adapted["schema_version"])
	}
	if adapted["executive_summary"] != "Completed work." {
		t.Errorf("expected executive_summary, got: %v", adapted["executive_summary"])
	}
}

func TestAdaptLegacyEnvelope_PlainProseLines(t *testing.T) {
	prose := "Here is the report:\n**Status**: success\n**Summary**: Proposal created for feature.\n**Artifacts**: `openspec/changes/feat/proposal.md`\n**Next**: sdd-spec\n**Risks**: None\n**Skill Resolution**: injected — 3 skills"
	adapted, ok, errs := resultenvelope.AdaptLegacyEnvelope(prose)
	if !ok {
		t.Fatalf("expected ok=true, got errs: %v", errs)
	}
	if !isOne(adapted["schema_version"]) {
		t.Errorf("expected schema_version=1, got: %v", adapted["schema_version"])
	}
	if adapted["status"] != "success" {
		t.Errorf("expected status=success, got: %v", adapted["status"])
	}
	if adapted["executive_summary"] != "Proposal created for feature." {
		t.Errorf("expected executive_summary, got: %v", adapted["executive_summary"])
	}
}

func TestAdaptLegacyEnvelope_MalformedInputFailsFailSafely(t *testing.T) {
	for _, input := range []any{
		"Just unstructured rambling without envelope",
		nil,
		42,
		"```json:result-envelope\n{ invalid json\n```",
	} {
		_, ok, _ := resultenvelope.AdaptLegacyEnvelope(input)
		if ok {
			t.Errorf("expected ok=false for input %v", input)
		}
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
