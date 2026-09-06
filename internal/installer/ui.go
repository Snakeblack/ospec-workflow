package installer

import tea "github.com/charmbracelet/bubbletea"

func (m Model) Init() tea.Cmd { return nil }

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch value := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = value.Width, value.Height
		m.keepFocusVisible()
		return m, nil
	case tea.KeyMsg:
		switch m.handleKey(value.String()) {
		case quitAction, installAction:
			return m, tea.Quit
		}
	}
	return m, nil
}
