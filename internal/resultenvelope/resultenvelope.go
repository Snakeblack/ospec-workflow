// Package resultenvelope is a Go mirror of scripts/lib/result-envelope.js —
// the dependency-free validator/extractor for the strict `json:result-envelope`
// fence defined in skills/_shared/sdd-phase-common.md §D. See decisions/adr-003.md
// (strict-result-envelope change) for the parity rationale. Never panics — every
// exported function degrades to a safe, structured result on malformed input.
package resultenvelope

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// Enum values are declared as ordered slices (not just membership maps) so
// that "must be one of: ..." messages are byte-for-byte deterministic and
// match the exact declaration order of the JS Set literals in
// scripts/lib/result-envelope.js (Set iteration preserves insertion order; a
// Go map does not). See WARNING remediation, strict-result-envelope 4R gate.
var statusEnumOrder = []string{"success", "partial", "blocked"}
var reversibilityEnumOrder = []string{"low", "high"}
var blockerTypeEnumOrder = []string{
	"needs_user_decision",
	"design-mismatch",
	"spec-change-required",
	"workload-escalation",
}
var skillResolutionEnumOrder = []string{
	"injected",
	"fallback-registry",
	"fallback-path",
	"none",
}
var verifyOutcomeEnumOrder = []string{
	"PASS",
	"PASS WITH WARNINGS",
	"FAIL",
}

var statusEnum = toMembershipSet(statusEnumOrder)
var reversibilityEnum = toMembershipSet(reversibilityEnumOrder)
var blockerTypeEnum = toMembershipSet(blockerTypeEnumOrder)
var skillResolutionEnum = toMembershipSet(skillResolutionEnumOrder)
var verifyOutcomeEnum = toMembershipSet(verifyOutcomeEnumOrder)

func toMembershipSet(values []string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, v := range values {
		set[v] = true
	}
	return set
}

var requiredFields = []string{
	"schema_version",
	"status",
	"executive_summary",
	"artifacts",
	"next_recommended",
	"risks",
	"skill_resolution",
}

var assumptionRequiredFields = []string{"id", "phase", "statement", "reversibility", "basis"}
var specSignalFields = []string{
	"residual_ambiguity",
	"public_contract_questions",
	"conflicting_requirements",
	"missing_acceptance_criteria",
}
var specSignalArrayFields = specSignalFields[1:]

// fenceRe matches the strict json:result-envelope fence, mirroring
// scripts/lib/result-envelope.js's FENCE_RE.
var fenceRe = regexp.MustCompile("(?s)```json:result-envelope\r?\n(.*?)```")

var (
	statusPattern     = regexp.MustCompile(`(?i)\*\*Status\*\*:\s*([^\r\n]+)`)
	summaryPattern    = regexp.MustCompile(`(?i)\*\*Summary\*\*:\s*([^\r\n]+)`)
	artifactsPattern  = regexp.MustCompile(`(?i)\*\*Artifacts\*\*:\s*([^\r\n]+)`)
	nextPattern       = regexp.MustCompile(`(?i)\*\*Next(?:\s*Recommended)?\*\*:\s*([^\r\n]+)`)
	risksPattern      = regexp.MustCompile(`(?i)\*\*Risks\*\*:\s*([^\r\n]+)`)
	resolutionPattern = regexp.MustCompile(`(?i)\*\*Skill Resolution\*\*:\s*([^\r\n]+)`)
	backtickPattern   = regexp.MustCompile("`([^`]+)`")
	dashSplitPattern  = regexp.MustCompile(`\s*[-—]\s*`)
)

// Extract locates the strict json:result-envelope fenced block inside text and
// attempts to json.Unmarshal its content. Never panics.
//
//   - found=false            -> no fence present at all
//   - found=true, value=nil  -> fence present but its content is not valid JSON
//   - found=true, value={..} -> fence present and parsed successfully
func Extract(text string) (value map[string]any, found bool) {
	match := fenceRe.FindStringSubmatch(text)
	if match == nil {
		return nil, false
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(match[1]), &parsed); err != nil {
		return nil, true
	}

	return parsed, true
}

// isJSONFalsy mirrors JavaScript truthiness for JSON-decoded values: nil,
// false, 0 and "" are falsy; every other type (objects, arrays, non-empty
// scalars) is truthy. Keeps blocked-status error messages at byte parity with
// the JS validator. See gen2 review (question_gate falsy message divergence).
func isJSONFalsy(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case bool:
		return !t
	case float64:
		return t == 0
	case string:
		return t == ""
	}
	return false
}

// isECMAWhitespace reports whether r counts as whitespace under ECMA-262
// trim() / "\s" semantics — the class shared by the JS runtime validator and
// the schema "\\S" pattern. It differs from unicode.IsSpace in exactly two
// code points: U+0085 (NEL) is NOT ECMA whitespace, while U+FEFF (BOM) IS.
// See F-9cb30d71ec9aa7e5 (runtime parity remediation).
func isECMAWhitespace(r rune) bool {
	switch r {
	case '\u0085':
		return false
	case '\uFEFF':
		return true
	}
	return unicode.IsSpace(r)
}

func isNonEmptyString(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimFunc(s, isECMAWhitespace) != ""
}

func isArtifactsValid(v any) bool {
	if s, ok := v.(string); ok {
		return s == "inline"
	}
	_, isSlice := v.([]any)
	return isSlice
}

func isRisksValid(v any) bool {
	if isNonEmptyString(v) {
		return true
	}
	_, isSlice := v.([]any)
	return isSlice
}

func validateAssumptionEntry(entry any, index int, errs *[]string) {
	m, ok := entry.(map[string]any)
	if !ok {
		*errs = append(*errs, fmt.Sprintf("assumptions[%d] must be an object", index))
		return
	}

	for _, field := range assumptionRequiredFields {
		if !isNonEmptyString(m[field]) {
			*errs = append(*errs, fmt.Sprintf("assumptions[%d].%s must be a non-empty string", index, field))
		}
	}

	if rev, ok := m["reversibility"]; ok && isNonEmptyString(rev) && !reversibilityEnum[rev.(string)] {
		*errs = append(*errs, fmt.Sprintf(
			"assumptions[%d].reversibility must be one of: %s", index, strings.Join(reversibilityEnumOrder, ", "),
		))
	}
}

func validateStringArrayField(obj map[string]any, field string, errs *[]string) {
	v, ok := obj[field]
	if !ok {
		return
	}

	list, isSlice := v.([]any)
	if !isSlice {
		*errs = append(*errs, fmt.Sprintf("%s must be an array of strings", field))
		return
	}

	for i, item := range list {
		if _, isString := item.(string); !isString {
			*errs = append(*errs, fmt.Sprintf("%s[%d] must be a string", field, i))
		}
	}
}

func validateQuestionGate(questionGate any, errs *[]string) {
	qg, ok := questionGate.(map[string]any)
	if !ok {
		*errs = append(*errs, "question_gate must be an object")
		return
	}

	if !isNonEmptyString(qg["reason"]) {
		*errs = append(*errs, "question_gate.reason must be a non-empty string")
	}

	questions, ok := qg["questions"].([]any)
	if !ok {
		*errs = append(*errs, "question_gate.questions must be an array")
		return
	}

	for i, qItem := range questions {
		q, ok := qItem.(map[string]any)
		if !ok {
			*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d] must be an object", i))
			continue
		}

		if !isNonEmptyString(q["header"]) {
			*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].header must be a non-empty string", i))
		}

		if !isNonEmptyString(q["question"]) {
			*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].question must be a non-empty string", i))
		}

		options, ok := q["options"].([]any)
		if !ok {
			*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].options must be an array", i))
			continue
		}

		for j, optItem := range options {
			opt, ok := optItem.(map[string]any)
			if !ok {
				*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].options[%d] must be an object", i, j))
				continue
			}

			if !isNonEmptyString(opt["label"]) {
				*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].options[%d].label must be a non-empty string", i, j))
			}

			if desc, ok := opt["description"]; ok {
				if _, isString := desc.(string); !isString {
					*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].options[%d].description must be a string", i, j))
				}
			}

			if rec, ok := opt["recommended"]; ok {
				if _, isBool := rec.(bool); !isBool {
					*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].options[%d].recommended must be a boolean", i, j))
				}
			}
		}

		if ms, ok := q["multiSelect"]; ok {
			if _, isBool := ms.(bool); !isBool {
				*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].multiSelect must be a boolean", i))
			}
		}

		if ff, ok := q["allowFreeformInput"]; ok {
			if _, isBool := ff.(bool); !isBool {
				*errs = append(*errs, fmt.Sprintf("question_gate.questions[%d].allowFreeformInput must be a boolean", i))
			}
		}
	}
}

// Validate validates a parsed envelope object against the canonical §D schema.
// Never panics.
func Validate(obj map[string]any) (valid bool, errs []string) {
	return ValidateForPhase(obj, "")
}

// ValidateForPhase validates a parsed envelope with phase-specific requirements.
// Successful sdd-spec envelopes require all ambiguity signals; all other
// phases and statuses retain the generic Validate contract. Never panics.
func ValidateForPhase(obj map[string]any, phase string) (valid bool, errs []string) {
	if obj == nil {
		return false, []string{"envelope must be a JSON object"}
	}

	errs = []string{}

	for _, field := range requiredFields {
		if _, ok := obj[field]; !ok {
			errs = append(errs, fmt.Sprintf("missing required field: %s", field))
		}
	}

	if status, _ := obj["status"].(string); phase == "sdd-spec" && status == "success" {
		for _, field := range specSignalFields {
			if _, ok := obj[field]; !ok {
				errs = append(errs, fmt.Sprintf("missing required field: %s", field))
			}
		}
	}

	if v, ok := obj["schema_version"]; ok {
		switch n := v.(type) {
		case int:
			if n != 1 {
				errs = append(errs, "schema_version must be 1")
			}
		case int64:
			if n != 1 {
				errs = append(errs, "schema_version must be 1")
			}
		case float64:
			if n != 1 {
				errs = append(errs, "schema_version must be 1")
			}
		default:
			errs = append(errs, "schema_version must be 1")
		}
	}

	if status, ok := obj["status"]; ok {
		s, isString := status.(string)
		if !isString || !statusEnum[s] {
			errs = append(errs, fmt.Sprintf("status must be one of: %s", strings.Join(statusEnumOrder, ", ")))
		}
	}

	if v, ok := obj["executive_summary"]; ok && !isNonEmptyString(v) {
		errs = append(errs, "executive_summary must be a non-empty string")
	}

	if v, ok := obj["detailed_report"]; ok {
		if _, isString := v.(string); !isString {
			errs = append(errs, "detailed_report must be a string")
		}
	}

	if v, ok := obj["artifacts"]; ok {
		if !isArtifactsValid(v) {
			errs = append(errs, `artifacts must be an array of paths or the literal string "inline"`)
		} else if list, isSlice := v.([]any); isSlice {
			for i, item := range list {
				if _, isString := item.(string); !isString {
					errs = append(errs, fmt.Sprintf("artifacts[%d] must be a string", i))
				}
			}
		}
	}

	if v, ok := obj["next_recommended"]; ok && !isNonEmptyString(v) {
		errs = append(errs, "next_recommended must be a non-empty string")
	}

	if v, ok := obj["risks"]; ok {
		if !isRisksValid(v) {
			errs = append(errs, "risks must be a non-empty string or an array")
		} else if list, isSlice := v.([]any); isSlice {
			for i, item := range list {
				if _, isString := item.(string); !isString {
					errs = append(errs, fmt.Sprintf("risks[%d] must be a string", i))
				}
			}
		}
	}

	if v, ok := obj["skill_resolution"]; ok {
		s, isString := v.(string)
		if !isString || !skillResolutionEnum[s] {
			errs = append(errs, fmt.Sprintf("skill_resolution must be one of: %s", strings.Join(skillResolutionEnumOrder, ", ")))
		}
	}

	if v, ok := obj["verify_outcome"]; ok {
		s, isString := v.(string)
		if !isString || !verifyOutcomeEnum[s] {
			errs = append(errs, fmt.Sprintf("verify_outcome must be one of: %s", strings.Join(verifyOutcomeEnumOrder, ", ")))
		}
	}

	if v, ok := obj["key_decisions"]; ok {
		list, isSlice := v.([]any)
		if !isSlice {
			errs = append(errs, "key_decisions must be an array")
		} else {
			if len(list) > 3 {
				errs = append(errs, "key_decisions must contain at most 3 entries")
			}
			for i, item := range list {
				if !isNonEmptyString(item) {
					errs = append(errs, fmt.Sprintf("key_decisions[%d] must be a non-empty string", i))
				}
			}
		}
	}

	if v, ok := obj["blocker_type"]; ok {
		s, isString := v.(string)
		if !isString || !blockerTypeEnum[s] {
			errs = append(errs, fmt.Sprintf("blocker_type must be one of: %s", strings.Join(blockerTypeEnumOrder, ", ")))
		}
	}

	if status, _ := obj["status"].(string); status == "blocked" {
		if isJSONFalsy(obj["question_gate"]) {
			errs = append(errs, "question_gate is required when status is blocked")
		} else {
			validateQuestionGate(obj["question_gate"], &errs)
		}
	} else if _, ok := obj["question_gate"]; ok {
		// An explicit question_gate key — including a JSON null value — is
		// validated structurally, mirroring the JS hasOwnProperty branch.
		// See F-56ac2a291e91c857 (trust parity remediation).
		validateQuestionGate(obj["question_gate"], &errs)
	}

	if v, ok := obj["assumptions"]; ok {
		list, isSlice := v.([]any)
		if !isSlice {
			errs = append(errs, "assumptions must be an array")
		} else {
			for i, entry := range list {
				validateAssumptionEntry(entry, i, &errs)
			}
		}
	}

	if v, ok := obj["residual_ambiguity"]; ok {
		if _, isBool := v.(bool); !isBool {
			errs = append(errs, "residual_ambiguity must be a boolean")
		}
	}

	for _, field := range specSignalArrayFields {
		validateStringArrayField(obj, field, &errs)
	}

	return len(errs) == 0, errs
}

// AdaptLegacyEnvelope normalizes unversioned JSON fences, legacy field names,
// or prose envelopes into a canonical result-envelope/v1 payload. Never panics.
func AdaptLegacyEnvelope(rawInput any) (map[string]any, bool, []string) {
	if rawInput == nil {
		return nil, false, []string{"input must be a non-empty string or envelope object"}
	}

	var candidate map[string]any

	switch v := rawInput.(type) {
	case map[string]any:
		candidate = make(map[string]any, len(v))
		for k, val := range v {
			candidate[k] = val
		}
	case string:
		if strings.TrimSpace(v) == "" {
			return nil, false, []string{"input must be a non-empty string or envelope object"}
		}
		extracted, found := Extract(v)
		if found && extracted != nil {
			candidate = extracted
		} else {
			statusMatch := statusPattern.FindStringSubmatch(v)
			summaryMatch := summaryPattern.FindStringSubmatch(v)

			if len(statusMatch) > 1 && len(summaryMatch) > 1 {
				rawStatus := strings.ToLower(strings.TrimSpace(statusMatch[1]))
				rawSummary := strings.TrimSpace(summaryMatch[1])

				var artifacts any = "inline"
				artMatch := artifactsPattern.FindStringSubmatch(v)
				if len(artMatch) > 1 {
					artRaw := strings.TrimSpace(artMatch[1])
					if strings.HasPrefix(strings.ToLower(artRaw), "inline") {
						artifacts = "inline"
					} else {
						var paths []any
						btMatches := backtickPattern.FindAllStringSubmatch(artRaw, -1)
						for _, m := range btMatches {
							p := strings.TrimSpace(m[1])
							if p != "" && p != "inline" {
								paths = append(paths, p)
							}
						}
						if len(paths) > 0 {
							artifacts = paths
						} else {
							part := strings.TrimSpace(strings.Split(artRaw, "|")[0])
							artifacts = []any{part}
						}
					}
				}

				nextRecommended := "none"
				if nMatch := nextPattern.FindStringSubmatch(v); len(nMatch) > 1 {
					nextRecommended = strings.TrimSpace(nMatch[1])
				}

				risks := "None"
				if rMatch := risksPattern.FindStringSubmatch(v); len(rMatch) > 1 {
					risks = strings.TrimSpace(rMatch[1])
				}

				skillResolution := "injected"
				if resMatch := resolutionPattern.FindStringSubmatch(v); len(resMatch) > 1 {
					resRaw := strings.TrimSpace(resMatch[1])
					splitParts := dashSplitPattern.Split(resRaw, -1)
					cleanRes := strings.ToLower(strings.TrimSpace(splitParts[0]))
					if skillResolutionEnum[cleanRes] {
						skillResolution = cleanRes
					}
				}

				candidate = map[string]any{
					"schema_version":    1,
					"status":            rawStatus,
					"executive_summary": rawSummary,
					"artifacts":         artifacts,
					"next_recommended":  nextRecommended,
					"risks":             risks,
					"skill_resolution":  skillResolution,
				}
			}
		}
	default:
		return nil, false, []string{"input must be a non-empty string or envelope object"}
	}

	if candidate == nil {
		return nil, false, []string{"unable to extract or parse result envelope"}
	}

	if v, hasVer := candidate["schema_version"]; !hasVer {
		candidate["schema_version"] = 1
	} else if n, ok := v.(float64); ok && n == 1 {
		candidate["schema_version"] = 1
	}

	if _, hasExec := candidate["executive_summary"]; !hasExec {
		if s, ok := candidate["summary"]; ok {
			candidate["executive_summary"] = s
		}
	}
	delete(candidate, "summary")

	if kd, ok := candidate["key_decisions"].([]any); ok {
		var filtered []any
		for _, item := range kd {
			if s, isStr := item.(string); isStr && strings.TrimSpace(s) != "" {
				filtered = append(filtered, s)
				if len(filtered) == 3 {
					break
				}
			}
		}
		candidate["key_decisions"] = filtered
	}

	valid, errs := Validate(candidate)
	if !valid {
		return nil, false, errs
	}

	return candidate, true, nil
}
