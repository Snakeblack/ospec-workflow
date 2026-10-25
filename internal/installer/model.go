package installer

import (
	"strings"
	"unicode"
	"unicode/utf8"
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

// Model owns navigation only. It never interprets a model name: the text the
// user types for each tier travels unchanged to the adapter, which saves it.
type Model struct {
	plan                          Plan
	screen                        screen
	targetIndex, tierIndex        int
	width, height                 int
	reviewBackFocused, installing bool
	values                        map[string]map[string]string
	packages                      map[string]bool
}

func NewModel(plan Plan) Model {
	m := Model{plan: plan, width: 80, height: 24, reviewBackFocused: true, values: map[string]map[string]string{}, packages: map[string]bool{}}
	for _, target := range plan.Targets {
		m.values[target.ID] = map[string]string{}
		for _, tier := range target.Tiers {
			m.values[target.ID][tier.ID] = tier.Value
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
	case modelsScreen:
		target, ok := m.target()
		if !ok || len(target.Tiers) == 0 {
			return noAction
		}
		tier := target.Tiers[m.tierIndex].ID
		// Typing has priority over navigation: a model name may hold q, j or k.
		if r, size := utf8.DecodeRuneInString(key); size == len(key) && r != utf8.RuneError && unicode.IsPrint(r) {
			m.values[target.ID][tier] += key
			return noAction
		}
		switch key {
		case "backspace":
			value := m.values[target.ID][tier]
			if _, size := utf8.DecodeLastRuneInString(value); size > 0 {
				m.values[target.ID][tier] = value[:len(value)-size]
			}
		case "ctrl+u":
			m.values[target.ID][tier] = ""
		case "up":
			m.tierIndex--
		case "down", "tab":
			m.tierIndex++
		case "enter":
			m.screen = reviewScreen
		}
		m.tierIndex = clamp(m.tierIndex, 0, len(target.Tiers)-1)
	case reviewScreen:
		// Digits toggle the optional packages, numbered as the plan lists them.
		if len(key) == 1 && key >= "1" && key <= "9" {
			if index := int(key[0] - '1'); index < len(m.plan.Packages) {
				id := m.plan.Packages[index].ID
				m.packages[id] = !m.packages[id]
			}
		}
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
	m.tierIndex = 0
	if target.Inherited || len(target.Tiers) == 0 {
		m.screen = reviewScreen
	} else {
		m.screen = modelsScreen
	}
}
func (m *Model) back() {
	switch m.screen {
	case targetsScreen:
		m.screen = menuScreen
	case modelsScreen:
		m.screen = targetsScreen
	case reviewScreen:
		target, _ := m.target()
		if target.Inherited || len(target.Tiers) == 0 {
			m.screen = targetsScreen
		} else {
			m.screen = modelsScreen
		}
	}
}
func (m Model) target() (Target, bool) {
	if m.targetIndex < 0 || m.targetIndex >= len(m.plan.Targets) {
		return Target{}, false
	}
	return m.plan.Targets[m.targetIndex], true
}

// Models returns the trimmed model of each tier of the current target; an
// empty one clears that tier.
func (m Model) Models() map[string]string {
	target, ok := m.target()
	if !ok || target.Inherited || len(target.Tiers) == 0 {
		return nil
	}
	out := map[string]string{}
	for _, tier := range target.Tiers {
		out[tier.ID] = strings.TrimSpace(m.values[target.ID][tier.ID])
	}
	return out
}

func (m *Model) keepFocusVisible()     {}
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
	return InstallRequest{Target: m.TargetID(), Models: m.Models(), Packages: m.selectedPackages()}, true
}

// selectedPackages lists the chosen packages in plan order; none leaves the
// installer default, which keeps a previous SDD install.
func (m Model) selectedPackages() []string {
	var out []string
	for _, item := range m.plan.Packages {
		if m.packages[item.ID] {
			out = append(out, item.ID)
		}
	}
	return out
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
