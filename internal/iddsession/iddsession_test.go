package iddsession

import (
	"encoding/json"
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
