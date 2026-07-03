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
)

var statusEnum = map[string]bool{
	"success": true,
	"partial": true,
	"blocked": true,
}

var reversibilityEnum = map[string]bool{
	"low":  true,
	"high": true,
}

var blockerTypeEnum = map[string]bool{
	"needs_user_decision":  true,
	"design-mismatch":      true,
	"spec-change-required": true,
	"workload-escalation":  true,
}

var requiredFields = []string{
	"status",
	"executive_summary",
	"artifacts",
	"next_recommended",
	"risks",
	"skill_resolution",
}

var assumptionRequiredFields = []string{"id", "phase", "statement", "reversibility", "basis"}

// fenceRe matches the strict json:result-envelope fence, mirroring
// scripts/lib/result-envelope.js's FENCE_RE.
var fenceRe = regexp.MustCompile("(?s)```json:result-envelope\r?\n(.*?)```")

func sortedKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func joinKeys(m map[string]bool) string {
	return strings.Join(sortedKeys(m), ", ")
}

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

func isNonEmptyString(v any) bool {
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) != ""
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
			"assumptions[%d].reversibility must be one of: %s", index, joinKeys(reversibilityEnum),
		))
	}
}

// Validate validates a parsed envelope object against the canonical §D schema.
// Never panics.
func Validate(obj map[string]any) (valid bool, errs []string) {
	if obj == nil {
		return false, []string{"envelope must be a JSON object"}
	}

	errs = []string{}

	for _, field := range requiredFields {
		if _, ok := obj[field]; !ok {
			errs = append(errs, fmt.Sprintf("missing required field: %s", field))
		}
	}

	if status, ok := obj["status"]; ok {
		s, isString := status.(string)
		if !isString || !statusEnum[s] {
			errs = append(errs, fmt.Sprintf("status must be one of: %s", joinKeys(statusEnum)))
		}
	}

	if v, ok := obj["executive_summary"]; ok && !isNonEmptyString(v) {
		errs = append(errs, "executive_summary must be a non-empty string")
	}

	if v, ok := obj["artifacts"]; ok && !isArtifactsValid(v) {
		errs = append(errs, `artifacts must be an array of paths or the literal string "inline"`)
	}

	if v, ok := obj["next_recommended"]; ok && !isNonEmptyString(v) {
		errs = append(errs, "next_recommended must be a non-empty string")
	}

	if v, ok := obj["risks"]; ok && !isRisksValid(v) {
		errs = append(errs, "risks must be a non-empty string or an array")
	}

	if v, ok := obj["skill_resolution"]; ok && !isNonEmptyString(v) {
		errs = append(errs, "skill_resolution must be a non-empty string")
	}

	if v, ok := obj["blocker_type"]; ok {
		s, isString := v.(string)
		if !isString || !blockerTypeEnum[s] {
			errs = append(errs, fmt.Sprintf("blocker_type must be one of: %s", joinKeys(blockerTypeEnum)))
		}
	}

	if status, _ := obj["status"].(string); status == "blocked" {
		if obj["question_gate"] == nil {
			errs = append(errs, "question_gate is required when status is blocked")
		}
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

	return len(errs) == 0, errs
}
