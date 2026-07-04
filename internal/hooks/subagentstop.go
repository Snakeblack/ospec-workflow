// subagent-stop hook handler.
// Ports runSubagentStop from scripts/hooks/subagent-stop.js.
// Always exits 0 and emits {"continue":true}. Uses internal/store for advisory-locked append.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/resultenvelope"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite"
)

func init() {
	Register(&subagentStopHandler{})
}

type subagentStopHandler struct{}

func (h *subagentStopHandler) Name() string { return "subagent-stop" }

// resultFields mirrors RESULT_FIELDS in subagent-stop.js.
var resultFields = []string{
	"result",
	"output",
	"response",
	"final_output",
	"final_result",
	"message",
	"content",
}

// NormalizeResolution lowercases and trims a resolution value.
func NormalizeResolution(value any) string {
	return strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", value)))
}

// IsDegradedResolution reports whether resolution is one of the three degraded values.
// Exported for testing.
func IsDegradedResolution(resolution string) bool {
	switch resolution {
	case "fallback-registry", "fallback-path", "none":
		return true
	}
	return false
}

// FindStructuredResolution searches v recursively for a skill_resolution field.
// JSON payloads are always acyclic, so no cycle-detection is needed.
// Exported for testing.
func FindStructuredResolution(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case map[string]any:
		if res, ok := val["skill_resolution"]; ok {
			if s := NormalizeResolution(res); s != "" {
				return s
			}
		}
		// Iterate child values in a deterministic order. Go randomizes map
		// iteration, so we sort keys and walk them in reverse to keep a stable
		// "last sibling wins" result regardless of run-to-run map ordering.
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for i := len(keys) - 1; i >= 0; i-- {
			if res := FindStructuredResolution(val[keys[i]]); res != "" {
				return res
			}
		}
	case []any:
		for i := len(val) - 1; i >= 0; i-- {
			if res := FindStructuredResolution(val[i]); res != "" {
				return res
			}
		}
	}
	return ""
}

// parseJsonText attempts to JSON-decode a string, returning nil on failure.
func parseJsonText(text string) any {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	var v any
	if err := json.Unmarshal([]byte(text), &v); err != nil {
		return nil
	}
	return v
}

// findTextResolution extracts a skill_resolution value from free text.
// Ports findTextResolution from subagent-stop.js.
func findTextResolution(text string) string {
	parsed := parseJsonText(text)
	if parsed != nil {
		if res := FindStructuredResolution(parsed); res != "" {
			return res
		}
	}
	// Regex fallback: last occurrence of skill_resolution: value.
	idx := strings.LastIndex(strings.ToLower(text), "skill_resolution")
	if idx == -1 {
		return ""
	}
	rest := text[idx+len("skill_resolution"):]
	// Skip optional quotes, colon, equals, spaces.
	rest = strings.TrimLeft(rest, " \t\"'`:= ")
	// Extract alphanumeric+dash token.
	end := 0
	for end < len(rest) {
		c := rest[end]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-' || (c >= '0' && c <= '9') {
			end++
		} else {
			break
		}
	}
	return strings.ToLower(strings.TrimRight(rest[:end], `"'` + "`"))
}

// findResolutionInValue dispatches between string and object values.
func findResolutionInValue(v any) string {
	switch val := v.(type) {
	case string:
		return findTextResolution(val)
	default:
		return FindStructuredResolution(v)
	}
}

// findResolutionInInput extracts the resolution from the top-level input object.
// Ports findResolutionInInput from subagent-stop.js.
func findResolutionInInput(input map[string]any) string {
	if direct, ok := input["skill_resolution"]; ok {
		if s := NormalizeResolution(direct); s != "" {
			return s
		}
	}
	for _, field := range resultFields {
		v, ok := input[field]
		if !ok {
			continue
		}
		if res := findResolutionInValue(v); res != "" {
			return res
		}
	}
	return ""
}

// findResolutionInJsonLines scans JSONL content for a resolution, last match wins.
func findResolutionInJsonLines(content string) string {
	lines := strings.Split(content, "\n")
	// Scan in reverse.
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		parsed := parseJsonText(line)
		if parsed == nil {
			continue
		}
		m, ok := parsed.(map[string]any)
		if !ok {
			continue
		}
		if res := FindStructuredResolution(m); res != "" {
			return res
		}
		for _, field := range resultFields {
			v, ok := m[field]
			if !ok {
				continue
			}
			if res := findResolutionInValue(v); res != "" {
				return res
			}
		}
	}
	return ""
}

// findResolutionInTranscript reads a transcript file and extracts the resolution.
// The path must be absolute and contain no ".." segment; any rejected path is
// treated as absent (identical degradation to ENOENT) — no os.ReadFile call is made.
func findResolutionInTranscript(transcriptPath string) (string, error) {
	path, ok := validatePath(transcriptPath)
	if !ok {
		return "", nil // treated as absent — no readFilePermissive call
	}
	data, err := readFilePermissive(path)
	if err != nil {
		return "", err
	}
	if data == nil {
		return "", nil
	}
	content := string(data)
	if parsed := parseJsonText(content); parsed != nil {
		if res := FindStructuredResolution(parsed); res != "" {
			return res, nil
		}
	}
	return findResolutionInJsonLines(content), nil
}

// readFilePermissive reads a file, returning nil content (no error) for ENOENT/EACCES.
func readFilePermissive(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) || os.IsPermission(err) {
			return nil, nil
		}
		return nil, err
	}
	return data, nil
}

// ── Result Envelope extraction/validation/persistence (C5) ──────────────────
// Ports findEnvelopeInInput/findEnvelopeInTranscript/persistResultEnvelope from
// scripts/hooks/subagent-stop.js. Mirrors the same §5.2 field-search order
// already used for skill_resolution (resultFields, then a transcript_path
// fallback), but looks for the strict json:result-envelope fence instead.

// findEnvelopeInValue searches v (string or nested structure) for the strict
// json:result-envelope fence. JSON payloads are always acyclic.
func findEnvelopeInValue(v any) (map[string]any, bool) {
	switch val := v.(type) {
	case string:
		return resultenvelope.Extract(val)
	case map[string]any:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for i := len(keys) - 1; i >= 0; i-- {
			if value, found := findEnvelopeInValue(val[keys[i]]); found {
				return value, found
			}
		}
	case []any:
		for i := len(val) - 1; i >= 0; i-- {
			if value, found := findEnvelopeInValue(val[i]); found {
				return value, found
			}
		}
	}
	return nil, false
}

// findEnvelopeInInput searches the top-level input object's §5.2 result
// fields, in order, for the strict result-envelope fence.
func findEnvelopeInInput(input map[string]any) (map[string]any, bool) {
	for _, field := range resultFields {
		v, ok := input[field]
		if !ok {
			continue
		}
		if value, found := findEnvelopeInValue(v); found {
			return value, found
		}
	}
	return nil, false
}

// findEnvelopeInTranscript reads a transcript file (subject to the same
// path-traversal hardening as findResolutionInTranscript) and searches it for
// the strict result-envelope fence.
func findEnvelopeInTranscript(transcriptPath string) (map[string]any, bool) {
	path, ok := validatePath(transcriptPath)
	if !ok {
		return nil, false
	}
	data, err := readFilePermissive(path)
	if err != nil || data == nil {
		return nil, false
	}
	content := string(data)
	if value, found := resultenvelope.Extract(content); found {
		return value, found
	}
	lines := strings.Split(content, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		parsed := parseJsonText(line)
		if parsed == nil {
			continue
		}
		if value, found := findEnvelopeInValue(parsed); found {
			return value, found
		}
	}
	return nil, false
}

// persistResultEnvelope extracts, validates, and (fill-gap) persists the
// phase's Result Envelope summary into the active change's state.yaml, per
// REQ-hooks-001. Strictly additive and fail-safe: any failure at any step (no
// fence, malformed JSON, schema-invalid, no active change, non-"sdd-" agent,
// lock/write failure) silently no-ops without panicking and without affecting
// the hook's stdout.
func persistResultEnvelope(input map[string]any, workspace string) {
	defer func() {
		// Fully fail-safe: envelope persistence must never crash SubagentStop
		// or affect its existing skill_resolution behavior/exit status.
		_ = recover()
	}()

	envelope, found := findEnvelopeInInput(input)
	if !found {
		if tp, ok := input["transcript_path"].(string); ok {
			envelope, found = findEnvelopeInTranscript(tp)
		}
	}
	if !found || envelope == nil {
		return
	}

	valid, _ := resultenvelope.Validate(envelope)
	if !valid {
		return
	}

	agentName := resolveAgentName(input)
	phase := derivePhaseKey(agentName)
	if phase == "" {
		return
	}

	s := store.NewStore(workspace)
	activeChanges, err := s.FindActiveChanges()
	if err != nil || len(activeChanges) == 0 {
		return
	}
	statePath := filepath.Join(activeChanges[0].ChangeDirectory, "state.yaml")

	summary, _ := envelope["executive_summary"].(string)
	var keyDecisions []string
	if raw, ok := envelope["key_decisions"].([]any); ok {
		for _, item := range raw {
			if s, ok := item.(string); ok {
				keyDecisions = append(keyDecisions, s)
			}
		}
	}

	_ = store.WithLock(statePath, func() error {
		fresh, readErr := os.ReadFile(statePath)
		if readErr != nil {
			return nil // fail-safe no-op
		}
		updated := yamllite.SetPhaseSummary(string(fresh), phase, summary, keyDecisions)
		if updated == string(fresh) {
			return nil
		}
		return atomicWriteFile(statePath, updated)
	})
}

// atomicWriteFile writes content to dst using a temp-file + rename pattern,
// mirroring store's private atomicWriteFile (kept local to avoid exporting an
// internal store helper solely for this one caller).
func atomicWriteFile(dst, content string) error {
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".write-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()

	_, writeErr := tmp.WriteString(content)
	closeErr := tmp.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(tmpPath)
		if writeErr != nil {
			return writeErr
		}
		return closeErr
	}
	if err := os.Rename(tmpPath, dst); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

// derivePhaseKey strips the "sdd-" prefix from an agent name to derive its
// phase key. Returns "" when the agent name does not carry the prefix.
// Shared between persistResultEnvelope and persistPhaseCost (REFACTOR, task
// 2.5) so the phase-key derivation rule lives in exactly one place.
func derivePhaseKey(agentName string) string {
	if !strings.HasPrefix(agentName, "sdd-") {
		return ""
	}
	return strings.TrimPrefix(agentName, "sdd-")
}

// resolveResultPayload picks the first present §5.2 resultFields value from
// the dispatch input, unresolved/raw. Mirrors
// findEnvelopeInInput/findResolutionInInput's field-search order.
func resolveResultPayload(input map[string]any) any {
	for _, field := range resultFields {
		if v, ok := input[field]; ok {
			return v
		}
	}
	return nil
}

// EstimateResultTokens estimates a token count for a dispatch result payload
// using the same ~4-bytes/token heuristic as the JS
// estimateTokens/estimateResultTokens helpers (REQ-hooks-001). `payload` is
// used as-is when it is already a string, else JSON-marshaled. The integer
// formula (len(str)+2)/4 is the integer form of Math.round(len/4), keeping
// est_tokens identical cross-runtime for any payload, including non-ASCII.
// Exported for cross-runtime parity testing.
func EstimateResultTokens(payload any) int {
	var str string
	switch v := payload.(type) {
	case string:
		str = v
	case nil:
		str = ""
	default:
		b, err := json.Marshal(v)
		if err != nil {
			// Unmarshalable payload (e.g. a value with no JSON representation)
			// degrades to zero tokens rather than propagating an error — the
			// caller (persistPhaseCost) still records a record with 0 tokens,
			// matching the fail-safe posture: an estimation quirk never blocks
			// the whole phase-cost append.
			str = ""
		} else {
			str = string(b)
		}
	}
	return (len(str) + 2) / 4
}

// resolveDispatchStatus resolves the dispatch's status for a phase-cost
// record: a valid json:result-envelope fence's `status` field, else the
// top-level input.status, else "unknown" (REQ-hooks-001 / design
// "Payload/status resolution").
func resolveDispatchStatus(input map[string]any) string {
	envelope, found := findEnvelopeInInput(input)
	if !found {
		if tp, ok := input["transcript_path"].(string); ok {
			envelope, found = findEnvelopeInTranscript(tp)
		}
	}
	if found && envelope != nil {
		if valid, _ := resultenvelope.Validate(envelope); valid {
			if s, ok := envelope["status"].(string); ok && s != "" {
				return s
			}
		}
	}
	if s, ok := input["status"].(string); ok && strings.TrimSpace(s) != "" {
		return s
	}
	return "unknown"
}

// persistPhaseCost appends one estimated-cost JSONL record for this dispatch
// to .ospec/session/{change}/phase-costs.jsonl (REQ-hooks-001), mirroring the
// fail-safe boundary and active-change resolution already used by
// persistResultEnvelope. Any failure (non-"sdd-" agent, no active change,
// marshal error, write/lock error, or a panic) silently no-ops without
// crashing and without affecting the hook's stdout.
func persistPhaseCost(input map[string]any, workspace string) {
	defer func() {
		_ = recover()
	}()

	agentName := resolveAgentName(input)
	phase := derivePhaseKey(agentName)
	if phase == "" {
		return
	}

	s := store.NewStore(workspace)
	activeChanges, err := s.FindActiveChanges()
	if err != nil || len(activeChanges) == 0 {
		return
	}
	changeName := activeChanges[0].DirectoryName

	payload := resolveResultPayload(input)
	estTokens := EstimateResultTokens(payload)
	status := resolveDispatchStatus(input)

	record := map[string]any{
		"phase":      phase,
		"agent":      agentName,
		"est_tokens": estTokens,
		"status":     status,
		"ts":         time.Now().UTC().Format(time.RFC3339Nano),
	}
	line, marshalErr := json.Marshal(record)
	if marshalErr != nil {
		return
	}
	_ = s.AppendPhaseCost(changeName, line)
}

// resolveAgentName picks the best agent name field from input.
func resolveAgentName(input map[string]any) string {
	for _, field := range []string{"agent_type", "agent_name", "agent", "agent_id"} {
		if v, ok := input[field]; ok {
			if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" {
				return s
			}
		}
	}
	return "unknown"
}

// resolveTimestampFromInput gets timestamp from input or falls back to now.
func resolveTimestampFromInput(input map[string]any) string {
	if v, ok := input["timestamp"]; ok {
		if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" {
			return s
		}
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func (h *subagentStopHandler) Run(stdin []byte) ([]byte, int) {
	var input map[string]any
	if err := json.Unmarshal(stdin, &input); err != nil {
		msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
		b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
		return b, 0
	}
	return runSubagentStop(input)
}

func runSubagentStop(input map[string]any) ([]byte, int) {
	// REQ-hooks-001: attempt the strict result-envelope fence extract/validate/
	// persist step BEFORE the existing skill_resolution evaluation below. This
	// is a pure side effect (state.yaml write) and never alters this
	// function's return value or the hook's stdout.
	if cwd, ok := input["cwd"].(string); ok {
		workspace := resolveCwd(cwd)
		persistResultEnvelope(input, workspace)
		// REQ-hooks-001: per-dispatch phase-cost recording. Same fail-safe/
		// ordering contract as persistResultEnvelope above — pure side effect,
		// never alters this function's return value or the hook's stdout.
		persistPhaseCost(input, workspace)
	} else {
		workspace := resolveCwd("")
		persistResultEnvelope(input, workspace)
		persistPhaseCost(input, workspace)
	}

	resolution := findResolutionInInput(input)
	if resolution == "" {
		if tp, ok := input["transcript_path"].(string); ok {
			res, err := findResolutionInTranscript(tp)
			if err != nil {
				msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
				b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
				return b, 0
			}
			resolution = res
		}
	}

	if !IsDegradedResolution(resolution) {
		// Healthy or unavailable — no event.
		b, _ := json.Marshal(map[string]bool{"continue": true})
		return b, 0
	}

	event := map[string]any{
		"timestamp":        resolveTimestampFromInput(input),
		"agent":            resolveAgentName(input),
		"skill_resolution": resolution,
		"action":           "refresh-registry-next-delegation",
	}

	cwd, _ := input["cwd"].(string)
	workspace := resolveCwd(cwd)
	s := store.NewStore(workspace)

	eventBytes, _ := json.Marshal(event)
	if err := s.AppendRuntimeEvent(eventBytes); err != nil {
		msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
		b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
		return b, 0
	}

	b, _ := json.Marshal(map[string]any{
		"continue":      true,
		"systemMessage": "Subagent skill resolution degraded; refresh the skill registry before the next delegation.",
	})
	return b, 0
}
