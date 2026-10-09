// stop hook handler.
// Ports runStop from scripts/hooks/stop.js.
// Always exits 0 and emits {"continue":true}. Uses internal/store + internal/yamllite.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/iddsession"
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

	if err := runStop(input); err != nil {
		return continueWithError(fmt.Sprintf("Stop hook could not write the session trace: %s", err.Error())), 0
	}

	b, _ := json.Marshal(map[string]bool{"continue": true})
	return b, 0
}

func runStop(input stopInput) error {
	workspace := resolveCwd(input.Cwd)
	s := store.NewStore(workspace)

	changes, err := s.FindActiveChanges()
	if err != nil {
		return err
	}
	if idd := iddsession.Read(workspace); len(idd) > 0 {
		return writeLatestWithIdd(s, workspace, input, changes, idd)
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

	return writeLatest(s, latestContent)
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
	if err := os.MkdirAll(filepath.Dir(latestPath), 0755); err != nil {
		return fmt.Errorf("stop: mkdir: %w", err)
	}
	return os.WriteFile(latestPath, []byte(content), 0644)
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
