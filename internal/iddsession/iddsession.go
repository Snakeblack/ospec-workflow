// Package iddsession is the Go port of scripts/hooks/lib/idd-session.js
// (E1.12 session-hook-idd): what the Stop and PreCompact hooks know about the
// open IDD changes of a workspace and the next step `ospec next` gives each.
//
// It reads idd/<change>/state.yaml (idd-state/v1, written by the ospec CLI as
// JSON) and never writes, locks or recovers it: an unreadable state is
// skipped. The next step mirrors nextForChange of scripts/lib/idd-next.js;
// the golden cases of internal/testdata/idd-session/ keep both byte-identical.
package iddsession

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	changeRoot  = "idd"
	archiveDir  = "archive"
	stateFile   = "state.yaml"
	stateSchema = "idd-state/v1"
)

var changeIDPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// workOrder is WORK_ORDER of idd-next.js: the order pending obligations are worked.
var workOrder = []string{
	"repro-test",
	"tdd-red-green",
	"contract-spec-and-test",
	"migration-compat-and-test",
	"adr-impact-declaration",
	"trust-review",
	"checks-pass",
	"living-doc",
}

// gateOrder is GATES of idd-contract.js.
var gateOrder = []string{"ambiguous-intent", "open-facts", "adr-amend-or-contradict", "irreversible-operation"}

// evidenceKinds is the obligation → evidence kind catalog of idd-contract.js.
var evidenceKinds = map[string]string{
	"checks-pass":               "check-run",
	"tdd-red-green":             "tdd-red-green",
	"repro-test":                "repro-run-pair",
	"living-doc":                "living-doc-current",
	"contract-spec-and-test":    "contract-spec-and-test",
	"migration-compat-and-test": "migration-test",
	"trust-review":              "frozen-review",
	"adr-impact-declaration":    "adr-impact-declaration",
}

// how is HOW of idd-next.js: the command that records each obligation's evidence.
var how = map[string]func(change string) string{
	"checks-pass": func(c string) string { return "ospec check --change " + c },
	"repro-test": func(c string) string {
		return "ospec run --change " + c + ` --obligation repro-test --command "<test>": once failing before the fix, again passing after it`
	},
	"tdd-red-green": func(c string) string {
		return "ospec run --change " + c + ` --obligation tdd-red-green --command "<test>" [--unit <name>]: failing before the code, passing after it`
	},
	"contract-spec-and-test": func(c string) string {
		return "update the contract document and its test, then ospec check --change " + c
	},
	"living-doc": func(c string) string {
		return "write the Plan and Decisions of idd/" + c + "/change.md, then ospec close --change " + c
	},
	"trust-review": func(c string) string {
		return "ospec review start --change " + c + ", dispatch review-trust on the returned paths, then ospec review record --change " + c + " --result '<findings json>'"
	},
	"migration-compat-and-test": func(c string) string {
		return "ospec run --change " + c + ` --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>"`
	},
}

// signalIDs, intentKinds and the status sets are the catalog of idd-contract.js.
var (
	signalIDs = map[string]bool{
		"always": true, "strict-tdd": true, "bug-fix": true, "multi-unit-or-decision": true,
		"public-contract": true, "persistent-data": true, "security-boundary": true, "adr-or-quality-attribute": true,
	}
	signalSources      = map[string]bool{"declaration": true, "diff": true}
	intentKinds        = map[string]bool{"bug": true, "feature": true, "refactor": true, "docs": true}
	obligationStatuses = map[string]bool{"pending": true, "satisfied": true, "withdrawn": true}
	gateStatuses       = map[string]bool{"open": true, "resolved": true}
)

type idStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// State holds the fields of idd-state/v1 the session files need.
type State struct {
	Schema string `json:"schema"`
	Change string `json:"change"`
	Mode   string `json:"mode"`
	Status string `json:"status"`
	Intent *struct {
		Request *string `json:"request"`
		Kind    *string `json:"kind"`
		Summary *string `json:"summary"`
	} `json:"intent"`
	Plan    json.RawMessage `json:"plan"`
	Signals []*struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
		Source string `json:"source"`
	} `json:"signals"`
	Obligations []*idStatus       `json:"obligations"`
	Gates       []*idStatus       `json:"gates"`
	Evidence    []json.RawMessage `json:"evidence"`
	Runs        []json.RawMessage `json:"runs"`
}

// Entry is an open IDD change with the next step the session files show.
type Entry struct {
	Change     string
	State      *State
	NextAction string
}

// Read returns the open IDD changes of workspace, by id, with their next
// step. Whatever it cannot read is skipped, so it never fails (spec §4.7).
func Read(workspace string) []Entry {
	states := OpenChanges(workspace)
	if len(states) == 0 {
		return nil
	}
	hasChecks := checksDeclared(workspace)
	entries := make([]Entry, 0, len(states))
	for _, state := range states {
		entries = append(entries, Entry{Change: state.Change, State: state, NextAction: DescribeStep(state, hasChecks)})
	}
	return entries
}

// OpenChanges lists the readable open changes under idd/, sorted by id.
func OpenChanges(workspace string) []*State {
	entries, err := os.ReadDir(filepath.Join(workspace, changeRoot))
	if err != nil {
		return nil // unreadable idd/: no open IDD change (spec §4.7)
	}
	var ids []string
	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != archiveDir {
			ids = append(ids, entry.Name())
		}
	}
	sort.Strings(ids)
	var states []*State
	for _, id := range ids {
		if state := readOpenState(workspace, id); state != nil {
			states = append(states, state)
		}
	}
	return states
}

// readOpenState returns the open state of change id, or nil when it is
// missing, a directory, unreadable, malformed or not open (spec §4.7).
func readOpenState(workspace, id string) *State {
	if !changeIDPattern.MatchString(id) {
		return nil
	}
	raw, err := os.ReadFile(filepath.Join(workspace, changeRoot, id, stateFile))
	if err != nil {
		return nil
	}
	var state State
	if err := json.Unmarshal(raw, &state); err != nil || !state.valid(id) {
		return nil
	}
	return &state
}

func isObject(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return strings.HasPrefix(trimmed, "{")
}

// validPlan mirrors validatePlan of idd-contract.js: absent, or an object
// with exactly paths, work_units (at least 1), decision and operations.
func validPlan(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var keys map[string]json.RawMessage
	if json.Unmarshal(raw, &keys) != nil || len(keys) != 4 {
		return false
	}
	var plan struct {
		Paths      *[]string `json:"paths"`
		WorkUnits  *int      `json:"work_units"`
		Decision   *bool     `json:"decision"`
		Operations *[]string `json:"operations"`
	}
	if json.Unmarshal(raw, &plan) != nil || plan.Paths == nil || plan.WorkUnits == nil || plan.Decision == nil || plan.Operations == nil {
		return false
	}
	for _, list := range [][]string{*plan.Paths, *plan.Operations} {
		for _, entry := range list {
			if entry == "" {
				return false
			}
		}
	}
	return *plan.WorkUnits >= 1
}

// valid checks the shape and the catalog the session files rely on, so the
// Go hooks only render ids and statuses the CLI could have written. It is a
// subset of validateState: a state it accepts renders only catalog text.
func (s *State) valid(id string) bool {
	if s.Schema != stateSchema || s.Mode != "idd" || s.Change != id || s.Status != "open" || s.Intent == nil || !validPlan(s.Plan) {
		return false
	}
	for _, signal := range s.Signals {
		if signal == nil || !signalIDs[signal.ID] || !signalSources[signal.Source] || signal.Reason == "" {
			return false
		}
	}
	for _, obligation := range s.Obligations {
		if obligation == nil || evidenceKinds[obligation.ID] == "" || !obligationStatuses[obligation.Status] {
			return false
		}
	}
	for _, gate := range s.Gates {
		if gate == nil || indexOf(gateOrder, gate.ID) == len(gateOrder) || !gateStatuses[gate.Status] {
			return false
		}
	}
	for _, entries := range [][]json.RawMessage{s.Evidence, s.Runs} {
		for _, entry := range entries {
			if !isObject(entry) {
				return false
			}
		}
	}
	if s.gateOpen("ambiguous-intent") {
		return s.Intent.Kind == nil && text(s.Intent.Request) != ""
	}
	return s.Intent.Kind != nil && intentKinds[*s.Intent.Kind] && text(s.Intent.Summary) != ""
}

var (
	checksSection = regexp.MustCompile(`^checks:\s*$`)
	checkEntry    = regexp.MustCompile(`^\s+[A-Za-z0-9_-]+:\s*[^\s#]`)
	commentLine   = regexp.MustCompile(`^\s*#`)
	newline       = regexp.MustCompile(`\r?\n`)
)

// CountDeclaredChecks counts the `name: command` lines under the top-level
// `checks:` section of idd/config.yaml, as countDeclaredChecks does.
func CountDeclaredChecks(text string) int {
	inChecks := false
	count := 0
	for _, line := range newline.Split(text, -1) {
		if strings.TrimSpace(line) == "" || commentLine.MatchString(line) {
			continue
		}
		if first, _ := utf8.DecodeRuneInString(line); !unicode.IsSpace(first) {
			inChecks = checksSection.MatchString(line)
			continue
		}
		if inChecks && checkEntry.MatchString(line) {
			count++
		}
	}
	return count
}

// checksDeclared reports whether idd/config.yaml declares a check; an
// unreadable configuration declares none.
func checksDeclared(workspace string) bool {
	raw, err := os.ReadFile(filepath.Join(workspace, changeRoot, "config.yaml"))
	return err == nil && CountDeclaredChecks(string(raw)) > 0
}

func indexOf(list []string, id string) int {
	for i, entry := range list {
		if entry == id {
			return i
		}
	}
	return len(list)
}

func (s *State) gateOpen(id string) bool {
	for _, gate := range s.Gates {
		if gate.ID == id && gate.Status == "open" {
			return true
		}
	}
	return false
}

// PendingObligations returns the pending obligations in work order.
func (s *State) PendingObligations() []string {
	var pending []string
	for _, obligation := range s.Obligations {
		if obligation.Status == "pending" {
			pending = append(pending, obligation.ID)
		}
	}
	sort.SliceStable(pending, func(i, j int) bool { return indexOf(workOrder, pending[i]) < indexOf(workOrder, pending[j]) })
	return pending
}

// OpenGates returns the open gates in gate order.
func (s *State) OpenGates() []string {
	var open []string
	for _, gate := range s.Gates {
		if gate.Status == "open" {
			open = append(open, gate.ID)
		}
	}
	sort.SliceStable(open, func(i, j int) bool { return indexOf(gateOrder, open[i]) < indexOf(gateOrder, open[j]) })
	return open
}

// planDeclared mirrors planDeclared of idd-next.js.
func (s *State) planDeclared() bool {
	if len(s.Plan) > 0 && string(s.Plan) != "null" {
		return true
	}
	for _, signal := range s.Signals {
		if signal.Source == "diff" {
			return true
		}
	}
	return len(s.Runs) > 0
}

// DescribeStep is describeStep of idd-session.js: the next step of an open
// change, as one line of the session files.
func DescribeStep(s *State, hasChecks bool) string {
	change := s.Change
	resolveGate := func(gate string) string {
		return "Resolve the `" + gate + "` gate with the user: `ospec next --change " + change + "` shows what to ask."
	}
	if s.gateOpen("ambiguous-intent") {
		return resolveGate("ambiguous-intent")
	}
	if s.gateOpen("open-facts") {
		return resolveGate("open-facts")
	}
	if !s.planDeclared() {
		return "Declare the plan: `ospec signals --change " + change + " --path <file>... [--work-units <n>] [--decision] [--operation <op>]`."
	}
	if pending := s.PendingObligations(); len(pending) > 0 {
		first := pending[0]
		if !hasChecks && (first == "checks-pass" || first == "contract-spec-and-test") {
			return "Configure the project checks before `checks-pass`: `ospec next --change " + change + "` proposes the command, which needs the user's approval."
		}
		step, ok := how[first]
		if !ok {
			return "Satisfy `" + first + "` with " + evidenceKinds[first] + " evidence: run `ospec next --change " + change + "`."
		}
		return "Satisfy `" + first + "` with " + evidenceKinds[first] + " evidence: " + step(change) + "."
	}
	if open := s.OpenGates(); len(open) > 0 {
		return resolveGate(open[0])
	}
	return "Close it: `ospec close --change " + change + "`."
}

func renderList(values []string) string {
	if len(values) == 0 {
		return "- None"
	}
	lines := make([]string, len(values))
	for i, value := range values {
		lines[i] = "- " + value
	}
	return strings.Join(lines, "\n")
}

func text(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// RenderSummary is renderIddSummary of idd-session.js: the detailed session
// summary PreCompact writes for an open IDD change.
func RenderSummary(s *State, nextAction string) string {
	intent := "ambiguous: " + text(s.Intent.Request)
	if s.Intent.Kind != nil && *s.Intent.Kind != "" {
		intent = *s.Intent.Kind + ": " + text(s.Intent.Summary)
	}
	return strings.Join([]string{
		"# Session Summary",
		"",
		"## Active change",
		"`" + s.Change + "` (IDD)",
		"",
		"## Intent",
		intent,
		"",
		"## Pending obligations",
		renderList(s.PendingObligations()),
		"",
		"## Open gates",
		renderList(s.OpenGates()),
		"",
		"## Next recommended action",
		nextAction,
		"",
	}, "\n")
}
