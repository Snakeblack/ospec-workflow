package hooks

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/snakeblack/ospec-workflow/internal/store"
)

// PhaseCompletionResult reports the outcome of a locked state projection.
type PhaseCompletionResult struct {
	OK      bool
	Outcome string
	Code    string
	Error   string
}

type phaseProjectionState struct {
	Status          string
	Summary         string
	KeyDecisions    []string
	BlockerType     string
	Verdict         string
	LastPayloadHash string
	Artifacts       any
}

type phaseCompletionState struct {
	Status            string
	Revision          int
	LastUpdated       string
	BlockingQuestions []string
	Phases            map[string]phaseProjectionState
}

// ProjectPhaseCompletion applies a validated result-envelope/v1 under the
// state file's advisory lock. expectedRevision is optional; a non-nil value
// provides compare-and-swap protection for callers that already observed a
// revision. The function never writes on a conflict or replay.
func ProjectPhaseCompletion(statePath, phase string, envelope map[string]any, expectedRevision *int) PhaseCompletionResult {
	if strings.TrimSpace(statePath) == "" {
		return PhaseCompletionResult{Outcome: "error", Error: "statePath is required"}
	}
	if strings.TrimSpace(phase) == "" {
		return PhaseCompletionResult{Outcome: "error", Error: "phase is required"}
	}

	result := PhaseCompletionResult{Outcome: "error"}
	err := store.WithLock(statePath, func() error {
		if err := recoverOrphanBak(statePath); err != nil {
			result = PhaseCompletionResult{Outcome: "recovery-failed", Error: err.Error()}
			return nil
		}
		content, err := os.ReadFile(statePath)
		if err != nil {
			result = PhaseCompletionResult{Outcome: "read-failed", Error: err.Error()}
			return nil
		}
		current, err := parsePhaseCompletionState(string(content))
		if err != nil {
			result = PhaseCompletionResult{Outcome: "malformed-state", Code: "malformed_state", Error: err.Error()}
			return nil
		}
		next, outcome, code, reduceErr := reducePhaseCompletion(current, phase, envelope, expectedRevision, time.Now().UTC().Format(time.RFC3339Nano))
		if reduceErr != nil {
			result = PhaseCompletionResult{Outcome: outcome, Code: code, Error: reduceErr.Error()}
			return nil
		}
		if outcome == "noop-replay" {
			result = PhaseCompletionResult{OK: true, Outcome: outcome}
			return nil
		}
		if err := atomicWriteFile(statePath, applyPhaseCompletionProjection(string(content), next, phase)); err != nil {
			result = PhaseCompletionResult{Outcome: "write-failed", Error: err.Error()}
			return nil
		}
		result = PhaseCompletionResult{OK: true, Outcome: outcome}
		return nil
	})
	if err != nil {
		return PhaseCompletionResult{Outcome: "lock-failed", Error: err.Error()}
	}
	return result
}

// recoverOrphanBak restores statePath from a surviving backup when an interrupted
// atomic replacement left the primary file absent. It runs while the state lock
// is held, so recovery and the following read form one transition boundary.
func recoverOrphanBak(statePath string) error {
	if _, err := os.Stat(statePath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat state file: %w", err)
	}
	backupPath := statePath + ".bak"
	if _, err := os.Stat(backupPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat state backup: %w", err)
	}
	if err := os.Rename(backupPath, statePath); err != nil {
		return fmt.Errorf("restore orphaned state backup: %w", err)
	}
	return nil
}

// canonicalReplayJSON produces the shared Node/Go JSON representation used at
// the replay boundary. Object keys are ordered recursively and strings retain
// non-ASCII characters rather than applying Go's HTML escaping.
func canonicalReplayJSON(value any) (string, error) {
	var builder strings.Builder
	if err := writeCanonicalReplayJSON(&builder, value); err != nil {
		return "", err
	}
	return builder.String(), nil
}

func writeCanonicalReplayJSON(builder *strings.Builder, value any) error {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		if typed {
			builder.WriteString("true")
		} else {
			builder.WriteString("false")
		}
	case string:
		writeCanonicalJSONString(builder, typed)
	case float64:
		encoded, err := canonicalJSONNumber(typed)
		if err != nil {
			return err
		}
		builder.WriteString(encoded)
	case float32:
		encoded, err := canonicalJSONNumber(float64(typed))
		if err != nil {
			return err
		}
		builder.WriteString(encoded)
	case int:
		builder.WriteString(strconv.Itoa(typed))
	case int64:
		builder.WriteString(strconv.FormatInt(typed, 10))
	case uint:
		builder.WriteString(strconv.FormatUint(uint64(typed), 10))
	case uint64:
		builder.WriteString(strconv.FormatUint(typed, 10))
	case []any:
		builder.WriteByte('[')
		for index, item := range typed {
			if index > 0 {
				builder.WriteByte(',')
			}
			if err := writeCanonicalReplayJSON(builder, item); err != nil {
				return err
			}
		}
		builder.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i, j int) bool {
			return compareUTF16Lexical(keys[i], keys[j]) < 0
		})
		builder.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				builder.WriteByte(',')
			}
			writeCanonicalJSONString(builder, key)
			builder.WriteByte(':')
			if err := writeCanonicalReplayJSON(builder, typed[key]); err != nil {
				return err
			}
		}
		builder.WriteByte('}')
	default:
		return fmt.Errorf("unsupported replay JSON value %T", value)
	}
	return nil
}

// compareUTF16Lexical mirrors JavaScript's default Array#sort comparison,
// which compares strings by UTF-16 code units rather than Unicode code points
// or UTF-8 bytes.
func compareUTF16Lexical(left, right string) int {
	leftUnits := utf16.Encode([]rune(left))
	rightUnits := utf16.Encode([]rune(right))
	limit := len(leftUnits)
	if len(rightUnits) < limit {
		limit = len(rightUnits)
	}
	for i := 0; i < limit; i++ {
		if leftUnits[i] < rightUnits[i] {
			return -1
		}
		if leftUnits[i] > rightUnits[i] {
			return 1
		}
	}
	switch {
	case len(leftUnits) < len(rightUnits):
		return -1
	case len(leftUnits) > len(rightUnits):
		return 1
	default:
		return 0
	}
}

func canonicalJSONNumber(value float64) (string, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return "", fmt.Errorf("non-finite replay number")
	}
	if value == 0 {
		return "0", nil
	}
	magnitude := math.Abs(value)
	if magnitude >= 1e-6 && magnitude < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64), nil
	}
	parts := strings.Split(strconv.FormatFloat(value, 'e', -1, 64), "e")
	exponent, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", fmt.Errorf("format replay number: %w", err)
	}
	return parts[0] + fmt.Sprintf("e%+d", exponent), nil
}

func writeCanonicalJSONString(builder *strings.Builder, value string) {
	builder.WriteByte('"')
	for _, runeValue := range value {
		switch runeValue {
		case '"':
			builder.WriteString(`\"`)
		case '\\':
			builder.WriteString(`\\`)
		case '\b':
			builder.WriteString(`\b`)
		case '\f':
			builder.WriteString(`\f`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			if runeValue < 0x20 {
				fmt.Fprintf(builder, `\u%04x`, runeValue)
			} else {
				builder.WriteRune(runeValue)
			}
		}
	}
	builder.WriteByte('"')
}

// legacyV267ResultEnvelopeKeyOrder freezes the Node v2.67.0–v2.67.3 insertion
// order used by JSON.stringify for golden result-envelope fixtures. Remaining
// keys append in UTF-16 lexical order. Known nested shapes use a frozen order.
// Legacy noop is promised ONLY for this frozen order (schema_version first).
// A semantically equal envelope whose top-level insertion order starts with
// status produces a different digest and is not a promised legacy noop.
// Original JSON bytes are not preserved or required.
var legacyV267ResultEnvelopeKeyOrder = []string{
	"schema_version",
	"status",
	"executive_summary",
	"detailed_report",
	"artifacts",
	"next_recommended",
	"risks",
	"skill_resolution",
	"key_decisions",
	"assumptions",
	"verify_outcome",
	"blocker_type",
	"question_gate",
	"residual_ambiguity",
	"public_contract_questions",
	"conflicting_requirements",
	"missing_acceptance_criteria",
}

// Nested maps freeze JSON.stringify order for the v2.67 question_gate shape. Unknown maps stay UTF-16.
var legacyV267QuestionGateKeyOrder = []string{"reason", "questions"}
var legacyV267QuestionKeyOrder = []string{"header", "question", "options", "multiSelect", "allowFreeformInput"}
var legacyV267OptionKeyOrder = []string{"label", "description", "recommended"}

func legacyV267InferPreferred(m map[string]any) []string {
	if _, ok := m["schema_version"]; ok {
		return legacyV267ResultEnvelopeKeyOrder
	}
	if _, ok := m["status"]; ok {
		return legacyV267ResultEnvelopeKeyOrder
	}
	if _, ok := m["header"]; ok {
		return legacyV267QuestionKeyOrder
	}
	if _, ok := m["question"]; ok {
		return legacyV267QuestionKeyOrder
	}
	if _, ok := m["label"]; ok {
		return legacyV267OptionKeyOrder
	}
	if _, ok := m["reason"]; ok {
		return legacyV267QuestionGateKeyOrder
	}
	if _, ok := m["questions"]; ok {
		return legacyV267QuestionGateKeyOrder
	}
	return nil
}

func legacyV267OrderedKeys(m map[string]any, preferred []string) []string {
	seen := make(map[string]struct{}, len(m))
	keys := make([]string, 0, len(m))
	for _, key := range preferred {
		if _, ok := m[key]; ok {
			keys = append(keys, key)
			seen[key] = struct{}{}
		}
	}
	rest := make([]string, 0, len(m)-len(seen))
	for key := range m {
		if _, ok := seen[key]; !ok {
			rest = append(rest, key)
		}
	}
	sort.Slice(rest, func(i, j int) bool {
		return compareUTF16Lexical(rest[i], rest[j]) < 0
	})
	return append(keys, rest...)
}

func writeLegacyV267ReplayJSON(builder *strings.Builder, value any, preferredKeys []string) error {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		if typed {
			builder.WriteString("true")
		} else {
			builder.WriteString("false")
		}
	case string:
		writeCanonicalJSONString(builder, typed)
	case float64:
		encoded, err := canonicalJSONNumber(typed)
		if err != nil {
			return err
		}
		builder.WriteString(encoded)
	case float32:
		encoded, err := canonicalJSONNumber(float64(typed))
		if err != nil {
			return err
		}
		builder.WriteString(encoded)
	case int:
		builder.WriteString(strconv.Itoa(typed))
	case int64:
		builder.WriteString(strconv.FormatInt(typed, 10))
	case json.Number:
		builder.WriteString(typed.String())
	case []any:
		builder.WriteByte('[')
		for index, item := range typed {
			if index > 0 {
				builder.WriteByte(',')
			}
			if err := writeLegacyV267ReplayJSON(builder, item, nil); err != nil {
				return err
			}
		}
		builder.WriteByte(']')
	case map[string]any:
		preferred := preferredKeys
		if preferred == nil {
			preferred = legacyV267InferPreferred(typed)
		}
		keys := legacyV267OrderedKeys(typed, preferred)
		builder.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				builder.WriteByte(',')
			}
			writeCanonicalJSONString(builder, key)
			builder.WriteByte(':')
			if err := writeLegacyV267ReplayJSON(builder, typed[key], nil); err != nil {
				return err
			}
		}
		builder.WriteByte('}')
	default:
		return fmt.Errorf("unsupported legacy replay JSON value %T", value)
	}
	return nil
}

func legacyV267PayloadHash(envelope map[string]any) (string, error) {
	var builder strings.Builder
	if err := writeLegacyV267ReplayJSON(&builder, envelope, legacyV267ResultEnvelopeKeyOrder); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(builder.String()))), nil
}

func isReplayHashMatch(storedHash string, envelope map[string]any, canonicalHash string) (bool, error) {
	if storedHash == "" {
		return false, nil
	}
	if storedHash == canonicalHash {
		return true, nil
	}
	legacyHash, err := legacyV267PayloadHash(envelope)
	if err != nil {
		return false, err
	}
	return storedHash == legacyHash, nil
}

func reducePhaseCompletion(current phaseCompletionState, phase string, envelope map[string]any, expectedRevision *int, now string) (phaseCompletionState, string, string, error) {
	payload, err := canonicalReplayJSON(envelope)
	if err != nil {
		return current, "blocked", "invalid_envelope", fmt.Errorf("canonicalize envelope: %w", err)
	}
	payloadHash := fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
	entry := current.Phases[phase]
	matched, matchErr := isReplayHashMatch(entry.LastPayloadHash, envelope, payloadHash)
	if matchErr != nil {
		return current, "blocked", "invalid_envelope", matchErr
	}
	if matched {
		return current, "noop-replay", "", nil
	}
	if expectedRevision != nil && current.Revision != *expectedRevision {
		return current, "cas-conflict", "cas_conflict", fmt.Errorf("CAS revision conflict: expected %d, head is %d", *expectedRevision, current.Revision)
	}

	next := current
	next.Phases = make(map[string]phaseProjectionState, len(current.Phases)+1)
	for key, value := range current.Phases {
		next.Phases[key] = value
	}
	next.Revision++
	next.LastUpdated = now
	entry.LastPayloadHash = payloadHash

	status, _ := envelope["status"].(string)
	summary, _ := envelope["executive_summary"].(string)
	summary = truncateRunes(summary, 160)
	if status == "blocked" {
		next.Status = "blocked"
		next.BlockingQuestions = blockingQuestions(envelope, summary)
		entry.Summary = summary
		if blocker, ok := envelope["blocker_type"].(string); ok {
			entry.BlockerType = blocker
		}
		next.Phases[phase] = entry
		return next, "blocked", "", nil
	}

	isPartial := status == "partial"
	if isPartial {
		entry.Status = "partial"
	} else {
		entry.Status = "done"
	}
	entry.Summary = summary
	entry.Artifacts = envelope["artifacts"]
	if decisions, ok := envelope["key_decisions"].([]any); ok && len(decisions) > 0 {
		entry.KeyDecisions = stringItems(decisions, 3)
	}
	if phase == "verify" {
		if verdict, ok := envelope["verify_outcome"].(string); ok {
			entry.Verdict = verdict
		}
	}
	next.BlockingQuestions = []string{}
	next.Phases[phase] = entry

	switch phase {
	case "proposal", "spec", "design":
		if next.Status == "" || next.Status == "blocked" {
			next.Status = "planning"
		}
	case "tasks":
		next.Status = "ready-for-apply"
	case "apply":
		if isPartial {
			next.Status = "applying"
		} else {
			next.Status = "ready-for-verify"
		}
	case "verify":
		if !positiveVerifyOutcome(envelope) {
			next.Status = "blocked"
			if summary != "" {
				next.BlockingQuestions = []string{summary}
			} else if verdict, ok := envelope["verify_outcome"].(string); ok {
				next.BlockingQuestions = []string{"Verification verdict: " + verdict}
			} else {
				next.BlockingQuestions = []string{"Verification verdict FAIL, omitted, or invalid"}
			}
			return next, "blocked", "verification_failed", nil
		}
		next.Status = "verified"
	case "archive":
		next.Status = "archived"
	}
	return next, "advanced", "", nil
}

func positiveVerifyOutcome(envelope map[string]any) bool {
	value, _ := envelope["verify_outcome"].(string)
	value = strings.ToUpper(strings.TrimSpace(value))
	return value == "PASS" || value == "PASS WITH WARNINGS"
}

func stringItems(items []any, limit int) []string {
	values := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok {
			values = append(values, value)
			if len(values) == limit {
				break
			}
		}
	}
	return values
}

func blockingQuestions(envelope map[string]any, summary string) []string {
	gate, _ := envelope["question_gate"].(map[string]any)
	if questions, ok := gate["questions"].([]any); ok && len(questions) > 0 {
		values := make([]string, 0, len(questions))
		for _, item := range questions {
			if question, ok := item.(string); ok {
				values = append(values, question)
				continue
			}
			if object, ok := item.(map[string]any); ok {
				if question, ok := object["question"].(string); ok && question != "" {
					values = append(values, question)
					continue
				}
				if header, ok := object["header"].(string); ok && header != "" {
					values = append(values, header)
					continue
				}
			}
			encoded, _ := json.Marshal(item)
			values = append(values, string(encoded))
		}
		return values
	}
	if reason, ok := gate["reason"].(string); ok && reason != "" {
		return []string{reason}
	}
	if summary != "" {
		return []string{summary}
	}
	return []string{"Blocked without reason specified"}
}

func parsePhaseCompletionState(content string) (phaseCompletionState, error) {
	state := phaseCompletionState{Phases: map[string]phaseProjectionState{}, BlockingQuestions: []string{}}
	if err := validatePhaseCompletionYAML(content); err != nil {
		return state, err
	}
	section, phase := "", ""
	seenChange, seenStatus, seenPhases := false, false, false
	for lineNumber, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if strings.Contains(line, "\t") {
			return state, fmt.Errorf("state YAML line %d contains a tab", lineNumber+1)
		}
		indent := lineIndentation(line)
		if indent == 0 {
			section, phase = "", ""
			key, value, ok := yamlKeyValue(trimmed)
			if !ok || key == "" {
				return state, fmt.Errorf("state YAML line %d is not a top-level mapping", lineNumber+1)
			}
			switch key {
			case "change":
				seenChange = yamlScalar(value) != ""
			case "status":
				state.Status = yamlScalar(value)
				seenStatus = state.Status != ""
			case "revision":
				revision, err := strconv.Atoi(yamlScalar(value))
				if err != nil || revision < 0 {
					return state, fmt.Errorf("state YAML line %d has an invalid revision", lineNumber+1)
				}
				state.Revision = revision
			case "phases":
				if yamlScalar(value) != "" {
					return state, fmt.Errorf("state YAML line %d has a non-mapping phases value", lineNumber+1)
				}
				section, seenPhases = key, true
			case "blocking_questions":
				section = key
			}
			continue
		}
		if section == "phases" && indent == 2 && strings.HasSuffix(trimmed, ":") {
			phase = strings.TrimSuffix(trimmed, ":")
			if phase == "" {
				return state, fmt.Errorf("state YAML line %d has an empty phase key", lineNumber+1)
			}
			state.Phases[phase] = phaseProjectionState{}
			continue
		}
		if section == "phases" && phase != "" && indent == 4 {
			key, value, ok := yamlKeyValue(trimmed)
			if !ok || key == "" {
				return state, fmt.Errorf("state YAML line %d is not a phase mapping", lineNumber+1)
			}
			entry := state.Phases[phase]
			switch key {
			case "status":
				entry.Status = yamlScalar(value)
			case "summary":
				entry.Summary = yamlScalar(value)
			case "last_payload_hash":
				entry.LastPayloadHash = yamlScalar(value)
			case "blocker_type":
				entry.BlockerType = yamlScalar(value)
			}
			state.Phases[phase] = entry
		}
	}
	if !seenChange || !seenStatus || !seenPhases {
		return state, fmt.Errorf("state YAML is missing required change, status, or phases fields")
	}
	return state, nil
}

func applyPhaseCompletionProjection(content string, state phaseCompletionState, phase string) string {
	eol := "\n"
	if strings.Contains(content, "\r\n") {
		eol = "\r\n"
	}
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	statusIndex := replaceOrInsertTopLevel(&lines, "status", "status: "+state.Status, 1)
	replaceOrInsertTopLevel(&lines, "last_updated", "last_updated: "+yamlQuote(state.LastUpdated), statusIndex+1)
	replaceOrInsertTopLevel(&lines, "revision", fmt.Sprintf("revision: %d", state.Revision), statusIndex+1)
	applyBlockingQuestions(&lines, state.BlockingQuestions, statusIndex+1)
	applyPhaseProjection(&lines, state, phase)
	return strings.Join(lines, eol)
}

func replaceOrInsertTopLevel(lines *[]string, key, replacement string, at int) int {
	for i, line := range *lines {
		if lineIndentation(line) == 0 {
			if found, _, ok := yamlKeyValue(strings.TrimSpace(line)); ok && found == key {
				(*lines)[i] = replacement
				return i
			}
		}
	}
	if at < 0 || at > len(*lines) {
		at = len(*lines)
	}
	*lines = append((*lines)[:at], append([]string{replacement}, (*lines)[at:]...)...)
	return at
}

func applyBlockingQuestions(lines *[]string, questions []string, at int) {
	start := -1
	for i, line := range *lines {
		if lineIndentation(line) == 0 {
			if key, _, ok := yamlKeyValue(strings.TrimSpace(line)); ok && key == "blocking_questions" {
				start = i
				break
			}
		}
	}
	if start == -1 && len(questions) == 0 {
		return
	}
	replacement := []string{"blocking_questions: []"}
	if len(questions) > 0 {
		replacement = []string{"blocking_questions:"}
		for _, question := range questions {
			replacement = append(replacement, "  - "+yamlQuote(question))
		}
	}
	if start == -1 {
		*lines = append((*lines)[:at], append(replacement, (*lines)[at:]...)...)
		return
	}
	end := start + 1
	for end < len(*lines) {
		if strings.TrimSpace((*lines)[end]) != "" && lineIndentation((*lines)[end]) == 0 {
			break
		}
		end++
	}
	*lines = append((*lines)[:start], append(replacement, (*lines)[end:]...)...)
}

func applyPhaseProjection(lines *[]string, state phaseCompletionState, phase string) {
	phasesStart, phasesEnd := -1, len(*lines)
	for i, line := range *lines {
		if lineIndentation(line) != 0 || strings.TrimSpace(line) == "" {
			continue
		}
		if strings.TrimSpace(line) == "phases:" {
			phasesStart = i
			continue
		}
		if phasesStart != -1 {
			phasesEnd = i
			break
		}
	}
	if phasesStart == -1 {
		*lines = append(*lines, "phases:")
		phasesStart, phasesEnd = len(*lines)-1, len(*lines)
	}
	header, blockEnd := -1, phasesEnd
	for i := phasesStart + 1; i < phasesEnd; i++ {
		if lineIndentation((*lines)[i]) != 2 {
			continue
		}
		if header != -1 {
			blockEnd = i
			break
		}
		if strings.TrimSpace((*lines)[i]) == phase+":" {
			header = i
		}
	}
	entry := state.Phases[phase]
	projected := projectionLines(entry)
	if header == -1 {
		newLines := []string{"  " + phase + ":"}
		if entry.Status != "" {
			newLines = append(newLines, "    status: "+entry.Status)
		}
		newLines = append(newLines, artifactLines(entry.Artifacts)...)
		for _, key := range []string{"summary", "verdict", "key_decisions", "blocker_type", "last_payload_hash"} {
			newLines = append(newLines, projected[key]...)
		}
		*lines = append((*lines)[:phasesStart+1], append(newLines, (*lines)[phasesStart+1:]...)...)
		return
	}
	applied := map[string]bool{}
	for cursor := header + 1; cursor < blockEnd; {
		line := (*lines)[cursor]
		key, _, ok := yamlKeyValue(strings.TrimSpace(line))
		if !ok || lineIndentation(line) != 4 || applied[key] {
			cursor++
			continue
		}
		replacement, exists := projected[key]
		if !exists {
			cursor++
			continue
		}
		applied[key] = true
		end := cursor + 1
		for end < blockEnd && (strings.TrimSpace((*lines)[end]) == "" || lineIndentation((*lines)[end]) > 4) {
			end++
		}
		*lines = append((*lines)[:cursor], append(replacement, (*lines)[end:]...)...)
		blockEnd += len(replacement) - (end - cursor)
		cursor += len(replacement)
	}
	appendAt := blockEnd
	for appendAt > header+1 && strings.TrimSpace((*lines)[appendAt-1]) == "" {
		appendAt--
	}
	for _, key := range []string{"status", "summary", "verdict", "key_decisions", "blocker_type", "last_payload_hash"} {
		if replacement, exists := projected[key]; exists && !applied[key] {
			*lines = append((*lines)[:appendAt], append(replacement, (*lines)[appendAt:]...)...)
			appendAt += len(replacement)
		}
	}
}

func projectionLines(entry phaseProjectionState) map[string][]string {
	projected := map[string][]string{}
	if entry.Status != "" {
		projected["status"] = []string{"    status: " + entry.Status}
	}
	if entry.Summary != "" {
		projected["summary"] = []string{"    summary: " + yamlQuote(entry.Summary)}
	}
	if entry.Verdict != "" {
		projected["verdict"] = []string{"    verdict: " + yamlQuote(entry.Verdict)}
	}
	if len(entry.KeyDecisions) > 0 {
		lines := []string{"    key_decisions:"}
		for _, decision := range entry.KeyDecisions {
			lines = append(lines, "      - "+yamlQuote(decision))
		}
		projected["key_decisions"] = lines
	}
	if entry.BlockerType != "" {
		projected["blocker_type"] = []string{"    blocker_type: " + entry.BlockerType}
	}
	if entry.LastPayloadHash != "" {
		projected["last_payload_hash"] = []string{"    last_payload_hash: " + yamlQuote(entry.LastPayloadHash)}
	}
	return projected
}

func artifactLines(artifacts any) []string {
	if artifacts == "inline" {
		return []string{`    artifact: "inline"`}
	}
	items, ok := artifacts.([]any)
	if !ok || len(items) == 0 {
		return nil
	}
	if len(items) == 1 {
		if item, ok := items[0].(string); ok {
			return []string{"    artifact: " + yamlQuote(item)}
		}
		return nil
	}
	lines := []string{"    artifacts:"}
	for _, item := range items {
		if value, ok := item.(string); ok {
			lines = append(lines, "      - "+yamlQuote(value))
		}
	}
	return lines
}

// validatePhaseCompletionYAML is deliberately conservative because this
// reducer is a line-oriented writer, not a general YAML parser. It rejects
// malformed mappings and unterminated quoted scalars before any projection can
// rewrite opaque state bytes.
func validatePhaseCompletionYAML(content string) error {
	for lineNumber, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if strings.Contains(line, "\t") {
			return fmt.Errorf("state YAML line %d contains a tab", lineNumber+1)
		}
		if strings.HasPrefix(trimmed, "- ") {
			if err := validateYAMLScalar(strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))); err != nil {
				return fmt.Errorf("state YAML line %d has an invalid sequence scalar: %w", lineNumber+1, err)
			}
			continue
		}
		key, value, ok := yamlKeyValue(trimmed)
		if !ok || key == "" {
			return fmt.Errorf("state YAML line %d is not a mapping", lineNumber+1)
		}
		if err := validateYAMLScalar(value); err != nil {
			return fmt.Errorf("state YAML line %d has an invalid scalar: %w", lineNumber+1, err)
		}
	}
	return nil
}

func validateYAMLScalar(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if value[0] == '"' {
		var decoded string
		if err := json.Unmarshal([]byte(value), &decoded); err != nil {
			return fmt.Errorf("invalid double-quoted scalar")
		}
		return nil
	}
	if value[0] == '\'' && (len(value) < 2 || value[len(value)-1] != '\'') {
		return fmt.Errorf("unterminated single-quoted scalar")
	}
	return nil
}

func yamlKeyValue(line string) (string, string, bool) {
	index := strings.IndexByte(line, ':')
	if index < 0 {
		return "", "", false
	}
	return strings.TrimSpace(line[:index]), strings.TrimSpace(line[index+1:]), true
}

func yamlScalar(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
		if value[0] == '"' {
			var decoded string
			if json.Unmarshal([]byte(value), &decoded) == nil {
				return decoded
			}
		}
		return value[1 : len(value)-1]
	}
	return strings.TrimSpace(strings.SplitN(value, " #", 2)[0])
}

func yamlQuote(value string) string {
	encoded, _ := json.Marshal(truncateRunes(value, 160))
	return string(encoded)
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) > limit {
		return string(runes[:limit])
	}
	return value
}

func lineIndentation(line string) int {
	return len(line) - len(strings.TrimLeft(line, " \t"))
}
