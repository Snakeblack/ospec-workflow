package iddsession

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The same cases as countDeclaredChecks in scripts/hooks/idd-session.test.js.
func TestCountDeclaredChecks(t *testing.T) {
	cases := map[string]int{
		"":                            0,
		"checks:\n":                   0,
		"checks:\n  test: npm test\n": 1,
		"# c\nchecks:\n  test: a # b\n  lint: \"b\"\nmode: idd\n": 2,
		"checks:\n  # test: npm test\n":                           0,
		"checks:\n  test:\nimpact:\n  x: y\n":                     0,
		"impact:\n  test: npm test\n":                             0,
		"checks:\r\n  test: npm test\r\n":                         1,
	}
	for text, want := range cases {
		if got := CountDeclaredChecks(text); got != want {
			t.Errorf("CountDeclaredChecks(%q) = %d, want %d", text, got, want)
		}
	}
}

// DescribeStep orders steps as nextForChange does, which describeStep of
// scripts/hooks/lib/idd-session.js reads: an open gate is the user's decision
// and comes before the plan and every obligation, in gate order.
func TestDescribeStepAsksOpenGatesFirst(t *testing.T) {
	plan := json.RawMessage(`{"paths":["src/a.js"],"work_units":1,"decision":false,"operations":[]}`)
	gates := func(entries ...string) []*idStatus {
		var list []*idStatus
		for i := 0; i < len(entries); i += 2 {
			list = append(list, &idStatus{ID: entries[i], Status: entries[i+1]})
		}
		return list
	}
	pending := func(id string) []*idStatus { return []*idStatus{{ID: id, Status: "pending"}} }
	resolve := func(gate string) string {
		return "Resolve the `" + gate + "` gate with the user: `ospec next --change c` shows what to ask."
	}
	cases := []struct {
		name  string
		state State
		want  string
	}{
		{"ADR gate before the plan", State{Change: "c", Obligations: pending("checks-pass"), Gates: gates("adr-amend-or-contradict", "open")}, resolve("adr-amend-or-contradict")},
		{"irreversible gate before a pending obligation", State{Change: "c", Plan: plan, Obligations: pending("migration-compat-and-test"), Gates: gates("irreversible-operation", "open")}, resolve("irreversible-operation")},
		{"gates in gate order", State{Change: "c", Plan: plan, Obligations: pending("checks-pass"), Gates: gates("irreversible-operation", "open", "adr-amend-or-contradict", "open")}, resolve("adr-amend-or-contradict")},
		{"gate before missing checks", State{Change: "c", Plan: plan, Obligations: pending("checks-pass"), Gates: gates("irreversible-operation", "open")}, resolve("irreversible-operation")},
		{"a resolved gate lets the obligation through", State{Change: "c", Plan: plan, Obligations: pending("checks-pass"), Gates: gates("adr-amend-or-contradict", "resolved")}, "Satisfy `checks-pass` with check-run evidence: ospec check --change c; a run that reports tests 0 is not evidence."},
	}
	for _, tc := range cases {
		hasChecks := tc.name != "gate before missing checks"
		if got := DescribeStep(&tc.state, hasChecks); got != tc.want {
			t.Errorf("%s: DescribeStep = %q, want %q", tc.name, got, tc.want)
		}
	}
}

// The obligation of a signal the user's answer may retract names that way out,
// as describeStep of idd-session.js does: only ospec next reads the diff.
func TestDescribeStepNamesTheAnswerWayOut(t *testing.T) {
	plan := json.RawMessage(`{"paths":["src/a.js"],"work_units":1,"decision":false,"operations":[]}`)
	signal := func(id string) []*struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
		Source string `json:"source"`
	} {
		return []*struct {
			ID     string `json:"id"`
			Reason string `json:"reason"`
			Source string `json:"source"`
		}{{ID: id, Reason: "r", Source: "diff"}}
	}
	migration := State{Change: "c", Plan: plan, Signals: signal("persistent-data"), Obligations: []*idStatus{{ID: "migration-compat-and-test", Status: "pending"}}}
	want := "Satisfy `migration-compat-and-test` with migration-test evidence: ospec run --change c --obligation migration-compat-and-test --command \"<migration test>\" --plan \"<compatibility or rollback>\". If `persistent-data` may be a false positive, `ospec next --change c` says whether the user's answer can retract it instead."
	if got := DescribeStep(&migration, true); got != want {
		t.Errorf("DescribeStep = %q, want %q", got, want)
	}
	checks := State{Change: "c", Plan: plan, Signals: signal("persistent-data"), Obligations: []*idStatus{{ID: "checks-pass", Status: "pending"}}}
	if got := DescribeStep(&checks, true); got != "Satisfy `checks-pass` with check-run evidence: ospec check --change c; a run that reports tests 0 is not evidence." {
		t.Errorf("an obligation no such signal derives names no way out: %q", got)
	}
}

// A state the turn fence of retractions wrote (recorded_turn on its signals,
// the fence of the answer on its retractions) is read as before, and so is one
// written before it.
func TestOpenChangesReadsTheRetractionFence(t *testing.T) {
	src, err := os.ReadFile(filepath.Join("..", "testdata", "idd-session", "steps", "workspace", "idd", "s-migration", "state.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]any
	if err := json.Unmarshal(src, &state); err != nil {
		t.Fatal(err)
	}
	for _, signal := range state["signals"].([]any) {
		signal.(map[string]any)["recorded_turn"] = 3
	}
	state["retracted"] = []any{map[string]any{
		"id": "security-boundary", "reason": "security boundary: src/a.js adds code evaluation (CWE-94)", "source": "diff",
		"retract_reason": "constant", "confirmed_by": "security boundary: src/a.js adds code evaluation (CWE-94)",
		"hits": []string{"src/a.js adds code evaluation (CWE-94): eval(F)"}, "answer": "F is a constant.",
		"answer_source": "user-unverified", "declared_source": "user", "unverified_reason": "no turn ended between the signal's record and the answer",
		"recorded_turn": 3, "resolved_turn": 3,
	}}
	for name, raw := range map[string][]byte{"before": src, "fenced": mustJSON(t, state)} {
		workspace := t.TempDir()
		dir := filepath.Join(workspace, "idd", "s-migration")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "state.yaml"), raw, 0o644); err != nil {
			t.Fatal(err)
		}
		changes := OpenChanges(workspace)
		if len(changes) != 1 || changes[0].Change != "s-migration" {
			t.Fatalf("%s: OpenChanges = %d changes, want s-migration", name, len(changes))
		}
		if got := DescribeStep(changes[0], true); !strings.Contains(got, "If `persistent-data` may be a false positive") {
			t.Errorf("%s: DescribeStep = %q", name, got)
		}
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// The same plans as validatePlan of scripts/lib/idd-contract.js: the texts of
// the decisions (E4.16) come only with a declared decision, and never empty.
func TestValidPlanAcceptsDecisionTexts(t *testing.T) {
	cases := map[string]bool{
		``: true,
		`{"paths":[],"work_units":1,"decision":false,"operations":[]}`:                            true,
		`{"paths":["a"],"work_units":2,"decision":true,"operations":[],"decisions":["Keep A."]}`:  true,
		`{"paths":["a"],"work_units":2,"decision":false,"operations":[],"decisions":["Keep A."]}`: false,
		`{"paths":["a"],"work_units":2,"decision":true,"operations":[],"decisions":[]}`:           false,
		`{"paths":["a"],"work_units":2,"decision":true,"operations":[],"decisions":[""]}`:         false,
		`{"paths":["a"],"work_units":2,"decision":true,"operations":[],"extra":["x"]}`:            false,
		`{"paths":["a"],"work_units":0,"decision":true,"operations":[],"decisions":["Keep A."]}`:  false,
	}
	for raw, want := range cases {
		if got := validPlan(json.RawMessage(raw)); got != want {
			t.Errorf("validPlan(%s) = %v, want %v", raw, got, want)
		}
	}
}
