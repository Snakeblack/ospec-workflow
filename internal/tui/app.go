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
	"github.com/snakeblack/ospec-workflow/internal/tui/header"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
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
	activeTab     TabID
	width         int
	height        int
	header        header.Model
	quitting      bool
	ready         bool
	repoRoot      string
	version       string
	activePreset  string
	branch        string
	modelsMgr     *config.ModelsManager
	openspecMgr   *config.OpenSpecManager
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

	return AppModel{
		activeTab:    TabDashboard,
		header:       header.New(version, preset, branch),
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

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "1":
			m.activeTab = TabDashboard
		case "2":
			m.activeTab = TabModels
		case "3":
			m.activeTab = TabTargets
		case "4":
			m.activeTab = TabDoctor
		case "tab":
			m.activeTab = (m.activeTab + 1) % tabCount
		case "shift+tab", "backtab":
			m.activeTab = (m.activeTab + tabCount - 1) % tabCount
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.header.SetWidth(msg.Width)
		m.ready = true
	}
	return m, nil
}

func (m AppModel) renderViewContent() string {
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
	body := m.renderViewContent()
	footer := theme.RenderFooter(int(m.activeTab), m.width)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		headerView,
		"\n",
		tabBar,
		"\n",
		body,
		"\n",
		footer,
	)
}
