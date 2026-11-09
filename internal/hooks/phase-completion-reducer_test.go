package hooks

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testProjectionEnvelope() map[string]any {
	return map[string]any{
		"status":            "success",
		"executive_summary": "Characters <>& and line separator \u2028 remain semantic content.",
		"artifacts":         []any{"design.md"},
		"next_recommended":  "sdd-tasks",
		"risks":             "None",
		"skill_resolution":  "injected",
		"metadata":          map[string]any{"z": "last", "a": "first"},
	}
}

func testStateWithHash(hash string) string {
	return "change: cross-runtime-replay\n" +
		"status: planning\n" +
		"revision: 7\n" +
		"phases:\n" +
		"  design:\n" +
		"    status: done\n" +
		"    last_payload_hash: \"" + hash + "\"\n"
}

func reducerScriptPath(t *testing.T) string {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve current test file")
	}
	return filepath.Join(filepath.Dir(sourceFile), "..", "..", "scripts", "lib", "lifecycle-kernel", "phase-completion-reducer.js")
}

func runNodeReducer(t *testing.T, state map[string]any, envelope map[string]any) map[string]any {
	t.Helper()
	input, err := json.Marshal(map[string]any{
		"state":    state,
		"envelope": envelope,
	})
	if err != nil {
		t.Fatal(err)
	}
	const script = `const fs = require("node:fs");
const { reducePhaseCompletion } = require(process.argv[1]);
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const result = reducePhaseCompletion(input.state, { phase: "design", envelope: input.envelope }, { now: "2026-09-12T00:00:00.000Z" });
process.stdout.write(JSON.stringify({ outcome: result.outcome, hash: result.state.phases.design.last_payload_hash }));`
	command := exec.Command("node", "-e", script, reducerScriptPath(t))
	command.Stdin = bytes.NewReader(input)
	output, err := command.Output()
	if err != nil {
		t.Fatalf("run Node reducer: %v", err)
	}
	var result map[string]any
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatalf("parse Node reducer output %q: %v", output, err)
	}
	return result
}

func TestProjectPhaseCompletion_CrossRuntimeReplay(t *testing.T) {
	envelope := testProjectionEnvelope()
	baseState := map[string]any{
		"change":   "cross-runtime-replay",
		"status":   "planning",
		"revision": 7,
		"phases":   map[string]any{"design": map[string]any{"status": "done"}},
	}

	// Node -> Go: persist the exact hash emitted by Node, then ensure Go does
	// not advance revision or rewrite the state for the same semantic payload.
	nodeFirst := runNodeReducer(t, baseState, envelope)
	nodeHash, _ := nodeFirst["hash"].(string)
	if nodeHash == "" {
		t.Fatalf("Node reducer did not emit a replay hash: %#v", nodeFirst)
	}
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := testStateWithHash(nodeHash)
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	result := ProjectPhaseCompletion(statePath, "design", envelope, nil)
	if !result.OK || result.Outcome != "noop-replay" {
		t.Fatalf("Node -> Go replay must be a no-op, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != before {
		t.Fatalf("Node -> Go replay mutated persisted state:\n%s", after)
	}

	// Go -> Node: persist the hash emitted by Go, then invoke Node against that
	// stored state. It must identify the envelope as the same replay.
	goStatePath := filepath.Join(t.TempDir(), "state.yaml")
	if err := os.WriteFile(goStatePath, []byte(testStateWithHash("different")), 0644); err != nil {
		t.Fatal(err)
	}
	goResult := ProjectPhaseCompletion(goStatePath, "design", envelope, nil)
	if !goResult.OK || goResult.Outcome != "advanced" {
		t.Fatalf("seed Go projection: %+v", goResult)
	}
	goStateBytes, err := os.ReadFile(goStatePath)
	if err != nil {
		t.Fatal(err)
	}
	goHash := ""
	for _, line := range strings.Split(string(goStateBytes), "\n") {
		if strings.Contains(line, "last_payload_hash:") {
			goHash = strings.Trim(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "last_payload_hash:")), "\"")
		}
	}
	if goHash == "" {
		t.Fatalf("Go projection did not persist a replay hash:\n%s", goStateBytes)
	}
	nodeReplay := runNodeReducer(t, map[string]any{
		"change":   "cross-runtime-replay",
		"status":   "planning",
		"revision": 8,
		"phases": map[string]any{
			"design": map[string]any{"status": "done", "last_payload_hash": goHash},
		},
	}, envelope)
	if nodeReplay["outcome"] != "noop-replay" {
		t.Fatalf("Go -> Node replay must be a no-op, got %#v", nodeReplay)
	}
}

// Pinned Node v2.67.0–v2.67.3 insertion-order sha256 of v267GoldenEnvelope().
const v267GoldenLegacyHash = "05c6a85b59cf771d860309d7446cc3a496960eb45f8ef8ccaac08a33b0f15273"

func v267GoldenEnvelope() map[string]any {
	return map[string]any{
		"schema_version":    1,
		"status":            "success",
		"executive_summary": "v2.67 golden replay fixture.",
		"artifacts":         []any{"openspec/changes/auth/design.md"},
		"next_recommended":  "sdd-tasks",
		"risks":             "None",
		"skill_resolution":  "injected",
		"key_decisions":     []any{"Decision A"},
	}
}

func TestProjectPhaseCompletion_V267InsertionOrderHashIsNoopReplay(t *testing.T) {
	envelope := v267GoldenEnvelope()
	legacyHash, err := legacyV267PayloadHash(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if legacyHash != v267GoldenLegacyHash {
		t.Fatalf("Go legacy hash must pin Node v2.67 digest: got %s want %s", legacyHash, v267GoldenLegacyHash)
	}

	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := testStateWithHash(v267GoldenLegacyHash)
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	result := ProjectPhaseCompletion(statePath, "design", envelope, nil)
	if !result.OK || result.Outcome != "noop-replay" {
		t.Fatalf("v2.67 legacy hash replay must be noop, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != before {
		t.Fatalf("v2.67 noop must not mutate state:\nbefore:\n%s\nafter:\n%s", before, after)
	}
	if !strings.Contains(string(after), "revision: 7") {
		t.Fatalf("v2.67 noop must keep revision stable:\n%s", after)
	}
}

const v267NestedLegacyHash = "561aca2ff1da87e00356c9eda97413514160fafd8ccd2ed00d00d184d99df4fb"

func v267NestedEnvelope() map[string]any {
	return map[string]any{
		"schema_version": 1, "status": "blocked",
		"executive_summary": "v2.67 nested question_gate replay fixture.",
		"artifacts":         []any{"inline"}, "next_recommended": "sdd-design",
		"risks": "None", "skill_resolution": "injected", "blocker_type": "design-mismatch",
		"question_gate": map[string]any{
			"reason": "Need a decision.",
			"questions": []any{map[string]any{
				"header": "Seam", "question": "Keep the seam?",
				"options": []any{map[string]any{"label": "yes", "description": "Keep it", "recommended": true}},
			}},
		},
	}
}

func TestProjectPhaseCompletion_V267NestedQuestionGateHashMatchesNodeAndNoops(t *testing.T) {
	envelope := v267NestedEnvelope()
	legacyHash, err := legacyV267PayloadHash(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if legacyHash != v267NestedLegacyHash {
		t.Fatalf("Go nested legacy hash must pin Node v2.67 digest: got %s want %s", legacyHash, v267NestedLegacyHash)
	}
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := testStateWithHash(v267NestedLegacyHash)
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	result := ProjectPhaseCompletion(statePath, "design", envelope, nil)
	if !result.OK || result.Outcome != "noop-replay" {
		t.Fatalf("nested v2.67 hash replay must be noop, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != before {
		t.Fatalf("nested v2.67 noop must not mutate state")
	}
}

func TestLegacyV267StatusFirstDigestDiffersFromFrozenOrder(t *testing.T) {
	frozenHash, err := legacyV267PayloadHash(v267GoldenEnvelope())
	if err != nil {
		t.Fatal(err)
	}
	if frozenHash != v267GoldenLegacyHash {
		t.Fatalf("frozen-order digest must pin golden: got %s want %s", frozenHash, v267GoldenLegacyHash)
	}

	// Status-first serialization of the same semantic fields (not Go's frozen order).
	statusFirstJSON := `{"status":"success","schema_version":1,"executive_summary":"v2.67 golden replay fixture.","artifacts":["openspec/changes/auth/design.md"],"next_recommended":"sdd-tasks","risks":"None","skill_resolution":"injected","key_decisions":["Decision A"]}`
	statusFirstHash := fmt.Sprintf("%x", sha256.Sum256([]byte(statusFirstJSON)))
	if statusFirstHash == frozenHash {
		t.Fatalf("status-first JSON digest must not match schema_version-first frozen digest")
	}
	if statusFirstHash == v267GoldenLegacyHash {
		t.Fatalf("status-first JSON digest must not equal the promised v2.67 legacy noop digest")
	}
}

func TestProjectPhaseCompletion_UnrelatedPayloadIsNotNoopAgainstStoredP(t *testing.T) {
	envelopeQ := v267GoldenEnvelope()
	envelopeQ["executive_summary"] = "Unrelated payload Q — different completion."

	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := testStateWithHash(v267GoldenLegacyHash)
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	result := ProjectPhaseCompletion(statePath, "design", envelopeQ, nil)
	if result.Outcome == "noop-replay" {
		t.Fatalf("unrelated payload Q must not noop against P's stored hash, got %+v", result)
	}
	if !result.OK || result.Outcome != "advanced" {
		t.Fatalf("unrelated Q must take normal reduce/CAS path, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(after), "revision: 7") {
		t.Fatalf("unrelated Q must advance revision away from 7:\n%s", after)
	}
	if strings.Contains(string(after), v267GoldenLegacyHash) {
		t.Fatalf("advance must not keep legacy hash of P:\n%s", after)
	}
}

func TestProjectPhaseCompletion_CrossRuntimeReplayUsesUTF16KeyOrdering(t *testing.T) {
	envelope := testProjectionEnvelope()
	envelope["metadata"] = map[string]any{
		"\uE000": "private-use",
		"😀":      "astral",
	}
	baseState := map[string]any{
		"change":   "cross-runtime-replay",
		"status":   "planning",
		"revision": 7,
		"phases":   map[string]any{"design": map[string]any{"status": "done"}},
	}

	// JavaScript orders object keys by UTF-16 code units: 😀 (D83D...) precedes
	// \uE000. A Go replay must recognize the hash emitted by Node for this case.
	nodeFirst := runNodeReducer(t, baseState, envelope)
	nodeHash, _ := nodeFirst["hash"].(string)
	if nodeHash == "" {
		t.Fatalf("Node reducer did not emit a replay hash: %#v", nodeFirst)
	}
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := testStateWithHash(nodeHash)
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	if result := ProjectPhaseCompletion(statePath, "design", envelope, nil); !result.OK || result.Outcome != "noop-replay" {
		t.Fatalf("Node UTF-16 hash must replay as a Go no-op, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != before {
		t.Fatalf("UTF-16 replay must preserve state bytes:\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

func TestProjectPhaseCompletion_RecoversOrphanBackupBeforeRead(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	backup := statePath + ".bak"
	original := testStateWithHash("")
	if err := os.WriteFile(backup, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}

	result := ProjectPhaseCompletion(statePath, "design", testProjectionEnvelope(), nil)
	if !result.OK || result.Outcome != "advanced" {
		t.Fatalf("orphan backup must recover before projection, got %+v", result)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("orphan backup must be moved back to state.yaml, stat error=%v", err)
	}
	state, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(state), "last_payload_hash:") {
		t.Fatalf("recovered state was not projected:\n%s", state)
	}
}

func TestPersistResultEnvelope_LogsRecoveredProjectionPanicWithoutChangingHookOutput(t *testing.T) {
	workspace := t.TempDir()
	changeDir := filepath.Join(workspace, "openspec", "changes", "cross-runtime-replay")
	if err := os.MkdirAll(changeDir, 0755); err != nil {
		t.Fatal(err)
	}
	statePath := filepath.Join(changeDir, "state.yaml")
	before := testStateWithHash("")
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}

	originalProjector := projectPhaseCompletion
	projectPhaseCompletion = func(string, string, map[string]any, *int) PhaseCompletionResult {
		panic("injected projection panic")
	}
	t.Cleanup(func() { projectPhaseCompletion = originalProjector })

	envelope, err := json.Marshal(testProjectionEnvelope())
	if err != nil {
		t.Fatal(err)
	}
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	originalStderr := os.Stderr
	defer func() {
		os.Stderr = originalStderr
		_ = writer.Close()
		_ = reader.Close()
	}()
	os.Stderr = writer
	output, code := runSubagentStop(map[string]any{
		"cwd":        workspace,
		"agent_type": "sdd-design",
		"result":     "```json:result-envelope\n" + string(envelope) + "\n```",
	})
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stderr = originalStderr
	logged, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logged), "recovered projection panic: injected projection panic") {
		t.Fatalf("recovered projection panic was not logged: %q", logged)
	}
	if code != 0 || string(output) != `{"continue":true}` {
		t.Fatalf("projection panic changed hook output: code=%d output=%q", code, output)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != before {
		t.Fatalf("recovered projection panic changed state:\n%s", after)
	}
}

func TestProjectPhaseCompletion_ArchiveProjectsArchivePending(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	before := "change: archive-pending\nstatus: verified\nrevision: 3\nphases:\n  verify:\n    status: done\n"
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}
	envelope := map[string]any{"status": "success", "executive_summary": "Archive plan emitted.", "artifacts": []any{"archive-plan.json"}}

	result := ProjectPhaseCompletion(statePath, "archive", envelope, nil)
	if !result.OK || result.Outcome != "advanced" {
		t.Fatalf("archive completion must advance, got %+v", result)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	state, err := parsePhaseCompletionState(string(after))
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != "archive-pending" || state.Phases["archive"].Status != "done" {
		t.Fatalf("archive completion must project archive-pending with phases.archive done, got status %q phase %q\n%s", state.Status, state.Phases["archive"].Status, after)
	}
}

func TestProjectPhaseCompletion_MalformedStateFailsClosed(t *testing.T) {
	cases := []struct {
		name   string
		before string
	}{
		{"unparseable document", "::: invalid yaml :::\n\t\t\t][]["},
		{"invalid revision is not treated as zero", "change: cross-runtime-replay\nstatus: planning\nrevision: not-a-number\nphases:\n"},
		{"unterminated nested scalar", "change: cross-runtime-replay\nstatus: planning\nphases:\n  design:\n    summary: \"unterminated\n"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			statePath := filepath.Join(t.TempDir(), "state.yaml")
			if err := os.WriteFile(statePath, []byte(tc.before), 0644); err != nil {
				t.Fatal(err)
			}

			result := ProjectPhaseCompletion(statePath, "design", testProjectionEnvelope(), nil)
			if result.OK || result.Outcome != "malformed-state" {
				t.Fatalf("malformed state must fail closed, got %+v", result)
			}
			after, err := os.ReadFile(statePath)
			if err != nil {
				t.Fatal(err)
			}
			if string(after) != tc.before {
				t.Fatalf("malformed state bytes changed:\nbefore=%q\nafter=%q", tc.before, after)
			}
		})
	}
}

// REQ-lifecycle-kernel-032: block and multi-line scalars, mirrored from
// scripts/lib/ospec-state.test.js.
func projectionDesignEnvelope() map[string]any {
	return map[string]any{
		"status":            "success",
		"executive_summary": "Designed stateless JWT auth.",
		"artifacts":         []any{"openspec/changes/jwt-auth/design.md"},
		"next_recommended":  "sdd-tasks",
		"risks":             "None",
		"skill_resolution":  "injected",
	}
}

func TestProjectPhaseCompletion_BlockAndMultilineScalarsStayOpaque(t *testing.T) {
	opaque := strings.Join([]string{
		"route:",
		"  actual_route: standard",
		"  route_rationale: >",
		"    The auth floor matched:",
		"    status: is part of the text, not a key",
		"",
		"    second paragraph",
		"  note: a plain scalar that",
		"    continues on the next line",
		"  quoted: \"a double-quoted scalar",
		"    that: also continues\"",
		"  single: 'it''s single-quoted",
		"    and continues'",
		"owner:",
		"  notes: |-",
		"    - not a sequence item",
		"    phases: not a key",
	}, "\n")
	notes := "    notes: |\n      status: fake\n      summary: fake"
	before := "change: jwt-auth\nstatus: planning\nrevision: 1\n" + opaque + "\nphases:\n  design:\n    status: pending\n" + notes + "\n  tasks:\n    status: pending\n"
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}

	result := ProjectPhaseCompletion(statePath, "design", projectionDesignEnvelope(), nil)
	if !result.OK || result.Outcome != "advanced" {
		t.Fatalf("block and multi-line scalars must not block the projection, got %+v", result)
	}
	afterBytes, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	after := string(afterBytes)
	for _, want := range []string{opaque, notes, "\n  design:\n    status: done\n", `summary: "Designed stateless JWT auth."`, "\n  tasks:\n    status: pending\n"} {
		if !strings.Contains(after, want) {
			t.Fatalf("projected state lacks %q:\n%s", want, after)
		}
	}
}

func TestProjectPhaseCompletion_ProjectedBlockScalarIsRewrittenOnOneLine(t *testing.T) {
	before := "change: jwt-auth\nstatus: >\n  planning\nlast_updated: \"2026-11-01\n  T00:00:00Z\"\nrevision: 1\nphases:\n  design:\n    status: pending\n    summary: |\n      An old summary\n      on two lines\n    artifact: design.md\n"
	statePath := filepath.Join(t.TempDir(), "state.yaml")
	if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
		t.Fatal(err)
	}

	result := ProjectPhaseCompletion(statePath, "design", projectionDesignEnvelope(), nil)
	if !result.OK {
		t.Fatalf("projection must succeed, got %+v", result)
	}
	afterBytes, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	after := string(afterBytes)
	lines := strings.Split(after, "\n")
	if lines[1] != "status: planning" || !strings.HasPrefix(lines[2], `last_updated: "`) || lines[3] != "revision: 2" {
		t.Fatalf("top-level keys must be rewritten on one line:\n%s", after)
	}
	for _, stale := range []string{"An old summary", "on two lines", `T00:00:00Z"`, "\n  planning\n"} {
		if strings.Contains(after, stale) {
			t.Fatalf("continuation %q survived the rewrite:\n%s", stale, after)
		}
	}
	if !strings.Contains(after, "    summary: \"Designed stateless JWT auth.\"\n    artifact: design.md\n") {
		t.Fatalf("summary must be rewritten in place:\n%s", after)
	}
}

func TestProjectPhaseCompletion_QuotedScalarThatNeverClosesFailsClosed(t *testing.T) {
	for name, before := range map[string]string{
		"before a less indented line": "change: jwt-auth\nstatus: planning\nphases:\n  design:\n    summary: 'open\n  tasks:\n    status: pending\n",
	} {
		t.Run(name, func(t *testing.T) {
			statePath := filepath.Join(t.TempDir(), "state.yaml")
			if err := os.WriteFile(statePath, []byte(before), 0644); err != nil {
				t.Fatal(err)
			}
			result := ProjectPhaseCompletion(statePath, "design", projectionDesignEnvelope(), nil)
			if result.OK || result.Outcome != "malformed-state" {
				t.Fatalf("an unclosed quoted scalar must fail closed, got %+v", result)
			}
			after, _ := os.ReadFile(statePath)
			if string(after) != before {
				t.Fatalf("state bytes changed:\n%s", after)
			}
		})
	}
}

// REQ-lifecycle-kernel-032 parity: Node and Go project the same state.yaml,
// with block and multi-line scalars, to the same bytes (last_updated aside).
func TestProjectPhaseCompletion_NodeAndGoProjectScalarsAlike(t *testing.T) {
	before := strings.Join([]string{
		"change: jwt-auth",
		"status: >",
		"  planning",
		"revision: 3",
		"route:",
		"  route_rationale: |",
		"    status: inside a block",
		"",
		"    tail",
		"  note: plain that",
		"    continues",
		"phases:",
		"  design:",
		"    status: pending",
		"    summary: \"old summary",
		"      on two lines\"",
		"    notes: >-",
		"      summary: fake",
		"  tasks:",
		"    status: pending",
		"",
	}, "\n")
	envelope := projectionDesignEnvelope()
	goPath := filepath.Join(t.TempDir(), "state.yaml")
	nodeDir := t.TempDir()
	for _, path := range []string{goPath, filepath.Join(nodeDir, "state.yaml")} {
		if err := os.WriteFile(path, []byte(before), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if result := ProjectPhaseCompletion(goPath, "design", envelope, nil); !result.OK {
		t.Fatalf("Go projection failed: %+v", result)
	}

	envelopeJSON, _ := json.Marshal(envelope)
	_, sourceFile, _, _ := runtime.Caller(0)
	stateModule := filepath.Join(filepath.Dir(sourceFile), "..", "..", "scripts", "lib", "ospec-state.js")
	const script = `const { projectPhaseCompletion } = require(process.argv[1]);
projectPhaseCompletion({ changePath: process.argv[2], phase: "design", envelope: JSON.parse(process.argv[3]) })
  .then((result) => { if (!result.ok) { console.error(JSON.stringify(result)); process.exit(1); } });`
	if output, err := exec.Command("node", "-e", script, stateModule, nodeDir, string(envelopeJSON)).CombinedOutput(); err != nil {
		t.Fatalf("Node projection failed: %v\n%s", err, output)
	}

	normalize := func(path string) string {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if strings.HasPrefix(line, "last_updated:") {
				lines[i] = "last_updated: <now>"
			}
		}
		return strings.Join(lines, "\n")
	}
	goState, nodeState := normalize(goPath), normalize(filepath.Join(nodeDir, "state.yaml"))
	if goState != nodeState {
		t.Fatalf("Node and Go projections differ:\n--- go\n%s\n--- node\n%s", goState, nodeState)
	}
	if !strings.Contains(goState, "    status: inside a block\n\n    tail\n") || !strings.Contains(goState, "    notes: >-\n      summary: fake\n") {
		t.Fatalf("opaque scalars changed:\n%s", goState)
	}
}
