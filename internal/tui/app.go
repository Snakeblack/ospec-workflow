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
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/footer"
	"github.com/snakeblack/ospec-workflow/internal/tui/header"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/dashboard"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/install"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/models"
)

type TabID int

const (
	TabDashboard TabID = iota
	TabInstall
	TabModels
	tabCount
)

func (t TabID) Title() string {
	switch t {
	case TabDashboard:
		return "Inicio"
	case TabInstall:
		return "Instalar"
	case TabModels:
		return "Modelos"
	default:
		return "Unknown"
	}
}

type AppModel struct {
	activeTab     TabID
	width         int
	height        int
	header        header.Model
	dashboard     dashboard.Model
	installer     install.Model
	modelsHub     models.Model
	quitting      bool
	ready         bool
	showHelp      bool
	repoRoot      string
	version       string
	activePreset  string
	branch        string
	modelsMgr     *config.ModelsManager
	openspecMgr   *config.OpenSpecManager
	statusMessage string
	qaMode        bool
}

func NewAppModel() AppModel {
	return NewAppModelWithRoot(".")
}

func NewAppModelWithRoot(repoRoot string) AppModel {
	return NewAppModelWithOptions(AppOptions{RepoRoot: repoRoot})
}

// AppOptions configures the TUI, including a QA dry-run that never writes harness files.
type AppOptions struct {
	RepoRoot   string
	SourceRoot string
	QAMode     bool
}

func NewAppModelWithOptions(opts AppOptions) AppModel {
	repoRoot := opts.RepoRoot
	if repoRoot == "" {
		repoRoot = "."
	}
	om := config.NewOpenSpecManager(repoRoot)
	mm := config.NewModelsManager(repoRoot)

	version := "v2.58.0"
	if ver, err := om.GetProjectVersion(); err == nil && ver != "" {
		if !strings.HasPrefix(ver, "v") {
			version = "v" + ver
		} else {
			version = ver
		}
	}

	preset := "Default"
	if p, err := mm.GetActivePreset(); err == nil && p != "" {
		if len(p) > 0 {
			preset = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
		}
	}
	if opts.QAMode {
		preset = "QA · " + preset
		if !strings.HasSuffix(version, "-qa") {
			version = version + "-qa"
		}
	}

	branch := resolveGitBranch(repoRoot)
	dash := dashboard.New(repoRoot, mm, om)
	var inst install.Model
	if opts.QAMode {
		source := opts.SourceRoot
		if source == "" {
			if found, err := system.FindSourceRoot(repoRoot); err == nil {
				source = found
			} else if found, err := system.FindSourceRoot("."); err == nil {
				source = found
			} else {
				source = repoRoot
			}
		}
		inst = install.NewQA(repoRoot, mm, source)
	} else {
		inst = install.New(repoRoot, mm)
	}
	mHub := models.New(repoRoot, mm)

	return AppModel{
		activeTab:    TabDashboard,
		header:       header.New(version, preset, branch),
		dashboard:    dash,
		installer:    inst,
		modelsHub:    mHub,
		repoRoot:     repoRoot,
		version:      version,
		activePreset: preset,
		branch:       branch,
		modelsMgr:    mm,
		openspecMgr:  om,
		qaMode:       opts.QAMode,
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

func (m AppModel) ActiveTab() TabID                         { return m.activeTab }
func (m AppModel) Width() int                               { return m.width }
func (m AppModel) Height() int                              { return m.height }
func (m AppModel) IsQuitting() bool                         { return m.quitting }
func (m AppModel) IsReady() bool                            { return m.ready }
func (m AppModel) Version() string                          { return m.version }
func (m AppModel) ActivePreset() string                     { return m.activePreset }
func (m AppModel) Branch() string                           { return m.branch }
func (m AppModel) ModelsManager() *config.ModelsManager     { return m.modelsMgr }
func (m AppModel) OpenSpecManager() *config.OpenSpecManager { return m.openspecMgr }
func (m AppModel) Dashboard() dashboard.Model               { return m.dashboard }
func (m AppModel) Installer() install.Model                 { return m.installer }
func (m AppModel) ModelsHub() models.Model                  { return m.modelsHub }
func (m AppModel) ShowHelp() bool                           { return m.showHelp }

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case dashboard.ActionTriggeredMsg:
		switch msg.Action {
		case dashboard.ActionInstall:
			m.activeTab = TabInstall
			m.installer.Reset()
			return m, nil
		case dashboard.ActionConfigureModels:
			m.activeTab = TabModels
			m.modelsHub.Refresh()
			return m, nil
		case dashboard.ActionUpdate:
			if m.qaMode {
				m.statusMessage = "QA: actualizar no escribe archivos (dry-run)"
				return m, nil
			}
			repaired, err := system.RepairInstallation(m.repoRoot)
			if err != nil {
				m.statusMessage = fmt.Sprintf("✗ Error al actualizar: %v", err)
			} else {
				m.statusMessage = fmt.Sprintf("✓ %d clientes sincronizados (%s)", len(repaired), strings.Join(repaired, ", "))
			}
			return m, nil
		case dashboard.ActionUninstall:
			if m.qaMode {
				m.statusMessage = "QA: desinstalar no borra archivos (dry-run)"
				return m, nil
			}
			err := system.UninstallTargets(m.repoRoot, []string{"claude", "antigravity", "vscode", "codex", "opencode", "cursor"})
			if err != nil {
				m.statusMessage = fmt.Sprintf("✗ Error en desinstalación: %v", err)
			} else {
				m.statusMessage = "✓ Desinstalación completada"
			}
			return m, nil
		}

	case StatusToastMsg:
		m.statusMessage = msg.Message
		return m, nil

	case dashboard.SwitchTabMsg:
		m.activeTab = TabID(msg.Tab)
		m.refreshActiveTab()
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

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.header.SetWidth(msg.Width)
		m.dashboard.SetSize(msg.Width, msg.Height)
		m.installer.SetSize(msg.Width, msg.Height)
		m.modelsHub.SetSize(msg.Width, msg.Height)
		m.ready = true
		return m, nil

	case tea.MouseMsg:
		if msg.Action != tea.MouseActionPress || msg.Button != tea.MouseButtonLeft {
			return m, nil
		}
		if m.showHelp {
			m.showHelp = false
			return m, nil
		}
		if m.installer.IsBusy() {
			return m, nil
		}
		headerH := lipgloss.Height(m.header.View())
		tabH := lipgloss.Height(theme.RenderTabBar(int(m.activeTab), m.width))
		if idx := theme.HitTabIndex(msg.X, msg.Y-headerH); idx >= 0 {
			m.activeTab = TabID(idx)
			m.refreshActiveTab()
			return m, nil
		}
		bodyMsg := msg
		bodyMsg.Y = msg.Y - headerH - tabH
		if m.activeTab == TabDashboard {
			var cmd tea.Cmd
			m.dashboard, cmd = m.dashboard.Update(bodyMsg)
			if cmd != nil {
				dashMsg := cmd()
				mModel, extraCmd := m.Update(dashMsg)
				m = mModel.(AppModel)
				return m, extraCmd
			}
			return m, nil
		}
		if m.activeTab == TabInstall {
			iModel, cmd := m.installer.Update(bodyMsg)
			m.installer = iModel.(install.Model)
			return m, cmd
		}
		if m.activeTab == TabModels {
			var cmd tea.Cmd
			m.modelsHub, cmd = m.modelsHub.Update(bodyMsg)
			return m, cmd
		}
		return m, nil

	case tea.KeyMsg:
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
		case "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "q":
			if m.installer.IsBusy() {
				return m, nil
			}
			if m.activeTab == TabDashboard {
				m.quitting = true
				return m, tea.Quit
			}
			m.activeTab = TabDashboard
			m.dashboard.Refresh()
			return m, nil
		case "esc", "b":
			if m.activeTab == TabInstall {
				if m.installer.IsBusy() {
					return m, nil
				}
				if m.installer.AtRoot() {
					m.activeTab = TabDashboard
					m.dashboard.Refresh()
					m.installer.Reset()
					return m, nil
				}
				break
			}
			if m.activeTab == TabModels {
				if m.modelsHub.ConsumesEsc() {
					break
				}
				m.activeTab = TabDashboard
				m.dashboard.Refresh()
				return m, nil
			}
			if m.activeTab != TabDashboard {
				m.activeTab = TabDashboard
				m.dashboard.Refresh()
				return m, nil
			}
		case "tab":
			if m.installer.IsBusy() {
				return m, nil
			}
			m.activeTab = (m.activeTab + 1) % tabCount
			m.refreshActiveTab()
			return m, nil
		case "shift+tab", "backtab":
			if m.installer.IsBusy() {
				return m, nil
			}
			m.activeTab = (m.activeTab + tabCount - 1) % tabCount
			m.refreshActiveTab()
			return m, nil
		}

		if m.activeTab == TabDashboard {
			switch msg.String() {
			case "1":
				m.activeTab = TabInstall
				m.installer.Reset()
				return m, nil
			case "2":
				m.activeTab = TabModels
				m.modelsHub.Refresh()
				return m, nil
			case "3":
				if m.qaMode {
					m.statusMessage = "QA: actualizar no escribe archivos (dry-run)"
					return m, nil
				}
				repaired, err := system.RepairInstallation(m.repoRoot)
				if err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error al actualizar: %v", err)
				} else {
					m.statusMessage = fmt.Sprintf("✓ %d clientes sincronizados (%s)", len(repaired), strings.Join(repaired, ", "))
				}
				return m, nil
			case "4":
				if m.qaMode {
					m.statusMessage = "QA: desinstalar no borra archivos (dry-run)"
					return m, nil
				}
				err := system.UninstallTargets(m.repoRoot, []string{"claude", "antigravity", "vscode", "codex", "opencode", "cursor"})
				if err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error en desinstalación: %v", err)
				} else {
					m.statusMessage = "✓ Desinstalación completada"
				}
				return m, nil
			}

			var cmd tea.Cmd
			m.dashboard, cmd = m.dashboard.Update(msg)
			if cmd != nil {
				dashMsg := cmd()
				mModel, extraCmd := m.Update(dashMsg)
				m = mModel.(AppModel)
				return m, extraCmd
			}
			return m, cmd
		} else if m.activeTab == TabInstall {
			var cmd tea.Cmd
			var iModel tea.Model
			iModel, cmd = m.installer.Update(msg)
			m.installer = iModel.(install.Model)
			return m, cmd
		} else if m.activeTab == TabModels {
			var cmd tea.Cmd
			m.modelsHub, cmd = m.modelsHub.Update(msg)
			return m, cmd
		}
	}

	// Installer progress/log messages are not KeyMsg; they must still reach the wizard.
	if m.activeTab == TabInstall {
		iModel, cmd := m.installer.Update(msg)
		m.installer = iModel.(install.Model)
		return m, cmd
	}
	return m, nil
}

func (m *AppModel) refreshActiveTab() {
	switch m.activeTab {
	case TabDashboard:
		m.dashboard.Refresh()
	case TabInstall:
		m.installer.Reset()
	case TabModels:
		m.modelsHub.Refresh()
	}
}

type StatusToastMsg struct {
	Message string
}

func (m AppModel) renderViewContent() string {
	if m.activeTab == TabDashboard {
		content := m.dashboard.View()
		if m.statusMessage != "" {
			toast := theme.StyleValueSuccess.Render(m.statusMessage)
			if strings.HasPrefix(m.statusMessage, "✗") {
				toast = theme.StyleValueWarning.Render(m.statusMessage)
			}
			content = lipgloss.JoinVertical(lipgloss.Left, content, "\n", toast)
		}
		return content
	}
	if m.activeTab == TabInstall {
		return m.installer.View()
	}
	if m.activeTab == TabModels {
		return m.modelsHub.View()
	}

	title := lipgloss.NewStyle().Bold(true).Foreground(theme.ColorPrimary).Render(m.activeTab.Title())
	boxWidth := m.width - 4
	if boxWidth < 20 {
		boxWidth = 20
	}
	return theme.StyleBox.Width(boxWidth).Padding(1, 2).Render(title)
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
	return lipgloss.JoinVertical(lipgloss.Left, headerView, tabBar, body, footerBar)
}
