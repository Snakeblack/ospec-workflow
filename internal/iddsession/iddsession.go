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
	_ "embed"
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

// catalogJSON is the IDD catalog the CLI emits (scripts/lib/idd-catalog.js,
// E1.42): Go keeps no list of its own, and idd-catalog.test.js fails while
// the file is stale.
//
//go:embed catalog.json
var catalogJSON []byte

type catalogFile struct {
	ChangePlaceholder string `json:"change_placeholder"`
	Signals           []struct {
		ID         string `json:"id"`
		Obligation string `json:"obligation"`
	} `json:"signals"`
	Obligations []struct {
		ID       string `json:"id"`
		Evidence string `json:"evidence"`
		How      string `json:"how"`
	} `json:"obligations"`
	WorkOrder          []string `json:"work_order"`
	Gates              []string `json:"gates"`
	ChecksRequired     []string `json:"checks_required"`
	SignalSources      []string `json:"signal_sources"`
	IntentKinds        []string `json:"intent_kinds"`
	ObligationStatuses []string `json:"obligation_statuses"`
	GateStatuses       []string `json:"gate_statuses"`
}

var (
	changePlaceholder string
	// workOrder is WORK_ORDER of idd-next.js: the order pending obligations are worked.
	workOrder []string
	// gateOrder is GATES of idd-contract.js.
	gateOrder []string
	// evidenceKinds is the obligation → evidence kind catalog of idd-contract.js.
	evidenceKinds = map[string]string{}
	// how is HOW of idd-next.js, with changePlaceholder for the change id.
	how = map[string]string{}
	// checksRequired is CHECKS_REQUIRED of idd-next.js.
	checksRequired map[string]bool
	// signalIDs, intentKinds and the status sets are the catalog of idd-contract.js.
	signalIDs          = map[string]bool{}
	signalSources      map[string]bool
	intentKinds        map[string]bool
	obligationStatuses map[string]bool
	gateStatuses       map[string]bool
)

func setOf(ids []string) map[string]bool {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set
}

func init() {
	var catalog catalogFile
	if err := json.Unmarshal(catalogJSON, &catalog); err != nil {
		panic("iddsession: failed to parse embedded catalog.json: " + err.Error())
	}
	changePlaceholder = catalog.ChangePlaceholder
	workOrder = catalog.WorkOrder
	gateOrder = catalog.Gates
	for _, signal := range catalog.Signals {
		signalIDs[signal.ID] = true
	}
	for _, obligation := range catalog.Obligations {
		evidenceKinds[obligation.ID] = obligation.Evidence
		how[obligation.ID] = obligation.How
	}
	checksRequired = setOf(catalog.ChecksRequired)
	signalSources = setOf(catalog.SignalSources)
	intentKinds = setOf(catalog.IntentKinds)
	obligationStatuses = setOf(catalog.ObligationStatuses)
	gateStatuses = setOf(catalog.GateStatuses)
}

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
// with exactly paths, work_units (at least 1), decision and operations, plus
// the texts of its decisions when there is one (E4.16).
func validPlan(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return true
	}
	var keys map[string]json.RawMessage
	if json.Unmarshal(raw, &keys) != nil {
		return false
	}
	var plan struct {
		Paths      *[]string `json:"paths"`
		WorkUnits  *int      `json:"work_units"`
		Decision   *bool     `json:"decision"`
		Operations *[]string `json:"operations"`
		Decisions  *[]string `json:"decisions"`
	}
	if json.Unmarshal(raw, &plan) != nil || plan.Paths == nil || plan.WorkUnits == nil || plan.Decision == nil || plan.Operations == nil {
		return false
	}
	fields := 4
	lists := [][]string{*plan.Paths, *plan.Operations}
	if _, ok := keys["decisions"]; ok {
		if plan.Decisions == nil || len(*plan.Decisions) == 0 || !*plan.Decision {
			return false
		}
		fields = 5
		lists = append(lists, *plan.Decisions)
	}
	if len(keys) != fields {
		return false
	}
	for _, list := range lists {
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
	// Every gate is the user's decision, taken before the work it decides.
	if open := s.OpenGates(); len(open) > 0 {
		return resolveGate(open[0])
	}
	if !s.planDeclared() {
		return "Declare the plan: `ospec signals --change " + change + " --path <file>... [--work-units <n>] [--decision \"<text>\"]... [--operation <op>]`."
	}
	if pending := s.PendingObligations(); len(pending) > 0 {
		first := pending[0]
		if !hasChecks && checksRequired[first] {
			return "Configure the project checks before `checks-pass`: `ospec next --change " + change + "` proposes the command, which needs the user's approval."
		}
		return "Satisfy `" + first + "` with " + evidenceKinds[first] + " evidence: " + strings.ReplaceAll(how[first], changePlaceholder, change) + "."
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
