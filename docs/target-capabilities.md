# Matriz de capacidades y paridad por target (D1/D2)

Los seis targets de la matriz histórica NO son equivalentes: cada host expone tools y
lifecycle hooks distintos. Esta matriz declara qué capacidad existe dónde, qué
degradación aplica cuando falta, y qué protecciones corren en cada target —
para que nadie asuma garantías que su host no ejecuta. La clasificación PP2/CX1
de siete perfiles aparece más abajo y tiene un alcance distinto.

Fuente de mapeo de tools: `scripts/lib/target-profiles/*.js` (`toolMap`).

## 1. Capacidades diferenciales por target

| Capacidad | claude (Claude Code) | vscode (Copilot Chat) | github-copilot (CLI) | opencode | codex | cursor |
|---|---|---|---|---|---|---|
| Preguntas estructuradas | `AskUserQuestion` | `vscode/askQuestions` | `ask_user` | `question` | chat gate (degrade) | chat gate (degrade) |
| Sub-agentes delegados | ✅ (`Task`/agents) | ✅ (`agent`) | parcial (sesión única) | ✅ (`task`) | ✅ (spawn) | ✅ (`Task`) |
| Sub-agentes en paralelo | ✅ | ❌ (secuencial) | ❌ | ❌ | ❌ | parcial (Task async) |
| Background tasks | ✅ (`run_in_background`) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Lifecycle hooks del plugin | ✅ (los 5) | ❌ | ❌ | parcial (`SessionStart`, `PreToolUse`) | ✅ (bridge) | parcial (camelCase map; sin `SubagentStop`) |
| Fallback de modelos por tier | vía `models.yaml` | ✅ (orden declarado) | ❌ | ✅ | ✅ | vía `models.yaml` `cursor:` |

Regla de generación: los prompts de un target NO deben instruir tools o
capacidades que su host no tiene — instruir una tool inexistente hace que el
agente alucine o se trabe. Ante la duda, el prompt generado usa el mínimo común
(pregunta de chat numerada con opciones cerradas como fallback de gate).

## 2. Degradación definida

- **Gates sin question-tool**: pregunta de chat estructurada — numerada, con
  opciones cerradas y una recomendada — y espera de respuesta antes de continuar.
- **4R / quality review sin paralelismo**: los reviewers del gate activo corren secuenciales (ver
  `skills/_shared/gate-4r-review.md`, Dispatch). Live v2 usa `review-trust`, `review-runtime`,
  `review-evolution`, `review-efficiency`; legacy v1 conserva los cuatro 4R. Con paralelismo
  (Claude Code), los cuatro se despachan a la vez — es el gate más caro del flujo y la latencia
  baja ~4x.
- **Sin background tasks**: los batches largos de apply se trocean en dispatches
  síncronos; el orquestador no debe prometer seguimiento en segundo plano.

## 3. Paridad de hooks / protecciones por target (D2)

| Protección | Mecanismo | claude | vscode | github-copilot | opencode | codex | cursor | Mitigación donde falta |
|---|---|---|---|---|---|---|---|---|
| AgentShield (secretos) | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | ✅ | parcial (según evento mapeado) | regla instruccional en `rules/` del target |
| Token budget advisor | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | ✅ | parcial (según evento mapeado) | `skills/_shared/token-budget.md` (pasivo) |
| Git collaboration guard | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | ✅ | parcial (según evento mapeado) | git hooks locales (`pre-commit`) |
| No-model-attribution | 3 capas | ✅ (hook+git+regla) | git hook + regla | git hook + regla | git hook + regla | git hook + regla | git hook + regla | git hook cubre TODOS los targets al instalarse |
| Strict TDD guard | git hook + regla | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — (git hook, host-agnóstico) |
| Registry fresh / session state | `SessionStart`/`Stop` | ✅ | ❌ (registro por comando) | ❌ | parcial (`SessionStart`; sin `Stop`) | ✅ | parcial (según eventos mapeados) | `sdd-init` regenera el registry on-demand |

Lectura correcta de esta tabla: **los git hooks locales son la única capa**
compartida entre los seis targets cuando se instalan y se ejecuta la operación
Git pertinente; no son hooks de lifecycle del host ni cubren toda ejecución.
Las protecciones de lifecycle hooks dependen del evento realmente mapeado e
invocado: Cursor no mapea `SubagentStop`, por lo que no se afirma paridad total.
Un usuario de vscode/copilot NO debe asumir que el token advisor o AgentShield
corren para él — tiene la versión instruccional (defensa pasiva) generada en las
rules de su target.

## 4. K2a capability states and proof-backed Claude activation

Closed capability states: `enforced | partial | instructional | unavailable`.

- **Claude Code (`claude`)** is the sole K2a activated real HostAdapter. Enforced
  capabilities require a verifying `CapabilityProof` bound to
  `adapter_version` + `host_version` + fixture + `evidence_digest`
  (fixtures under `scripts/lib/host-adapters/claude/fixtures/`).
- Other targets remain inactive stubs until K11a; Headless Conformance Host is a
  fault fixture, not a second product adapter.
- Adapters translate host surfaces into contract ports; they are **not** semantic
  authority (OpenSpec/Git remain sole).

## 5. Trabajo futuro declarado

- Campo `capabilities:` en `target-profiles/*.js` para inyectar/omitir secciones
  condicionales en la transform (hoy Claude declara `hostCapabilities` para
  proof binding; degradación residual sigue en prosa compartida).
- MCP server `ospec` read-only (D3) como canal uniforme de estado para los 6
  targets y hosts futuros.

## 6. PP2/CX1 compatibility (seven generated profiles; separate scope)

The preceding D1/D2 tables preserve historical tool and protection guidance;
this section classifies only PP2 phase validation and CX1 automatic projection.
It does not upgrade historical hook mappings into verified host execution.

Seven generated profiles exist: `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`. Generation is not evidence that a host runs a hook. Closed states: `enforced | partial | instructional | unavailable`. Here `enforced` requires observed host execution and proof, `partial` denotes a mapped but incomplete surface, `instructional` denotes guidance requiring explicit user/agent action, and `unavailable` denotes no mapped automatic path.

| Profile | PP2 phase validation | CX1 automatic envelope projection | Evidence boundary |
|---|---|---|---|
| `claude` | instructional | partial | Native SubagentStop hook and Node reducer are wired; K2a CapabilityProof covers the Claude adapter only, not universal phase validation. |
| `vscode` | instructional | unavailable | No verified SubagentStop bridge. |
| `github-copilot` | instructional | partial | Generated `subagentStop` mapping; host invocation and equivalent projection are not proven here. |
| `opencode` | instructional | unavailable | Plugin maps session start and pre-tool use, not SubagentStop. |
| `codex` | instructional | partial | Generated native hooks mapping; host invocation and equivalent projection are not proven here. |
| `cursor` | instructional | unavailable | Cursor deliberately omits SubagentStop from its camelCase event map. |
| `antigravity` | instructional | partial | Seventh generated hooks profile; host invocation and equivalent projection are not proven here. |

PP2: `scripts/validate-phase.js` is delivered with generated runtimes and can validate a phase when explicitly executed. Delivered Node scripts are **not host-enforced** proof of automatic invocation. CX1: the Node `SubagentStop` reducer validates envelopes and performs locked CAS/replay-safe projection when invoked; generation and mapping alone do not prove that a given host calls it. `partial` does not mean end-to-end host enforcement. No profile is claimed to mediate all shell commands, network operations, or connectors. Git hooks, where installed, are separate from host lifecycle hooks and cannot substitute for SubagentStop.

Only the Claude Code real HostAdapter has K2a proof binding (`adapter_version`, `host_version`, fixture, `evidence_digest`); other adapters remain inactive stubs. This proof is scoped to its verified capabilities, not blanket PP2/CX1 enforcement. These classifications describe observed repository wiring, not independently verified behavior in every host version.
