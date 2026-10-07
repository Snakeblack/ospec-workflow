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

## 4. Estados de capacidad K2a (retirados)

E1.5 retiró en v2.97.0 el HostAdapter de Claude, el Headless Conformance Host y
los `CapabilityProof` de K2a, que ningún target usaba en un proyecto
consumidor. El vocabulario `enforced | partial | instructional | unavailable`
sigue en los esquemas de `schemas/kernel`; si E5.1 (matriz de capacidades por
target) lo necesita, parte de ahí.

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

**Tras E0.3 (c), v2.90.0.** Las 24 skills de stack pasan a 13, una por tecnología (REQ-skills-021): las de testing, rendimiento, seguridad y frameworks de Go, Kotlin, Python, React y Spring Boot son ahora `references/` de su skill y se leen bajo demanda. Quedan 50 skills instaladas por target (51 en Claude) y el listado baja a 4,0 KB (4,2 KB en Claude y 6,1 KB en Codex). Un proyecto Kotlin inyectaba hasta cinco bloques de reglas de stack, que agotaban el tope de cinco; ahora inyecta uno.

**Tras E0.3 (d), v2.91.0.** Se retiran las lentes de review v1 (`review-risk`, `-reliability`, `-resilience` y `-readability`), con sus agentes y skills. Quedan 46 skills instaladas por target (47 en Claude y Codex) y cuatro agentes menos. El listado no cambia, porque esas skills no se listaban. Un linaje v1 sigue legible durante una versión menor; si aún le faltan lentes, migra a v2 o se sustituye por un sucesor v2 aprobado ([ADR-003, enmienda](adr/adr-20260903-003-dual-schema-lineage-migration.md)).

**Tras E1.6 (a), v2.108.0.** El router añade la entrada a IDD con `mode: idd` (REQ-generator-024), y *always-on* sube unos 0,3 KB: 2,9 KB en Claude (antes 2,7), 2,9 KB en Codex y OpenCode, 3,2 KB en VS Code y Copilot, y 3,3 KB en Cursor y Antigravity. Todos siguen por debajo de 4 KB. La skill `idd` (4,5 KB, bajo demanda) suma una skill instalada y listada por target, y el listado sube 0,2 KB (4,2 KB; 4,4 KB en Claude y 6,3 KB en Codex).

**Tras E1.6 (d1) y (d2), v2.112.0 y v2.113.0.** IDD pasa a ser el flujo por defecto, y el paquete SDD (skills, agentes, comandos y reglas `sdd-*`, con el orquestador) se instala solo con `--with-sdd` (REQ-generator-025). En la build por defecto, el orquestador pasa de 44–61 KB a 0, las skills instaladas de 47–48 a 31, los agentes de 22–23 a 6 (los `review-*`) y el listado de Codex de 6,4 KB a 4,2 KB. *Always-on* sube 64 B por la línea del router que pide reinstalar con `--with-sdd` si falta SDD (3,1–3,5 KB, bajo 4 KB). Con `--with-sdd`, el contexto es el de v2.111.0.

**Techos.** `scripts/fixtures/context-baseline.json` guarda cada valor como techo, y `scripts/lib/context-baseline.test.js` falla si alguno sube o si aparece un target o un agente sin techo. Cuando un cambio reduce contexto, o lo aumenta con una justificación escrita en el PR, se regenera con `--update`. `--json` saca el informe completo, con el detalle por fichero.
