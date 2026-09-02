package install

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/models"
)

type InstallStep int

const (
	StepTargets InstallStep = iota
	StepAgents
	StepReview
	StepProgress
	StepDone
)

type TargetSelectOption struct {
	ID          string
	DisplayName string
	Selected    bool
	Detected    bool
}

type progressItem struct {
	ID     string
	Label  string
	Status string // pending | running | ok | error
}

type InstallFinishedMsg struct {
	Success bool
	Message string
}

type installLogMsg struct {
	Line   string
	Target string
	Kind   string
}

type InstallRunner func(ctx context.Context, sourceRoot string, targets []string, emit func(system.InstallEvent)) error

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"}

type Model struct {
	repoRoot         string
	modelsMgr        *config.ModelsManager
	runner           InstallRunner
	step             InstallStep
	targetOptions    []TargetSelectOption
	focusedTargetIdx int
	agentTargetIdx   int
	agentFocus       int
	agentCol         int
	agentPage        int
	picks            map[string][]config.AgentAssignment
	picker           models.PickerState
	hits             *[]models.Hit
	statusMessage    string
	isInstalling     bool
	progressItems    []progressItem
	logs             []string
	events           chan tea.Msg
	width            int
	height           int
	qa               bool
}

// New creates a targets-first installer.
func New(repoRoot string, mm *config.ModelsManager) Model {
	return NewWithRunner(repoRoot, mm, nil)
}

// NewWithRunner creates an installer with an injectable harness runner.
func NewWithRunner(repoRoot string, mm *config.ModelsManager, runner InstallRunner) Model {
	if runner == nil {
		runner = defaultRunner()
	}

	host := system.DetectHostClients()
	targets := system.InspectTargets(repoRoot)
	var detected, missing []TargetSelectOption
	for _, t := range targets {
		opt := TargetSelectOption{
			ID:          t.ID,
			DisplayName: t.DisplayName,
			Detected:    host[t.ID],
		}
		if opt.Detected {
			detected = append(detected, opt)
		} else {
			missing = append(missing, opt)
		}
	}

	return Model{
		repoRoot:         repoRoot,
		modelsMgr:        mm,
		runner:           runner,
		step:             StepTargets,
		targetOptions:    append(detected, missing...),
		focusedTargetIdx: 0,
		picks:            map[string][]config.AgentAssignment{},
		hits:             &[]models.Hit{},
		events:           make(chan tea.Msg, 64),
		width:            80,
		height:           24,
	}
}

// NewQA is a targets-first installer that never writes harness files or models.yaml.
func NewQA(repoRoot string, mm *config.ModelsManager, sourceRoot string) Model {
	m := NewWithRunner(repoRoot, mm, system.DryRunInstallRunner(sourceRoot))
	m.qa = true
	return m
}

func defaultRunner() InstallRunner {
	return func(ctx context.Context, sourceRoot string, targets []string, emit func(system.InstallEvent)) error {
		root := sourceRoot
		if found, err := system.FindSourceRoot(sourceRoot); err == nil {
			root = found
		}
		return system.RunHarnessInstall(ctx, system.HarnessInstallRequest{
			SourceRoot: root,
			Targets:    targets,
		}, emit)
	}
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m Model) Step() InstallStep {
	return m.step
}

func (m Model) AtRoot() bool {
	return m.step == StepTargets || m.step == StepDone
}

func (m Model) IsBusy() bool {
	return m.step == StepProgress && m.isInstalling
}

func (m Model) Logs() []string {
	return m.logs
}

func (m Model) SelectedTargets() []string {
	var res []string
	for _, t := range m.targetOptions {
		if t.Selected {
			res = append(res, t.ID)
		}
	}
	return res
}

func (m Model) displayName(id string) string {
	for _, t := range m.targetOptions {
		if t.ID == id {
			return t.DisplayName
		}
	}
	return id
}

func (m Model) currentTargetID() string {
	sel := m.SelectedTargets()
	if m.agentTargetIdx < 0 || m.agentTargetIdx >= len(sel) {
		return ""
	}
	return sel[m.agentTargetIdx]
}

// ClearTargetSelection unchecks every client. Used by tests and reset flows.
func (m *Model) ClearTargetSelection() {
	for i := range m.targetOptions {
		m.targetOptions[i].Selected = false
	}
}

func (m *Model) Reset() {
	m.step = StepTargets
	m.focusedTargetIdx = 0
	m.agentTargetIdx = 0
	m.agentFocus = 0
	m.agentCol = 0
	m.agentPage = 0
	m.picks = map[string][]config.AgentAssignment{}
	m.picker = models.PickerState{}
	m.statusMessage = ""
	m.isInstalling = false
	m.progressItems = nil
	m.logs = nil
}

func (m *Model) resetAgentCursor() {
	m.agentFocus = 0
	m.agentCol = 0
	m.agentPage = 0
}

func (m *Model) startAgentWizard() {
	m.agentTargetIdx = 0
	m.resetAgentCursor()
	if m.picks == nil {
		m.picks = map[string][]config.AgentAssignment{}
	}
	var cfg *config.ModelsConfig
	if m.modelsMgr != nil {
		cfg, _ = m.modelsMgr.GetConfig()
	}
	for _, id := range m.SelectedTargets() {
		if _, ok := m.picks[id]; ok {
			continue
		}
		m.picks[id] = config.BuildAgentPicks(cfg, id, "")
	}
	m.step = StepAgents
}

func (m *Model) goBack() {
	if m.picker.IsOpen {
		m.picker.IsOpen = false
		return
	}
	switch m.step {
	case StepAgents:
		if m.agentTargetIdx > 0 {
			m.agentTargetIdx--
			m.resetAgentCursor()
			return
		}
		m.step = StepTargets
	case StepReview:
		sel := m.SelectedTargets()
		m.step = StepAgents
		if len(sel) > 0 {
			m.agentTargetIdx = len(sel) - 1
		}
		m.resetAgentCursor()
	case StepProgress:
		if !m.isInstalling {
			m.step = StepReview
		}
	case StepDone:
		m.Reset()
	}
}

func (m *Model) advanceFromAgents() {
	sel := m.SelectedTargets()
	if m.agentTargetIdx < len(sel)-1 {
		m.agentTargetIdx++
		m.resetAgentCursor()
		return
	}
	m.step = StepReview
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case installLogMsg:
		if msg.Line != "" {
			m.logs = append(m.logs, msg.Line)
			if len(m.logs) > 40 {
				m.logs = m.logs[len(m.logs)-40:]
			}
		}
		if msg.Target != "" {
			for i, item := range m.progressItems {
				if item.ID != msg.Target {
					continue
				}
				switch msg.Kind {
				case "step":
					m.progressItems[i].Status = "running"
				case "error":
					m.progressItems[i].Status = "error"
				}
			}
		}
		return m, listenInstall(m.events)

	case InstallFinishedMsg:
		m.isInstalling = false
		if msg.Success {
			m.step = StepDone
			m.statusMessage = msg.Message
			for i, item := range m.progressItems {
				if item.Status == "running" || item.Status == "pending" {
					m.progressItems[i].Status = "ok"
				}
			}
		} else {
			m.statusMessage = "✗ " + msg.Message
			m.step = StepProgress
		}
		return m, nil

	case tea.MouseMsg:
		if msg.Action != tea.MouseActionPress || msg.Button != tea.MouseButtonLeft {
			return m, nil
		}
		if m.step == StepProgress && m.isInstalling {
			return m, nil
		}
		return m.handleClick(msg.X, msg.Y-1)

	case tea.KeyMsg:
		if m.step == StepProgress && m.isInstalling {
			return m, nil
		}

		if m.picker.IsOpen {
			closed, selected, has := m.picker.Update(msg)
			if closed && has {
				m.applyPickerModel(selected)
			}
			return m, nil
		}

		switch msg.String() {
		case "esc", "b":
			if m.step == StepDone {
				m.Reset()
				return m, nil
			}
			m.goBack()
			return m, nil
		}

		switch m.step {
		case StepTargets:
			switch msg.String() {
			case "up", "k":
				if m.focusedTargetIdx > 0 {
					m.focusedTargetIdx--
				}
			case "down", "j":
				if m.focusedTargetIdx < len(m.targetOptions)-1 {
					m.focusedTargetIdx++
				}
			case " ", "x":
				m.toggleFocusedTarget()
			case "enter":
				if len(m.SelectedTargets()) == 0 {
					if m.focusedTargetIdx >= 0 && m.focusedTargetIdx < len(m.targetOptions) {
						m.targetOptions[m.focusedTargetIdx].Selected = true
					} else {
						m.statusMessage = "No hay clientes en la lista."
						return m, nil
					}
				}
				m.statusMessage = ""
				m.startAgentWizard()
				return m, nil
			}

		case StepAgents:
			return m.updateAgents(msg)

		case StepReview:
			switch msg.String() {
			case "enter":
				return m.beginInstall()
			}

		case StepDone:
			switch msg.String() {
			case "enter", "q", "esc":
				m.Reset()
				return m, nil
			}
		}
	}

	return m, nil
}

func (m *Model) toggleFocusedTarget() {
	if m.focusedTargetIdx >= 0 && m.focusedTargetIdx < len(m.targetOptions) {
		m.targetOptions[m.focusedTargetIdx].Selected = !m.targetOptions[m.focusedTargetIdx].Selected
	}
}

func (m *Model) applyPickerModel(modelID string) {
	id := m.currentTargetID()
	picks := m.picks[id]
	if m.agentFocus >= 0 && m.agentFocus < len(picks) {
		picks[m.agentFocus].Model = modelID
		m.picks[id] = picks
	}
}

func (m Model) updateAgents(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	id := m.currentTargetID()
	picks := m.picks[id]
	names := config.AgentPickNames(id)
	n := len(names)
	if n == 0 {
		n = len(picks)
	}
	cols := config.AssignmentColumnCount(id)
	pageSize := 9

	switch msg.String() {
	case "up", "k":
		if m.agentFocus > 0 {
			m.agentFocus--
			m.agentPage = m.agentFocus / pageSize
		}
	case "down", "j":
		if m.agentFocus < n-1 {
			m.agentFocus++
			m.agentPage = m.agentFocus / pageSize
		}
	case "left", "h":
		if m.agentCol > 0 {
			m.agentCol--
		} else {
			m.cycleFocused(-1)
		}
	case "right", "l":
		if m.agentCol < cols-1 {
			m.agentCol++
		} else {
			m.cycleFocused(1)
		}
	case " ":
		m.cycleFocused(1)
	case "/":
		m.openAgentPicker()
	case "pgdown":
		if (m.agentPage+1)*pageSize < n {
			m.agentPage++
			m.agentFocus = m.agentPage * pageSize
		}
	case "pgup":
		if m.agentPage > 0 {
			m.agentPage--
			m.agentFocus = m.agentPage * pageSize
		}
	case "enter":
		m.advanceFromAgents()
	}
	return m, nil
}

func (m *Model) cycleFocused(delta int) {
	id := m.currentTargetID()
	picks := m.picks[id]
	if m.agentFocus < 0 || m.agentFocus >= len(picks) {
		return
	}
	picks[m.agentFocus] = config.CycleAssignmentField(id, picks[m.agentFocus], m.agentCol, delta)
	m.picks[id] = picks
}

func (m *Model) openAgentPicker() {
	id := m.currentTargetID()
	picks := m.picks[id]
	if m.agentFocus < 0 || m.agentFocus >= len(picks) {
		return
	}
	names := config.AgentPickNames(id)
	agent := ""
	if m.agentFocus < len(names) {
		agent = names[m.agentFocus]
	}
	m.picker = models.NewPickerState(id, "", agent, picks[m.agentFocus].Model, nil)
}

func (m Model) handleClick(x, y int) (tea.Model, tea.Cmd) {
	if m.picker.IsOpen {
		for _, h := range m.hitList() {
			if h.Kind == "picker" && h.Contains(x, y) && h.Index >= 0 && h.Index < len(m.picker.FilteredItems) {
				m.applyPickerModel(m.picker.FilteredItems[h.Index].ID)
				m.picker.IsOpen = false
				return m, nil
			}
		}
		return m, nil
	}

	switch m.step {
	case StepTargets:
		for _, h := range m.hitList() {
			if h.Kind == "target" && h.Contains(x, y) && h.Index >= 0 && h.Index < len(m.targetOptions) {
				m.focusedTargetIdx = h.Index
				m.targetOptions[h.Index].Selected = !m.targetOptions[h.Index].Selected
				return m, nil
			}
		}
	case StepAgents:
		for _, h := range m.hitList() {
			if !h.Contains(x, y) {
				continue
			}
			switch h.Kind {
			case "agent":
				m.agentFocus = h.Index
				m.agentCol = h.Extra
				m.agentPage = m.agentFocus / 9
				if h.Extra == 0 {
					m.openAgentPicker()
				} else {
					m.cycleFocused(1)
				}
				return m, nil
			case "page":
				id := m.currentTargetID()
				n := len(config.AgentPickNames(id))
				if h.Extra > 0 && (m.agentPage+1)*9 < n {
					m.agentPage++
					m.agentFocus = m.agentPage * 9
				} else if h.Extra < 0 && m.agentPage > 0 {
					m.agentPage--
					m.agentFocus = m.agentPage * 9
				}
				return m, nil
			}
		}
	case StepReview:
		return m.beginInstall()
	case StepDone:
		m.Reset()
	}
	return m, nil
}

func (m Model) beginInstall() (Model, tea.Cmd) {
	targets := m.SelectedTargets()
	if len(targets) == 0 {
		m.statusMessage = "Selecciona al menos un cliente."
		return m, nil
	}

	m.progressItems = make([]progressItem, 0, len(targets)+1)
	presetLabel := "Guardar modelos por cliente"
	if m.qa {
		presetLabel = "Comprobar modelos (sin escribir)"
	}
	m.progressItems = append(m.progressItems, progressItem{ID: "preset", Label: presetLabel, Status: "running"})
	for _, id := range targets {
		m.progressItems = append(m.progressItems, progressItem{ID: id, Label: "Instalar " + m.displayName(id), Status: "pending"})
	}

	m.step = StepProgress
	m.isInstalling = true
	m.logs = nil
	m.statusMessage = ""
	repoRoot := m.repoRoot
	mm := m.modelsMgr
	runner := m.runner
	events := m.events
	qa := m.qa
	picks := m.picks

	return m, func() tea.Msg {
		go runInstallJob(repoRoot, mm, runner, picks, targets, events, qa)
		return <-events
	}
}

func runInstallJob(
	repoRoot string,
	mm *config.ModelsManager,
	runner InstallRunner,
	picks map[string][]config.AgentAssignment,
	targets []string,
	events chan tea.Msg,
	qa bool,
) {
	send := func(msg tea.Msg) {
		events <- msg
	}

	if mm != nil {
		if qa {
			send(installLogMsg{Line: "QA: se guardarían modelos por cliente en models.yaml (no escrito)", Kind: "log"})
		} else if err := mm.SaveAllTargetAssignments(picks); err != nil {
			send(InstallFinishedMsg{Success: false, Message: "No se pudieron guardar los modelos: " + err.Error()})
			return
		} else {
			send(installLogMsg{Line: "Modelos por cliente guardados en models.yaml", Kind: "log"})
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	err := runner(ctx, repoRoot, targets, func(ev system.InstallEvent) {
		send(installLogMsg{Line: ev.Message, Target: ev.Target, Kind: ev.Kind})
	})
	if err != nil {
		send(InstallFinishedMsg{Success: false, Message: err.Error()})
		return
	}
	doneVerb := "Instalado en"
	if qa {
		doneVerb = "QA dry-run comprobó"
	}
	send(InstallFinishedMsg{
		Success: true,
		Message: fmt.Sprintf("%s: %s", doneVerb, strings.Join(targets, ", ")),
	})
}

func listenInstall(events chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		return <-events
	}
}

func (m Model) View() string {
	var content string
	boxWidth := m.width - 4
	if boxWidth < 30 {
		boxWidth = 30
	}

	if m.picker.IsOpen {
		view, hits := m.picker.Render(boxWidth)
		m.storeHits(hits)
		return view
	}

	switch m.step {
	case StepTargets:
		content = m.renderTargetsStep(boxWidth)
	case StepAgents:
		content = m.renderAgentsStep(boxWidth)
	case StepReview:
		content = m.renderReviewStep()
	case StepProgress:
		content = m.renderProgressStep(boxWidth)
	case StepDone:
		content = m.renderDoneStep()
	}

	return theme.StyleBox.Width(boxWidth).Padding(1, 2).Render(content)
}

func (m Model) renderTargetsStep(width int) string {
	sel := m.SelectedTargets()
	header := theme.StyleCardHeader.Render("1/3  ¿En qué clientes instalamos ospec?")
	sub := theme.StyleLabel.Render("Espacio marca los detectados. Enter continúa; si no hay ninguno marcado, se usa el que tienes enfocado.")

	var rows []string
	var hits []models.Hit
	y := 4
	section := func(title string) {
		rows = append(rows, theme.StyleCardHeaderAccent.Render(title))
		y++
	}

	wroteDetected := false
	wroteMissing := false
	for i, t := range m.targetOptions {
		if t.Detected && !wroteDetected {
			section("Detectados en esta máquina")
			wroteDetected = true
		}
		if !t.Detected && !wroteMissing {
			if wroteDetected {
				rows = append(rows, "")
				y++
			}
			section("No detectados")
			wroteMissing = true
		}

		isFocused := i == m.focusedTargetIdx
		box := "[ ]"
		if t.Selected {
			box = theme.StyleValueSuccess.Render("[✓]")
		}
		name := theme.StyleValue.Render(t.DisplayName)
		if isFocused {
			name = theme.StyleValuePrimary.Bold(true).Render(t.DisplayName)
		}
		badge := theme.StyleValueMuted.Render("no detectado")
		if t.Detected {
			badge = theme.StyleValueSuccess.Render("detectado")
		}
		row := fmt.Sprintf("  %s %s  %s", box, name, badge)
		if isFocused {
			row = lipgloss.NewStyle().
				Background(lipgloss.Color("#262626")).
				Width(width - 4).
				Render("▶ " + strings.TrimPrefix(row, "  "))
		}
		rows = append(rows, row)
		hits = append(hits, models.Hit{Kind: "target", Index: i, X: 0, Y: y, W: width, H: 1})
		y++
	}
	m.storeHits(hits)

	warn := ""
	if m.statusMessage != "" {
		warn = theme.StyleValueWarning.Render(m.statusMessage)
	}
	count := theme.StyleLabel.Render(fmt.Sprintf("Marcados: %d", len(sel)))
	hint := theme.StyleLabel.Render("↑/↓ mueve  ·  Espacio o clic marca  ·  Enter continúa  ·  Esc cancela")
	parts := []string{header, "", sub, "", strings.Join(rows, "\n"), "", count}
	if warn != "" {
		parts = append(parts, warn)
	}
	parts = append(parts, hint)
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func (m Model) renderAgentsStep(width int) string {
	sel := m.SelectedTargets()
	id := m.currentTargetID()
	stepN := m.agentTargetIdx + 1
	total := len(sel)
	title := fmt.Sprintf("2/3  Modelos de %s  (%d/%d)", m.displayName(id), stepN, total)
	sub := "↑/↓ agente  ·  Espacio cicla  ·  / lista  ·  Enter siguiente cliente o resumen  ·  Esc atrás"
	if !config.TargetIsMultiAgent(id) {
		sub = "Antigravity usa un solo modelo para todos los agentes. Espacio cicla  ·  Enter continúa  ·  Esc atrás"
	}
	body, hits := models.RenderAssignmentList(
		id,
		title,
		sub,
		m.picks[id],
		m.agentFocus,
		m.agentCol,
		m.agentPage,
		width,
		0,
	)
	m.storeHits(hits)
	return body
}

func (m Model) hitList() []models.Hit {
	if m.hits == nil {
		return nil
	}
	return *m.hits
}

func (m Model) storeHits(hits []models.Hit) {
	if m.hits == nil {
		return
	}
	*m.hits = hits
}

func (m Model) renderReviewStep() string {
	header := theme.StyleCardHeaderWarning.Render("3/3  Revisa y confirma")
	sub := theme.StyleLabel.Render("Se guardan los modelos de cada cliente y se instala el harness.")

	var blocks []string
	for _, id := range m.SelectedTargets() {
		picks := m.picks[id]
		names := config.AgentPickNames(id)
		label := m.displayName(id)
		if !config.TargetIsMultiAgent(id) {
			model := ""
			if len(picks) > 0 {
				model = picks[0].Model
			}
			blocks = append(blocks, fmt.Sprintf("• %s  %s", theme.StyleValueAccent.Render(label), theme.StyleValue.Render(model)))
			continue
		}
		shown := 0
		var bits []string
		for i, name := range names {
			if i >= len(picks) {
				break
			}
			if picks[i].Model == "" {
				continue
			}
			bits = append(bits, fmt.Sprintf("%s=%s", name, picks[i].Model))
			shown++
			if shown >= 4 {
				bits = append(bits, "…")
				break
			}
		}
		blocks = append(blocks, fmt.Sprintf("• %s  %s", theme.StyleValueAccent.Render(label), theme.StyleLabel.Render(strings.Join(bits, ", "))))
	}

	actionBtn := theme.StyleActionBtnActive.Render(" [ Enter ] Instalar ")
	backBtn := theme.StyleActionBtn.Render(" [ Esc ] Atrás ")
	buttonsRow := lipgloss.JoinHorizontal(lipgloss.Top, actionBtn, "  ", backBtn)

	return lipgloss.JoinVertical(lipgloss.Left,
		header, "", sub, "", strings.Join(blocks, "\n"), "", buttonsRow,
	)
}

func (m Model) renderProgressStep(width int) string {
	header := theme.StyleCardHeader.Render("Instalando harness")
	sub := theme.StyleLabel.Render("No cierres la TUI. VS Code se registra en settings.json; si el generador tarda, verás el log aquí.")

	spin := spinnerFrames[int(time.Now().UnixMilli()/80)%len(spinnerFrames)]
	var rows []string
	done := 0
	for _, item := range m.progressItems {
		icon := theme.StyleValueMuted.Render("·")
		switch item.Status {
		case "ok":
			icon = theme.StyleValueSuccess.Render("✓")
			done++
		case "error":
			icon = theme.StyleValueWarning.Render("✗")
			done++
		case "running":
			icon = theme.StyleValuePrimary.Render(spin)
		}
		rows = append(rows, fmt.Sprintf("  %s %s", icon, item.Label))
	}

	total := len(m.progressItems)
	percent := 0
	if total > 0 {
		percent = (done * 100) / total
		if m.isInstalling && percent > 90 {
			percent = 90
		}
		if !m.isInstalling {
			percent = 100
		}
	}
	bar := renderPercentBar(percent)

	logLines := m.logs
	if len(logLines) > 6 {
		logLines = logLines[len(logLines)-6:]
	}
	var logBlock string
	if len(logLines) > 0 {
		var formatted []string
		for _, line := range logLines {
			formatted = append(formatted, theme.StyleLabel.Render("  "+line))
		}
		logBlock = lipgloss.JoinVertical(lipgloss.Left,
			theme.StyleCardHeaderAccent.Render("Log"),
			strings.Join(formatted, "\n"),
		)
	}

	errLine := ""
	if !m.isInstalling && strings.HasPrefix(m.statusMessage, "✗") {
		errLine = theme.StyleValueWarning.Render(m.statusMessage + "  ·  Esc para volver")
	}

	parts := []string{header, "", sub, "", bar, strings.Join(rows, "\n")}
	if logBlock != "" {
		parts = append(parts, "", logBlock)
	}
	if errLine != "" {
		parts = append(parts, "", errLine)
	}
	_ = width
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func renderPercentBar(percent int) string {
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	const width = 28
	filled := (percent * width) / 100
	empty := width - filled
	bar := theme.StyleValuePrimary.Render(strings.Repeat("█", filled)) +
		theme.StyleValueMuted.Render(strings.Repeat("░", empty))
	return fmt.Sprintf("%s  %s", bar, theme.StyleValue.Render(fmt.Sprintf("%d%%", percent)))
}

func (m Model) renderDoneStep() string {
	header := theme.StyleCardHeaderSuccess.Render("Listo. El harness quedó instalado.")
	msg := theme.StyleValueSuccess.Render(m.statusMessage)

	var next []string
	next = append(next, theme.StyleCardHeader.Render("Siguientes pasos"))
	selected := map[string]bool{}
	for _, t := range m.targetOptions {
		if t.Selected {
			selected[t.ID] = true
		}
	}
	if selected["vscode"] {
		next = append(next, "  1. Recarga VS Code (Agent Plugins) y abre un chat Copilot.")
	}
	if selected["claude"] {
		next = append(next, "  · Reinicia Claude Code o usa /reload-plugins.")
	}
	if selected["cursor"] {
		next = append(next, "  · Reinicia Cursor para cargar reglas y agentes.")
	}
	if selected["codex"] {
		next = append(next, "  · Abre una nueva sesión de Codex CLI.")
	}
	if selected["antigravity"] {
		next = append(next, "  · Reinicia Antigravity / Gemini CLI.")
	}
	if selected["opencode"] {
		next = append(next, "  · Reinicia OpenCode.")
	}
	next = append(next, "", theme.StyleLabel.Render("ospec no pide API keys: cada cliente usa las suyas (Copilot, Claude, Cursor…)."))
	next = append(next, theme.StyleLabel.Render("Ajusta presets y agentes en la pestaña Modelos si quieres afinar."))

	exitHint := theme.StyleActionBtnActive.Render(" [ Enter ] Volver al inicio ")
	return lipgloss.JoinVertical(lipgloss.Left, header, "", msg, "", strings.Join(next, "\n"), "", exitHint)
}
