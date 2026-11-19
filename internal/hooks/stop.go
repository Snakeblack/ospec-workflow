// stop hook handler.
// Ports runStop from scripts/hooks/stop.js.
// Always exits 0 and emits {"continue":true}, or {"decision":"block","reason"}
// when it asks the agent to continue an open IDD change (E1.51). Uses
// internal/store + internal/yamllite. It also counts the turn end in
// .ospec/turns (E1.49).
package hooks

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/iddsession"
	"github.com/snakeblack/ospec-workflow/internal/ospecdir"
	"github.com/snakeblack/ospec-workflow/internal/store"
	"github.com/snakeblack/ospec-workflow/internal/yamllite"
)

func init() {
	Register(&stopHandler{})
}

type stopHandler struct{}

func (h *stopHandler) Name() string { return "stop" }

// stopInput is the stdin payload for stop.
type stopInput struct {
	Cwd                 string `json:"cwd"`
	Timestamp           string `json:"timestamp"`
	SessionID           string `json:"sessionId"`
	SessionIDUnderscore string `json:"session_id"`
}

type stopOutput struct {
	Continue      bool    `json:"continue"`
	Status        string  `json:"status,omitempty"`
	Path          string  `json:"path,omitempty"`
	ActiveChange  *string `json:"activeChange,omitempty"`
	SystemMessage string  `json:"systemMessage,omitempty"`
}

func (h *stopHandler) Run(stdin []byte) ([]byte, int) {
	var input stopInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return continueWithError(fmt.Sprintf("Stop hook could not write the session trace: %s", err.Error())), 0
	}

	// E1.49: every turn end is counted in the project before the trace, so a
	// trace that cannot be written still counts it.
	workspace := turnsRoot(resolveCwd(input.Cwd))
	counted := countTurn(workspace)
	var raw map[string]any
	_ = json.Unmarshal(stdin, &raw)
	failure := ""
	if counted != nil {
		failure = fmt.Sprintf("Stop hook could not count the turn end: %s", counted.Error())
	}
	reason, warning, err := runStop(input, raw)
	if err != nil {
		failure = fmt.Sprintf("Stop hook could not write the session trace: %s", err.Error())
		reason, warning = "", ""
	}
	// A Stop that asks the agent to continue (E1.51) ended no turn, so it
	// takes back the one it counted. A count that failed may have landed (an
	// error after its rename), and a turn end it cannot take back stays
	// counted: the Stop then lets the turn end rather than ask to continue
	// with the count one turn ahead.
	if reason != "" && counted != nil {
		reason = ""
	} else if reason != "" {
		if err := uncountTurn(workspace); err != nil {
			failure = fmt.Sprintf("Stop hook could not take back the turn end: %s", err.Error())
			reason = ""
		}
	}
	return stopAnswer(failure, reason, warning), 0
}

// stopAnswer is stopOutput of stop.js: decision "block" with the reason asks
// the agent to continue (E1.51), which the launcher translates for each host;
// otherwise continue. Every failure and warning rides on systemMessage.
func stopAnswer(failure, reason, warning string) []byte {
	var messages []string
	for _, message := range []string{failure, warning} {
		if message != "" {
			messages = append(messages, message)
		}
	}
	systemMessage := strings.Join(messages, "\n")
	var answer any
	if reason != "" {
		answer = struct {
			Decision      string `json:"decision"`
			Reason        string `json:"reason"`
			SystemMessage string `json:"systemMessage,omitempty"`
		}{"block", reason, systemMessage}
	} else {
		answer = struct {
			Continue      bool   `json:"continue"`
			SystemMessage string `json:"systemMessage,omitempty"`
		}{true, systemMessage}
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(answer)
	return bytes.TrimRight(buf.Bytes(), "\n")
}

// maxTurn is the largest count the CLI reads (Number.MAX_SAFE_INTEGER).
const maxTurn = 1<<53 - 1

// turnsRoot is the directory whose count a turn end in cwd adds to: the first
// one up holding .git (a worktree's is a file), where the CLI reads it, else
// cwd (turnsRoot of scripts/lib/turn-fence.js).
func turnsRoot(cwd string) string {
	start, err := filepath.Abs(cwd)
	if err != nil {
		return cwd
	}
	for dir := start; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir
		}
		if filepath.Dir(dir) == dir {
			return start
		}
	}
}

// countTurnEnd adds one turn end to .ospec/turns of the workspace, which the
// CLI reads to fence the gates (countTurnEnd of scripts/lib/turn-fence.js); an
// unreadable count starts again.
func countTurnEnd(workspace string) error {
	turnsPath := filepath.Join(workspace, filepath.FromSlash(store.TurnsRelPath))
	if err := ospecdir.MkdirAll(filepath.Dir(turnsPath), 0755); err != nil {
		return fmt.Errorf("stop: mkdir: %w", err)
	}
	var turn uint64
	if data, err := os.ReadFile(turnsPath); err == nil {
		if n, err := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64); err == nil && n <= maxTurn {
			turn = n
		}
	}
	return store.WriteFileAtomic(turnsPath, strconv.FormatUint(turn+1, 10)+"\n")
}

// countTurn and uncountTurn are countTurnEnd and uncountTurnEnd, replaced in
// tests to make them fail.
var (
	countTurn   = countTurnEnd
	uncountTurn = uncountTurnEnd
)

// uncountTurnEnd takes back the turn end a Stop counted when it asks the agent
// to continue (uncountTurnEnd of scripts/lib/turn-fence.js); a count of 0 or
// none is left as it is.
func uncountTurnEnd(workspace string) error {
	turnsPath := filepath.Join(workspace, filepath.FromSlash(store.TurnsRelPath))
	data, err := os.ReadFile(turnsPath)
	if err != nil {
		return nil
	}
	turn, err := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64)
	if err != nil || turn == 0 || turn > maxTurn {
		return nil
	}
	return store.WriteFileAtomic(turnsPath, strconv.FormatUint(turn-1, 10)+"\n")
}

func runStop(input stopInput, raw map[string]any) (reason, warning string, err error) {
	workspace := resolveCwd(input.Cwd)
	s := store.NewStore(workspace)

	changes, err := s.FindActiveChanges()
	if err != nil {
		return "", "", err
	}
	if idd := iddsession.Read(workspace); len(idd) > 0 {
		if err := writeLatestWithIdd(s, workspace, input, changes, idd); err != nil {
			return "", "", err
		}
		// E1.51: after the trace, so a trace that cannot be written asks nothing.
		reason, warning = stopNudge(workspace, raw, idd)
		return reason, warning, nil
	}

	var activeChange *store.ActiveChange
	if len(changes) > 0 {
		activeChange = changes[0]
	}

	changeName := ""
	currentPhase := ""
	status := ""
	nextRecommended := ""

	if activeChange != nil {
		changeName = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "name"},
		})
		if changeName == "" {
			changeName = activeChange.DirectoryName
		}
		currentPhase = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "current_phase"},
			{"current_phase"},
			{"phase"},
		})
		status = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "status"},
			{"status"},
		})
		nextRecommended = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"next_recommended"},
		})
	}

	ts := resolveStopTimestamp(input)
	sessionID := resolveStopSessionID(input)

	detailedSummary := "None"
	if activeChange != nil {
		detailedSummary = detailedSummaryPath(s, workspace, activeChange.DirectoryName)
	}

	// Resolve next action.
	var nextAction string
	if activeChange != nil {
		nextAction = yamllite.FormatNextAction(nextRecommended, changeName)
	} else {
		nextAction = "Start a new session when more work is needed."
	}

	latestContent := renderLatestSummary(renderLatestArgs{
		hasChange:       activeChange != nil,
		changeName:      changeName,
		currentPhase:    currentPhase,
		status:          status,
		detailedSummary: detailedSummary,
		endedAt:         ts,
		sessionID:       sessionID,
		nextAction:      nextAction,
	})

	return "", "", writeLatest(s, latestContent)
}

// resolveStopTimestamp uses input.timestamp, else the current UTC time.
func resolveStopTimestamp(input stopInput) string {
	if ts := strings.TrimSpace(input.Timestamp); ts != "" {
		return ts
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

// resolveStopSessionID prefers sessionId, then session_id, else "unknown".
func resolveStopSessionID(input stopInput) string {
	if id := strings.TrimSpace(input.SessionID); id != "" {
		return id
	}
	if id := strings.TrimSpace(input.SessionIDUnderscore); id != "" {
		return id
	}
	return "unknown"
}

func writeLatest(s *store.Store, content string) error {
	latestPath := s.LatestSessionPath()
	if err := ospecdir.MkdirAll(filepath.Dir(latestPath), 0755); err != nil {
		return fmt.Errorf("stop: mkdir: %w", err)
	}
	return store.WriteFileAtomic(latestPath, content)
}

// detailedSummaryPath is the portable path of a change's session summary, or
// "None" when PreCompact has not written it.
func detailedSummaryPath(s *store.Store, workspace, changeName string) string {
	summaryPath := s.SessionSummaryPath(changeName)
	info, err := os.Stat(summaryPath)
	if err != nil || !info.Mode().IsRegular() {
		return "None"
	}
	if rel, err := filepath.Rel(workspace, summaryPath); err == nil {
		return filepath.ToSlash(rel)
	}
	return filepath.ToSlash(summaryPath)
}

// writeLatestWithIdd is writeWithIdd of stop.js (E1.12, spec §6.4): one open
// change in total is the active change; several are listed without choosing
// one, SDD first and then IDD by id.
func writeLatestWithIdd(s *store.Store, workspace string, input stopInput, sdd []*store.ActiveChange, idd []iddsession.Entry) error {
	type openChange struct{ name, mode, nextAction string }
	var open []openChange
	for _, change := range sdd {
		name := yamllite.ExtractFirstScalar(change.Content, [][]string{{"change", "name"}})
		if name == "" {
			name = change.DirectoryName
		}
		next := yamllite.ExtractFirstScalar(change.Content, [][]string{{"next_recommended"}})
		open = append(open, openChange{name, "sdd", yamllite.FormatNextAction(next, name)})
	}
	for _, entry := range idd {
		open = append(open, openChange{entry.Change, "idd", entry.NextAction})
	}

	ts := resolveStopTimestamp(input)
	sessionID := resolveStopSessionID(input)
	if len(open) == 1 {
		entry := idd[0]
		return writeLatest(s, renderLatestSummary(renderLatestArgs{
			hasChange:       true,
			changeName:      entry.Change,
			currentPhase:    "idd",
			status:          entry.State.Status,
			detailedSummary: detailedSummaryPath(s, workspace, entry.Change),
			endedAt:         ts,
			sessionID:       sessionID,
			nextAction:      entry.NextAction,
		}))
	}

	names := make([]string, len(open))
	steps := []string{"Several changes are open; choose the one to resume:"}
	for i, change := range open {
		names[i] = "`" + change.name + "`"
		steps = append(steps, "- `"+change.name+"` ("+change.mode+"): "+change.nextAction)
	}
	lines := []string{
		"# Latest Session",
		"",
		"- Ended at: `" + ts + "`",
		"- Session: `" + sessionID + "`",
		"- Active change: " + strings.Join(names, ", ") + fmt.Sprintf(" (ambiguous: %d open changes)", len(open)),
		"- Current phase: `multiple`",
		"- Change status: `multiple`",
		"- Detailed summary: `None`",
		"",
		"## Next recommended action",
		strings.Join(steps, "\n"),
		"",
	}
	return writeLatest(s, strings.Join(lines, "\n"))
}

// renderLatestArgs bundles all rendering parameters.
type renderLatestArgs struct {
	hasChange       bool
	changeName      string
	currentPhase    string
	status          string
	detailedSummary string
	endedAt         string
	sessionID       string
	nextAction      string
}

// renderLatestSummary ports renderLatestSummary from stop.js.
func renderLatestSummary(a renderLatestArgs) string {
	activeChangeVal := "`None`"
	if a.hasChange {
		activeChangeVal = "`" + a.changeName + "`"
	}
	currentPhaseVal := "`None`"
	if a.hasChange {
		p := a.currentPhase
		if p == "" {
			p = "unknown"
		}
		currentPhaseVal = "`" + p + "`"
	}
	statusVal := "`None`"
	if a.hasChange {
		st := a.status
		if st == "" {
			st = "active"
		}
		statusVal = "`" + st + "`"
	}

	lines := []string{
		"# Latest Session",
		"",
		"- Ended at: `" + a.endedAt + "`",
		"- Session: `" + a.sessionID + "`",
		"- Active change: " + activeChangeVal,
		"- Current phase: " + currentPhaseVal,
		"- Change status: " + statusVal,
		"- Detailed summary: `" + a.detailedSummary + "`",
		"",
		"## Next recommended action",
		a.nextAction,
		"",
	}
	return strings.Join(lines, "\n")
}
