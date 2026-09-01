package tui

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/footer"
	"github.com/snakeblack/ospec-workflow/internal/tui/header"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/dashboard"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/doctor"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/models"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/targets"
)

type TabID int

const (
	TabDashboard TabID = iota
	TabModels
	TabTargets
	TabDoctor
	tabCount // 4
)

func (t TabID) Title() string {
	switch t {
	case TabDashboard:
		return "Dashboard"
	case TabModels:
		return "Models Hub"
	case TabTargets:
		return "Targets Manager"
	case TabDoctor:
		return "System Doctor"
	default:
		return "Unknown"
	}
}

type AppModel struct {
	activeTab    TabID
	width        int
	height       int
	header       header.Model
	dashboard    dashboard.Model
	modelsHub    models.Model
	targets      targets.Model
	doctor       doctor.Model
	quitting     bool
	ready        bool
	showHelp     bool
	repoRoot     string
	version      string
	activePreset string
	branch       string
	modelsMgr    *config.ModelsManager
	openspecMgr  *config.OpenSpecManager
}

// NewAppModel creates a new root Elm AppModel with default working directory.
func NewAppModel() AppModel {
	return NewAppModelWithRoot(".")
}

// NewAppModelWithRoot creates a new root Elm AppModel configured for a specific repository root directory.
func NewAppModelWithRoot(repoRoot string) AppModel {
	om := config.NewOpenSpecManager(repoRoot)
	mm := config.NewModelsManager(repoRoot)

	// Resolve project version
	version := "v2.57.0"
	if ver, err := om.GetProjectVersion(); err == nil && ver != "" {
		if !strings.HasPrefix(ver, "v") {
			version = "v" + ver
		} else {
			version = ver
		}
	}

	// Resolve active preset
	preset := "Default"
	if p, err := mm.GetActivePreset(); err == nil && p != "" {
		if len(p) > 0 {
			preset = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
		}
	}

	// Resolve git branch
	branch := resolveGitBranch(repoRoot)

	dash := dashboard.New(repoRoot, mm, om)
	mHub := models.New(repoRoot, mm)
	tMgr := targets.New(repoRoot)
	doc := doctor.New(repoRoot)

	return AppModel{
		activeTab:    TabDashboard,
		header:       header.New(version, preset, branch),
		dashboard:    dash,
		modelsHub:    mHub,
		targets:      tMgr,
		doctor:       doc,
		repoRoot:     repoRoot,
		version:      version,
		activePreset: preset,
		branch:       branch,
		modelsMgr:    mm,
		openspecMgr:  om,
	}
}

func resolveGitBranch(dir string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "branch", "--show-current")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err == nil {
		b := strings.TrimSpace(string(out))
		if b != "" {
			return b
		}
	}
	return "main"
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

func (m AppModel) ActiveTab() TabID {
	return m.activeTab
}

func (m AppModel) Width() int {
	return m.width
}

func (m AppModel) Height() int {
	return m.height
}

func (m AppModel) IsQuitting() bool {
	return m.quitting
}

func (m AppModel) IsReady() bool {
	return m.ready
}

func (m AppModel) Version() string {
	return m.version
}

func (m AppModel) ActivePreset() string {
	return m.activePreset
}

func (m AppModel) Branch() string {
	return m.branch
}

func (m AppModel) ModelsManager() *config.ModelsManager {
	return m.modelsMgr
}

func (m AppModel) OpenSpecManager() *config.OpenSpecManager {
	return m.openspecMgr
}

func (m AppModel) Dashboard() dashboard.Model {
	return m.dashboard
}

func (m AppModel) ModelsHub() models.Model {
	return m.modelsHub
}

func (m AppModel) Targets() targets.Model {
	return m.targets
}

func (m AppModel) Doctor() doctor.Model {
	return m.doctor
}

func (m AppModel) ShowHelp() bool {
	return m.showHelp
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case dashboard.SwitchTabMsg:
		m.activeTab = TabID(msg.Tab)
		if m.activeTab == TabModels {
			m.modelsHub.Refresh()
		} else if m.activeTab == TabDashboard {
			m.dashboard.Refresh()
		} else if m.activeTab == TabTargets {
			m.targets.Refresh()
		} else if m.activeTab == TabDoctor {
			m.doctor.Refresh()
		}
		return m, nil

	case dashboard.PresetChangedMsg:
		m.activePreset = msg.Preset
		m.header.SetPreset(msg.Preset)
		m.modelsHub.Refresh()
		return m, nil

	case models.PresetAppliedMsg:
		m.activePreset = msg.Preset
		m.header.SetPreset(msg.Preset)
		m.dashboard.Refresh()
		return m, nil

	case models.AgentTierUpdatedMsg:
		m.dashboard.Refresh()
		return m, nil

	case targets.TargetSyncedMsg:
		var cmd tea.Cmd
		var tModel tea.Model
		tModel, cmd = m.targets.Update(msg)
		m.targets = tModel.(targets.Model)
		return m, cmd

	case doctor.DoctorRefreshedMsg:
		var cmd tea.Cmd
		var dModel tea.Model
		dModel, cmd = m.doctor.Update(msg)
		m.doctor = dModel.(doctor.Model)
		return m, cmd

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.header.SetWidth(msg.Width)
		m.dashboard.SetSize(msg.Width, msg.Height)
		m.modelsHub.SetSize(msg.Width, msg.Height)
		m.targets.SetSize(msg.Width, msg.Height)
		m.doctor.SetSize(msg.Width, msg.Height)
		m.ready = true
		return m, nil

	case tea.KeyMsg:
		// If Help Modal is open, trap keyboard events and only respond to dismiss keys
		if m.showHelp {
			switch msg.String() {
			case "?", "esc", "q", "enter":
				m.showHelp = false
				return m, nil
			default:
				return m, nil
			}
		}

		switch msg.String() {
		case "?":
			m.showHelp = true
			return m, nil
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "1":
			m.activeTab = TabDashboard
			m.dashboard.Refresh()
			return m, nil
		case "2":
			m.activeTab = TabModels
			m.modelsHub.Refresh()
			return m, nil
		case "3":
			m.activeTab = TabTargets
			m.targets.Refresh()
			return m, nil
		case "4":
			m.activeTab = TabDoctor
			m.doctor.Refresh()
			return m, nil
		case "tab":
			m.activeTab = (m.activeTab + 1) % tabCount
			if m.activeTab == TabDashboard {
				m.dashboard.Refresh()
			} else if m.activeTab == TabModels {
				m.modelsHub.Refresh()
			} else if m.activeTab == TabTargets {
				m.targets.Refresh()
			} else if m.activeTab == TabDoctor {
				m.doctor.Refresh()
			}
			return m, nil
		case "shift+tab", "backtab":
			m.activeTab = (m.activeTab + tabCount - 1) % tabCount
			if m.activeTab == TabDashboard {
				m.dashboard.Refresh()
			} else if m.activeTab == TabModels {
				m.modelsHub.Refresh()
			} else if m.activeTab == TabTargets {
				m.targets.Refresh()
			} else if m.activeTab == TabDoctor {
				m.doctor.Refresh()
			}
			return m, nil
		}

		if m.activeTab == TabDashboard {
			var cmd tea.Cmd
			m.dashboard, cmd = m.dashboard.Update(msg)
			return m, cmd
		} else if m.activeTab == TabModels {
			var cmd tea.Cmd
			m.modelsHub, cmd = m.modelsHub.Update(msg)
			return m, cmd
		} else if m.activeTab == TabTargets {
			var cmd tea.Cmd
			var tModel tea.Model
			tModel, cmd = m.targets.Update(msg)
			m.targets = tModel.(targets.Model)
			return m, cmd
		} else if m.activeTab == TabDoctor {
			var cmd tea.Cmd
			var dModel tea.Model
			dModel, cmd = m.doctor.Update(msg)
			m.doctor = dModel.(doctor.Model)
			return m, cmd
		}
	}
	return m, nil
}

func (m AppModel) renderViewContent() string {
	if m.activeTab == TabDashboard {
		return m.dashboard.View()
	}
	if m.activeTab == TabModels {
		return m.modelsHub.View()
	}
	if m.activeTab == TabTargets {
		return m.targets.View()
	}
	if m.activeTab == TabDoctor {
		return m.doctor.View()
	}

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.ColorPrimary).
		Render(m.activeTab.Title())

	desc := lipgloss.NewStyle().
		Foreground(theme.ColorFgMuted).
		Render(fmt.Sprintf("Interactive view for %s (Milestone 2 Declarative Persistence Active)", m.activeTab.Title()))

	content := lipgloss.JoinVertical(lipgloss.Left, title, "\n", desc)

	boxWidth := m.width - 4
	if boxWidth < 20 {
		boxWidth = 20
	}

	return theme.StyleBox.
		Width(boxWidth).
		Padding(1, 2).
		Render(content)
}

func (m AppModel) View() string {
	if m.quitting {
		return "Goodbye!\n"
	}
	if !m.ready {
		return "Initializing...\n"
	}

	headerView := m.header.View()
	tabBar := theme.RenderTabBar(int(m.activeTab), m.width)

	var body string
	if m.showHelp {
		body = footer.RenderHelpModal(m.width, m.height)
	} else {
		body = m.renderViewContent()
	}

	footerBar := footer.RenderContextualFooter(int(m.activeTab), m.width)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		headerView,
		tabBar,
		body,
		footerBar,
	)
}
