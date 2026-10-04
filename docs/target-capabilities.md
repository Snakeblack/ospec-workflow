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

PP2: `scripts/validate-phase.js` is delivered with generated runtimes and can validate a phase when explicitly executed. The orchestrator command uses the plugin install root plus `--workspace`. A global install resolves the plugin/runtime root separately from the project workspace (`--workspace`, `OSPEC_PROJECT_ROOT`, or the working directory). The dispatcher and `validate-phase` share one parser: only a direct child of a column-0 `route:` counts, a nested `actual_route` does not override it, and a caller-supplied route does not fill a missing direct child. Delivered Node scripts are **not host-enforced** proof of automatic invocation. CX1: the Node and Go `SubagentStop` reducers validate envelopes and perform locked CAS/replay-safe projection when invoked. A v2.67.0–v2.67.3 noop accepts only the frozen key order, including nested `question_gate`; a status-first envelope is not a promised noop, and original JSON bytes are not preserved. Generation and mapping alone do not prove that a given host calls it. `partial` does not mean end-to-end host enforcement. No profile is claimed to mediate all shell commands, network operations, or connectors. Git hooks, where installed, are separate from host lifecycle hooks and cannot substitute for SubagentStop.

Only the Claude Code real HostAdapter has K2a proof binding (`adapter_version`, `host_version`, fixture, `evidence_digest`); other adapters remain inactive stubs. This proof is scoped to its verified capabilities, not blanket PP2/CX1 enforcement. These classifications describe observed repository wiring, not independently verified behavior in every host version.

## 7. Coste de contexto por target (E0.0)

`node scripts/measure-context-baseline.js` genera los 7 targets en memoria con el mismo transform que `configure` y mide qué carga cada host antes de trabajar. Mide sobre la salida generada, no sobre la configuración del perfil, para que cualquier cambio del transform se vea tal cual. Los bytes se normalizan a LF, así que una copia de trabajo con CRLF mide lo mismo que CI.

- **Always-on:** instrucciones que el host inyecta en cada petición: el `AGENTS.md` raíz, el router de Claude (`global-instructions/CLAUDE.md`, que `setup:claude` instala en `~/.claude/CLAUDE.md`), las reglas `.mdc` con `alwaysApply: true`, las `.instructions.md` con `applyTo: "**"` o `trigger: always_on` (Antigravity) y los globs `instructions` de `opencode.json`. El listado de skills va aparte.
- **Orquestador:** `sdd-orchestrator` como skill o agente, o el agente primario de OpenCode. Hasta v2.87.0, en Codex era el `AGENTS.md`.
- **Lecturas por agente:** el agente, las `SKILL.md` que nombra y los ficheros `_shared` que nombran él o esas skills. Es una aproximación determinista: cuenta todo lo nombrado aunque se lea bajo condición, y no sigue las referencias entre ficheros `_shared`. Desde E0.1 cada agente de trabajo lleva incrustado lo que lee (sección `## Embedded references`): esos bytes cuentan como bytes del agente y lo que nombran no se sigue.
- **Skills:** instaladas (sin `_shared` ni las skills de comando de Codex) y listadas al modelo (sin `disable-model-invocation: true`), con los bytes de `name` y `description` del listado.

Línea base en v2.81.3 (KB decimales):

| Target | Always-on | Orquestador | Skills instaladas / listadas | Listado | Fases SDD | Revisores |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| claude | 0 | 62,4 | 83 / 57 | 9,8 | 32,8–73,0 | 36,8–37,1 |
| vscode | 2,4 | 43,8 | 82 / 56 | 9,5 | 33,0–73,2 | 36,8–37,2 |
| github-copilot | 22,7 | 43,6 | 82 / 56 | 9,5 | 32,8–73,0 | 36,8–37,1 |
| opencode | 22,0 | 43,1 | 82 / 56 | 9,5 | 32,9–73,1 | 36,8–37,2 |
| codex | 62,6 | 62,6 | 82 / 75 | 11,5 | 32,9–73,2 | 36,9–37,2 |
| cursor | 25,7 | 47,9 | 82 / 56 | 9,5 | 32,7–73,0 | 36,8–37,1 |
| antigravity | 22,7 | 43,7 | 82 / 56 | 9,5 | 32,9–73,1 | 36,8–37,1 |

`review-change` y `review-correction` leen unos 5 KB porque no nombran ningún fichero `_shared`. El router llegó en E0.4 (ver más abajo).

**Tras E0.1 (v2.83.0).** Los revisores no cambian y la mayoría de las fases bajan unos 0,4 KB, porque se quita el frontmatter y el aviso al orquestador de cada skill. Suben los agentes cuyos módulos condicionales antes no se encontraban en un proyecto consumidor: `sdd-apply` (73,0 → 93,3 KB, módulos de Strict y Focused TDD), `sdd-verify` (48,0 → 68,1 KB, `strict-tdd-verify` y el formato del informe), `sdd-init` (+5,3 KB), `sdd-document` (+4,5 KB) y `sdd-foundation` (+2,5 KB). Ese es el coste de que la garantía de Strict TDD funcione fuera de este repositorio. Rango de fases SDD: 32,7–93,4 KB en todos los targets.

**Tras E0.2 (v2.84.0).** Cada regla conserva el ámbito de su fuente (REQ-generator-020): la regla global de atribución sigue siendo *always-on*; las reglas de `agents/**` (protocolo SDD común y Engram) viajan dentro del orquestador, como en Claude; y las de ruta (`openspec/**` y Strict TDD) se cargan con el mecanismo nativo de cada host. OpenCode no tiene ámbito por ruta, así que la de OpenSpec pasa al orquestador y la de Strict TDD no se carga, como en Claude. Cursor deja de recibir el `AGENTS.md` de este repositorio.

| Target | Always-on | Orquestador |
| --- | ---: | ---: |
| github-copilot | 22,7 → 2,4 | 43,6 → 54,4 |
| opencode | 22,0 → 2,3 | 43,1 → 60,1 |
| cursor | 25,7 → 2,4 | 47,9 → 58,7 |
| antigravity | 22,7 → 2,4 | 43,7 → 54,6 |

Fuera de SDD, cada petición carga unos 20 KB menos. En una sesión SDD el total también baja (por ejemplo, en Copilot pasa de 66,3 a 56,8 KB), porque las reglas de ruta solo entran cuando se tocan esos ficheros. Codex no cambia: su `AGENTS.md` es el orquestador y le corresponde a E0.4.

**Tras E0.3 (v2.86.0 y v2.87.0).** El catálogo baja de 82 a 61 skills instaladas por target (de 83 a 62 en Claude) y el listado de skills de unos 9,5 KB a 4,9 KB (5,1 KB en Claude y 6,8 KB en Codex, que también lista sus skills de comando). En v2.86.0 se eliminan o fusionan skills; en v2.87.0 seis pasan al paquete opcional `--with-extras` (REQ-generator-021), que la medición no cuenta porque mide la build por defecto.

**Tras E0.4 (a), v2.88.0.** El router (`rules/ospec-router.instructions.md`, REQ-generator-022) es la única entrada *always-on* a SDD en los 7 targets: dice que SDD solo se usa con `/sdd-*` o con una petición explícita y nombra el orquestador del host. Codex deja de cargar el orquestador en cada sesión: su `AGENTS.md` lleva solo el router y la regla de atribución, como bloque con marcadores (REQ-install-033), y el orquestador pasa a la skill `sdd-orchestrator`. Claude recibe el mismo bloque en `~/.claude/CLAUDE.md`. La regla de atribución se compacta (2,4 → 1,5 KB) para que router y regla quepan en 4 KB.

| Target | Always-on | Orquestador |
| --- | ---: | ---: |
| claude | 0 → 2,7 | 62,9 → 60,6 |
| codex | 63,0 → 2,7 | 63,0 → 61,0 (skill) |
| vscode, github-copilot, cursor, antigravity | 2,4 → 3,0 | sin cambios |
| opencode | 2,3 → 2,7 | sin cambios |

**Tras E0.4 (b), v2.89.0.** El orquestador nombra sus ficheros `_shared` con la ruta de la copia instalada (REQ-generator-023 y REQ-install-034). En Claude es `${CLAUDE_SKILL_DIR}/../_shared`; en los demás targets, un marcador que el instalador sustituye. Las rutas más largas suben el orquestador entre 0,2 KB (los targets con marcador) y 0,5 KB (Claude). La medición cuenta el marcador sin sustituir, así que en una instalación global real se añaden unos cientos de bytes más, según la longitud de la ruta.

**Techos.** `scripts/fixtures/context-baseline.json` guarda cada valor como techo, y `scripts/lib/context-baseline.test.js` falla si alguno sube o si aparece un target o un agente sin techo. Cuando un cambio reduce contexto, o lo aumenta con una justificación escrita en el PR, se regenera con `--update`. `--json` saca el informe completo, con el detalle por fichero.
