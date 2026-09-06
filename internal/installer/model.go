package installer

import (
	"encoding/json"
	"reflect"
)

type screen uint8

const (
	menuScreen screen = iota
	targetsScreen
	modelsScreen
	reviewScreen
	installingScreen
)

type action uint8

const (
	noAction action = iota
	quitAction
	installAction
)

// Model holds only the local, reversible state for the guided installer.
// Installation is wired as a separate boundary after this navigation slice.
type Model struct {
	plan              Plan
	screen            screen
	targetIndex       int
	agentIndex        int
	reviewBackFocused bool
	installing        bool
	width             int
	height            int
	targetOffset      int
	agentOffset       int
	reviewOffset      int
	selections        map[string]map[string]string
}

func NewModel(plan Plan) Model {
	m := Model{plan: plan, reviewBackFocused: true, width: 80, height: 24, selections: make(map[string]map[string]string)}
	for _, target := range plan.Targets {
		choices := make(map[string]string)
		for _, agent := range target.Agents {
			if agent.Selectable && len(agent.Choices) > 0 {
				choices[agent.ID] = defaultChoice(agent)
			}
		}
		m.selections[target.ID] = choices
	}
	return m
}

func (m *Model) handleKey(key string) action {
	if key == "q" || key == "ctrl+c" {
		return quitAction
	}
	if key == "esc" {
		m.back()
		return noAction
	}
	switch m.screen {
	case menuScreen:
		if key == "enter" && len(m.plan.Targets) > 0 {
			m.screen = targetsScreen
		}
	case targetsScreen:
		switch key {
		case "up", "k":
			m.targetIndex--
		case "down", "j":
			m.targetIndex++
		case "enter":
			m.openTarget()
		}
		m.targetIndex = clamp(m.targetIndex, 0, len(m.plan.Targets)-1)
	case modelsScreen:
		target, ok := m.target()
		if !ok {
			return noAction
		}
		switch key {
		case "up", "k":
			m.agentIndex--
		case "down", "j":
			m.agentIndex++
		case "left", "h":
			m.moveChoice(target, -1)
		case "right", "l":
			m.moveChoice(target, 1)
		case "enter":
			m.screen, m.reviewBackFocused = reviewScreen, true
		}
		m.agentIndex = clamp(m.agentIndex, 0, len(target.Agents)-1)
	case reviewScreen:
		switch key {
		case "left", "right", "h", "l", "tab":
			m.reviewBackFocused = !m.reviewBackFocused
		case "up", "k":
			m.reviewOffset--
		case "down", "j":
			m.reviewOffset++
		case "enter":
			if m.reviewBackFocused {
				m.back()
			} else if !m.installing {
				m.installing, m.screen = true, installingScreen
				return installAction
			}
		}
	}
	m.keepFocusVisible()
	return noAction
}

func (m *Model) openTarget() {
	target, ok := m.target()
	if !ok {
		return
	}
	m.agentIndex, m.agentOffset = 0, 0
	if m.editable(target) {
		m.screen = modelsScreen
		return
	}
	m.screen, m.reviewBackFocused = reviewScreen, true
}

func (m *Model) back() {
	switch m.screen {
	case targetsScreen:
		m.screen = menuScreen
	case modelsScreen:
		m.screen = targetsScreen
	case reviewScreen:
		target, ok := m.target()
		if ok && m.editable(target) {
			m.screen = modelsScreen
		} else {
			m.screen = targetsScreen
		}
	}
}

func (m Model) target() (Target, bool) {
	if m.targetIndex < 0 || m.targetIndex >= len(m.plan.Targets) {
		return Target{}, false
	}
	return m.plan.Targets[m.targetIndex], true
}

func (m Model) editable(target Target) bool {
	for _, agent := range target.Agents {
		if agent.Selectable && len(agent.Choices) > 0 {
			return true
		}
	}
	return false
}

func (m *Model) moveChoice(target Target, direction int) {
	if m.agentIndex < 0 || m.agentIndex >= len(target.Agents) {
		return
	}
	agent := target.Agents[m.agentIndex]
	if !agent.Selectable || len(agent.Choices) < 2 {
		return
	}
	selected := m.selections[target.ID][agent.ID]
	index := 0
	for candidate, choice := range agent.Choices {
		if choice.ID == selected {
			index = candidate
			break
		}
	}
	index = (index + direction + len(agent.Choices)) % len(agent.Choices)
	m.selections[target.ID][agent.ID] = agent.Choices[index].ID
}

func defaultChoice(agent Agent) string {
	var effective any
	if len(agent.Effective) > 0 && json.Unmarshal(agent.Effective, &effective) == nil {
		for _, choice := range agent.Choices {
			var value any
			if json.Unmarshal(choice.Value, &value) == nil && reflect.DeepEqual(effective, value) {
				return choice.ID
			}
		}
	}
	return agent.Choices[0].ID
}

// Selections returns all current, selectable choices for the active target.
func (m Model) Selections() map[string]string {
	target, ok := m.target()
	if !ok {
		return nil
	}
	result := make(map[string]string)
	for agent, choice := range m.selections[target.ID] {
		result[agent] = choice
	}
	return result
}

func (m Model) InstallRequested() bool { return m.installing }

// TargetID returns the selected adapter target for the reviewed request.
func (m Model) TargetID() string {
	target, ok := m.target()
	if !ok {
		return ""
	}
	return target.ID
}

// InstallRequest returns the reviewed, complete selection set only after an
// explicit Install action has transitioned the model out of review.
func (m Model) InstallRequest() (InstallRequest, bool) {
	if !m.installing || m.TargetID() == "" {
		return InstallRequest{}, false
	}
	return InstallRequest{Target: m.TargetID(), Selections: m.Selections()}, true
}

func (m *Model) keepFocusVisible() {
	rows := m.visibleRows()
	switch m.screen {
	case targetsScreen:
		m.targetOffset = visibleOffset(m.targetOffset, m.targetIndex, len(m.plan.Targets), rows)
	case modelsScreen:
		target, ok := m.target()
		if ok {
			m.agentOffset = visibleOffset(m.agentOffset, m.agentIndex, len(target.Agents), rows)
		}
	case reviewScreen:
		target, ok := m.target()
		if ok {
			m.reviewOffset = clamp(m.reviewOffset, 0, max(0, len(target.Agents)-rows))
		}
	}
}

func (m Model) visibleRows() int { return max(3, m.height-9) }

func visibleOffset(offset, focus, total, rows int) int {
	if focus < offset {
		offset = focus
	}
	if focus >= offset+rows {
		offset = focus - rows + 1
	}
	return clamp(offset, 0, max(0, total-rows))
}

func clamp(value, low, high int) int {
	if high < low || value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}
