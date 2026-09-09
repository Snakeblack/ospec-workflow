package installer

import (
	"encoding/json"
	"reflect"
	"strings"
)

type screen uint8

const (
	menuScreen screen = iota
	targetsScreen
	presetsScreen
	modelsScreen
	controlsScreen
	reviewScreen
	installingScreen
)

type action uint8

const (
	noAction action = iota
	quitAction
	installAction
)

// Model owns navigation only. It never interprets target values: choice IDs and
// control names travel unchanged to the adapter for fresh-plan validation.
type Model struct {
	plan                                 Plan
	screen                               screen
	targetIndex, agentIndex, choiceIndex int
	width, height                        int
	reviewBackFocused, installing        bool
	mode, presetID, activeControl        string
	selections                           map[string]map[string]Selection
	queries                              map[string]map[string]string
}

func NewModel(plan Plan) Model {
	m := Model{plan: plan, width: 80, height: 24, reviewBackFocused: true, selections: map[string]map[string]Selection{}, queries: map[string]map[string]string{}}
	for _, target := range plan.Targets {
		m.selections[target.ID] = map[string]Selection{}
		m.queries[target.ID] = map[string]string{}
		for _, agent := range target.Agents {
			if agent.Selectable && len(agent.Choices) > 0 {
				m.selections[target.ID][agent.ID] = Selection{ChoiceID: defaultChoice(agent), Controls: map[string]string{}}
			}
		}
	}
	return m
}
func (m *Model) handleKey(key string) action {
	if key == "ctrl+c" || (key == "q" && m.screen != modelsScreen) {
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
		if key == "up" || key == "k" {
			m.targetIndex--
		}
		if key == "down" || key == "j" {
			m.targetIndex++
		}
		m.targetIndex = clamp(m.targetIndex, 0, len(m.plan.Targets)-1)
		if key == "enter" {
			m.openTarget()
		}
	case presetsScreen:
		if key == "up" || key == "k" {
			m.choiceIndex--
		}
		if key == "down" || key == "j" {
			m.choiceIndex++
		}
		target, _ := m.target()
		m.choiceIndex = clamp(m.choiceIndex, 0, len(target.Presets))
		if key == "enter" {
			if m.choiceIndex < len(target.Presets) {
				p := target.Presets[m.choiceIndex]
				m.mode, m.presetID = "preset", p.ID
				m.selections[target.ID] = cloneSelections(p.Selections)
				m.screen = reviewScreen
			} else {
				m.mode, m.presetID = "custom", ""
				m.agentIndex = 0
				m.screen = modelsScreen
			}
		}
	case modelsScreen:
		target, ok := m.target()
		if !ok {
			return noAction
		}
		agent := target.Agents[m.agentIndex]
		// Typing has priority over navigation, preserving q/j/k searches.
		if len(key) == 1 && key >= " " && key <= "~" {
			m.queries[target.ID][agent.ID] += key
			return noAction
		}
		if key == "backspace" {
			q := m.queries[target.ID][agent.ID]
			if len(q) > 0 {
				m.queries[target.ID][agent.ID] = q[:len(q)-1]
			}
			return noAction
		}
		if key == "up" || key == "k" {
			m.agentIndex--
		}
		if key == "down" || key == "j" {
			m.agentIndex++
		}
		m.agentIndex = clamp(m.agentIndex, 0, len(target.Agents)-1)
		if key == "left" || key == "h" {
			m.moveChoice(target, -1)
		}
		if key == "right" || key == "l" {
			m.moveChoice(target, 1)
		}
		if key == "enter" {
			if m.hasControls(target, agent) {
				m.activeControl = m.controlName(target, agent)
				m.ensureControlDefault(target, agent, m.activeControl)
				m.screen = controlsScreen
			} else {
				m.screen = reviewScreen
			}
		}
	case controlsScreen:
		target, _ := m.target()
		agent := target.Agents[m.agentIndex]
		control := m.controlFor(target, agent)
		if key == "up" || key == "k" {
			m.moveControl(target, agent, control, -1)
		}
		if key == "down" || key == "j" {
			m.moveControl(target, agent, control, 1)
		}
		if key == "enter" {
			// Confirming a finite control completes this custom selection. Review
			// remains the explicit boundary before any installer side effect.
			m.screen = reviewScreen
		}
	case reviewScreen:
		if key == "left" || key == "right" || key == "h" || key == "l" || key == "tab" {
			m.reviewBackFocused = !m.reviewBackFocused
		}
		if key == "enter" {
			if m.reviewBackFocused {
				m.back()
			} else if !m.installing {
				m.installing = true
				m.screen = installingScreen
				return installAction
			}
		}
	}
	return noAction
}
func (m *Model) openTarget() {
	target, ok := m.target()
	if !ok {
		return
	}
	m.agentIndex = 0
	if target.Inherited {
		m.mode, m.presetID = "inherited", ""
		m.screen = reviewScreen
	} else {
		m.choiceIndex = 0
		m.screen = presetsScreen
	}
}
func (m *Model) back() {
	switch m.screen {
	case targetsScreen:
		m.screen = menuScreen
	case presetsScreen:
		m.screen = targetsScreen
	case modelsScreen:
		m.screen = presetsScreen
	case controlsScreen:
		m.screen = modelsScreen
	case reviewScreen:
		target, _ := m.target()
		if target.Inherited {
			m.screen = targetsScreen
		} else if m.mode == "custom" {
			m.screen = modelsScreen
		} else {
			m.screen = presetsScreen
		}
	}
}
func (m Model) target() (Target, bool) {
	if m.targetIndex < 0 || m.targetIndex >= len(m.plan.Targets) {
		return Target{}, false
	}
	return m.plan.Targets[m.targetIndex], true
}
func (m *Model) moveChoice(target Target, direction int) {
	if m.agentIndex < 0 || m.agentIndex >= len(target.Agents) {
		return
	}
	agent := target.Agents[m.agentIndex]
	if !agent.Selectable || len(agent.Choices) < 2 {
		return
	}
	list := m.filtered(agent, m.queries[target.ID][agent.ID])
	if len(list) < 2 {
		return
	}
	current := m.selections[target.ID][agent.ID].ChoiceID
	index := 0
	for i, c := range list {
		if c.ID == current {
			index = i
		}
	}
	index = (index + direction + len(list)) % len(list)
	choice := list[index]
	old := m.selections[target.ID][agent.ID]
	old.ChoiceID = choice.ID
	old.Controls = validControls(choice, old.Controls)
	m.selections[target.ID][agent.ID] = old
}
func (m Model) filtered(agent Agent, query string) []Choice {
	if query == "" {
		return agent.Choices
	}
	out := []Choice{}
	q := strings.ToLower(query)
	for _, choice := range agent.Choices {
		if strings.Contains(strings.ToLower(choice.Label), q) {
			out = append(out, choice)
		}
	}
	return out
}
func (m Model) hasControls(target Target, agent Agent) bool {
	return len(m.controlFor(target, agent).Values) > 0
}
func (m Model) controlFor(target Target, agent Agent) Control {
	selected := m.selections[target.ID][agent.ID]
	for _, choice := range agent.Choices {
		if choice.ID == selected.ChoiceID {
			for _, control := range choice.Controls {
				return control
			}
		}
	}
	return Control{}
}

func (m Model) controlName(target Target, agent Agent) string {
	selected := m.selections[target.ID][agent.ID]
	for _, choice := range agent.Choices {
		if choice.ID == selected.ChoiceID {
			for name := range choice.Controls {
				return name
			}
		}
	}
	return ""
}

func (m *Model) ensureControlDefault(target Target, agent Agent, name string) {
	if name == "" {
		return
	}
	selection := m.selections[target.ID][agent.ID]
	if selection.Controls == nil {
		selection.Controls = map[string]string{}
	}
	if selection.Controls[name] != "" {
		return
	}
	for _, choice := range agent.Choices {
		if choice.ID == selection.ChoiceID {
			if control, ok := choice.Controls[name]; ok {
				selection.Controls[name] = control.Default
			}
		}
	}
	m.selections[target.ID][agent.ID] = selection
}
func (m *Model) moveControl(target Target, agent Agent, control Control, direction int) {
	if len(control.Values) == 0 {
		return
	}
	selection := m.selections[target.ID][agent.ID]
	name := m.controlName(target, agent)
	current := selection.Controls[name]
	index := 0
	for i, v := range control.Values {
		if v == current {
			index = i
		}
	}
	index = (index + direction + len(control.Values)) % len(control.Values)
	if selection.Controls == nil {
		selection.Controls = map[string]string{}
	}
	selection.Controls[name] = control.Values[index]
	m.selections[target.ID][agent.ID] = selection
}
func defaultChoice(agent Agent) string {
	var effective any
	if json.Unmarshal(agent.Effective, &effective) == nil {
		for _, choice := range agent.Choices {
			var value any
			if json.Unmarshal(choice.Value, &value) == nil && reflect.DeepEqual(effective, value) {
				return choice.ID
			}
		}
	}
	return agent.Choices[0].ID
}
func validControls(choice Choice, values map[string]string) map[string]string {
	out := map[string]string{}
	for name, control := range choice.Controls {
		if value, ok := values[name]; ok {
			for _, allowed := range control.Values {
				if value == allowed {
					out[name] = value
				}
			}
		}
	}
	return out
}
func cloneSelections(input map[string]Selection) map[string]Selection {
	out := map[string]Selection{}
	for id, s := range input {
		out[id] = Selection{ChoiceID: s.ChoiceID, Controls: validControls(Choice{Controls: map[string]Control{}}, s.Controls)}
		if s.Controls != nil {
			copy := out[id]
			copy.Controls = map[string]string{}
			for k, v := range s.Controls {
				copy.Controls[k] = v
			}
			out[id] = copy
		}
	}
	return out
}

func (m *Model) keepFocusVisible() {}
func (m Model) Selections() map[string]Selection {
	target, ok := m.target()
	if !ok {
		return nil
	}
	return cloneSelections(m.selections[target.ID])
}
func (m Model) InstallRequested() bool { return m.installing }
func (m Model) TargetID() string {
	target, ok := m.target()
	if !ok {
		return ""
	}
	return target.ID
}
func (m Model) InstallRequest() (InstallRequest, bool) {
	if !m.installing || m.TargetID() == "" {
		return InstallRequest{}, false
	}
	return InstallRequest{Target: m.TargetID(), Mode: m.mode, PresetID: m.presetID, Selections: m.Selections()}, true
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
