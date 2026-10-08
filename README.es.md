# ospec-workflow

![ospec-banner.png](docs/banner-op/ospec-banner.png)

> [🌐 English](./README.md) · **Español**

> **Un cambio está hecho cuando la evidencia lo dice, no cuando lo dice el agente.** `ospec-workflow` es un arnés de desarrollo guiado por impacto (IDD, *impact-driven development*) para agentes de programación con IA. Cada cambio de código pasa por el CLI `ospec`: deriva las obligaciones del cambio a partir de lo que toca, registra evidencia solo de ejecuciones que observa y cierra el cambio cuando todas las obligaciones están satisfechas. El desarrollo guiado por especificación (SDD) con OpenSpec sigue disponible como modo opcional.

Está basado en [Gentle-ai de Gentleman Programming](https://github.com/Gentleman-Programming/gentle-ai).

---

## IDD: obligaciones según el impacto, evidencia de ejecuciones reales

Un arreglo de una línea y una migración de esquema no necesitan la misma ceremonia. IDD no tiene fases ni documentos que escribir antes; el impacto del cambio decide qué debe:

1. **El impacto decide el trabajo**: `ospec signals` lee los ficheros que toca el cambio (y después el diff real) y activa señales; cada señal añade una obligación.
2. **Evidencia sobre opinión**: una obligación solo se satisface con evidencia que el CLI registra de una ejecución que observa (`ospec run`, `ospec check`, `ospec review`). Decir que los tests pasan no satisface nada.
3. **Preguntar antes de decidir**: el agente solo se detiene en cuatro gates, y solo una respuesta explícita tuya resuelve uno.
4. **El repositorio es la memoria**: cada cambio vive en `idd/<cambio>/state.yaml` (lo gestiona el CLI) y se archiva en `idd/archive/` cuando `ospec close` termina bien.

| Señal | Se activa cuando | Obligación |
| --- | --- | --- |
| `always` | Todo cambio con intención resuelta | `checks-pass`: `ospec check` ejecuta los checks declarados en `idd/config.yaml` sobre el árbol actual |
| `bug-fix` | La intención es un bug | `repro-test`: el test de reproducción falla primero y después pasa |
| `strict-tdd` | `strict_tdd: true` en `idd/config.yaml` | `tdd-red-green`: un par rojo → verde por unidad |
| `public-contract` | El cambio toca rutas de API, esquemas OpenAPI, proto o GraphQL, o lo que publica un `package.json` no privado | `contract-spec-and-test`: el documento de contrato y su test cambian en el diff |
| `persistent-data` | El cambio toca migraciones, SQL o esquemas de ORM | `migration-compat-and-test`: un test de migración con plan de compatibilidad o de vuelta atrás |
| `security-boundary` | El cambio toca autenticación, seguridad, permisos, secretos o credenciales | `trust-review`: una revisión de confianza acotada y de solo lectura |
| `multi-unit-or-decision` | Varias unidades de trabajo o una decisión de diseño registrada | `living-doc`: `idd/<cambio>/change.md` mantiene al día el plan y las decisiones |

Los patrones se adaptan al stack detectado (Node, JVM, .NET, Python, Go) y se amplían en `impact:` de `idd/config.yaml`. Los cuatro gates son `ambiguous-intent` (aún no se puede enunciar la aceptación), `open-facts` (comportamientos que ni la petición ni el código fijan, preguntados todos juntos antes de editar), `irreversible-operation` y `adr-amend-or-contradict`.

---

## Inicio Rápido en 3 Pasos

### 1. Nada que copiar: el instalador añade un router pequeño
Cada instalador añade un router pequeño a las instrucciones que tu host carga en cada petición ([`rules/ospec-router.instructions.md`](rules/ospec-router.instructions.md)). Manda los cambios de código a IDD por defecto, deja directas las preguntas y el trabajo de solo lectura, y entra en SDD **solo** cuando ejecutas un comando `/sdd-*` o pides trabajo guiado por especificación. Claude Code y Codex lo reciben como un bloque con marcadores en `~/.claude/CLAUDE.md` y `AGENTS.md`, junto a tu propio texto; usa `--no-router` para no instalarlo o quitarlo.

### 2. Instalar el Plugin en tu Herramienta
Elige tu target y ejecuta su configurador automático:

| Entorno / Target | Comando de Instalación Rápida | ¿Qué hace? |
| :--- | :--- | :--- |
| **VS Code** | `npm run setup:vscode` | Compila a `dist/vscode` y lo añade a `chat.pluginLocations`. |
| **Claude Code** | `npm run setup:claude` | Compila, valida de forma estricta e instala como plugin persistente. |
| **Copilot CLI** | `npm run setup:copilot` | Compila e instala globalmente en tu máquina (`~/.copilot/`). |
| **opencode** | `npm run setup:opencode` | Compila e instala en la carpeta de OpenCode (`~/.config/opencode/`). |
| **Codex CLI** | `npm run setup:codex` | Compila `dist/codex`, registra el marketplace, añade solo los MCP globales que falten y copia `.codex/agents/*.toml`. |
| **Cursor** | `npm run setup:cursor` | Compila `dist/cursor`, sincroniza a `~/.cursor/`, configura MCPs y preserva hooks. |
| **Antigravity** | `npm run setup:antigravity` | Compila `dist/antigravity` e instala en `~/.gemini/config/` con manifiesto transaccional. |

### 3. Pide un cambio
Una vez cargado el plugin en tu agente de chat, pide el cambio con tus palabras («haz que la sesión caduque tras 30 minutos de inactividad»). El router lo manda a IDD:
1. **Declara tus checks una vez**: `ospec check` ejecuta los comandos de `checks:` en `idd/config.yaml`. Créalo una vez en la raíz del proyecto:
   ```yaml
   checks:
     test: npm test
   ```
2. **Responde los hechos abiertos**: el agente registra la intención, enumera los comportamientos que la petición deja abiertos y los pregunta todos juntos antes de editar.
3. **Deja que el CLI lo cierre**: el agente sigue `ospec next` hasta que `ospec close` termina bien y archiva el cambio en `idd/archive/`. Ramas, commits y PRs siguen siendo decisión tuya.

En Claude Code también puedes entrar en IDD de forma explícita con `/ospec-workflow:idd <petición>`. Para apagar IDD en un proyecto, declara `mode: sdd` en `idd/config.yaml`: el agente trabaja entonces directo y entra en SDD solo si se lo pides. Los cambios SDD en curso terminan en SDD.

---

## Configuración Detallada por Target

### 🛠️ VS Code (Agent Plugin desde `dist/vscode`)
VS Code carga el árbol compilado, no el source: el source aún lleva marcadores que solo la build sustituye, y todo el paquete SDD.
```powershell
npm run setup:vscode
```
Compila `dist/vscode` y lo añade a `chat.pluginLocations`. Para actualizar tras un pull, ejecuta `npm run reload:vscode` y recarga VS Code. `node scripts/ospec.js doctor --target vscode` avisa de entradas duplicadas, inexistentes o que cargan el checkout fuente.

### 🤖 Claude Code (Plugin Persistente y Marketplace)
- **Para usuarios finales** (sin clonar el repositorio):
  ```powershell
  claude plugin marketplace add https://github.com/snakeblack/ospec-workflow.git#release
  claude plugin install ospec-workflow@ospec-tools
  ```
  La build del marketplace es la de por defecto: IDD sin el paquete SDD. Para SDD, instala desde un checkout con `npm run setup:claude -- --with-sdd`.
- **Para desarrollo del plugin** (instalación idempotente local):
  ```powershell
  npm run setup:claude
  ```
  *(Dentro de la sesión de Claude Code, escribe `/reload-plugins` para aplicar cambios).*
- **Memoria de sesión con Engram**: se configura automáticamente si el binario `engram` está en el PATH (`--no-engram` para omitirlo); ver [Memoria de sesión con Engram](#-memoria-de-sesión-con-engram-todos-los-targets).
- **Reconstrucción rápida durante el desarrollo**:
  ```powershell
  npm run reload:claude
  ```

### 💻 GitHub Copilot CLI (Carga Global)
- **Instalación Global (Recomendado)**:
  ```powershell
  npm run setup:copilot
  ```
  *(Esto copia agentes, instrucciones y comandos a `~/.copilot/` y fusiona el archivo `mcp-config.json` global).*
- **Instalación Local (Solo para un proyecto específico)**:
  ```powershell
  npm run install:copilot -- ../mi-proyecto
  ```

### 🧬 opencode
- **Instalación Global (Recomendado)**:
  ```powershell
  npm run setup:opencode
  ```
  *(El agente principal se renombra automáticamente a `ospec-workflow` para facilitar su descubrimiento por autocompletado).*
- **Instalación Local**:
  ```powershell
  npm run install:opencode -- ../mi-proyecto
  ```

### 🧠 Codex CLI
- **Instalación Global (Recomendado)**:
  ```powershell
  npm run setup:codex
  ```
  *(Compila `dist/codex`, escribe el router como bloque en `~/.codex/AGENTS.md`, sincroniza agentes, skills y runtime en `~/.codex/`, fusiona hooks nativos en `~/.codex/hooks.json` y registra los MCP globales que falten.)*
- **Instalación Local por repositorio**:
  ```powershell
  npm run install:codex -- ../mi-proyecto
  ```
  *(Copia solo `.codex/agents/*.toml` al repo destino y no modifica `.codex/config.toml`.)*

  Por defecto el instalador no altera `.codex/config.toml`. Si Codex rechaza la clave heredada exacta `service_tier = "default"`, la reparación es un opt-in explícito:
  ```powershell
  npm run setup:codex:repair
  ```
  El script dedicado es la ruta recomendada en Windows PowerShell porque no depende del forwarding de flags de npm. Como fallback puede ejecutarse `node scripts/configure/install-codex.js --repair-config`; para previsualizar sin escribir, usa `node scripts/configure/install-codex.js --dry-run --repair-config`.

  La reparación elimina únicamente esa asignación top-level, conserva un backup único byte a byte y restaura el original si falla la escritura, el rename o la validación con Codex. Otras claves no compatibles quedan intactas y producen un diagnóstico. No toca `auth.json`, otras claves ni entradas MCP; la instalación local por repositorio nunca repara configuración global.

### 🖱️ Cursor
- **Instalación Global**:
  ```powershell
  npm run setup:cursor
  ```
  *(Compila `dist/cursor`, sincroniza a `~/.cursor/`, traduce `.mcp.json` y preserva hooks de usuario en `hooks.json`.)*

### 🌌 Antigravity IDE
- **Instalación Global**:
  ```powershell
  npm run setup:antigravity
  ```
  *(Compila `dist/antigravity` con perfiles y validación, desplegando skills, agentes y hooks adaptados en `~/.gemini/config/` con manifiesto transaccional.)*
- **Reconstrucción rápida durante el desarrollo**:
  ```powershell
  npm run reload:antigravity
  ```

Consulta la [guía de instalación](docs/plugin-installation.md) para más detalles sobre la instalación nativa global y el runtime de hooks.

### 🧭 Paquete opcional SDD (todos los targets)
El modo SDD (las skills y agentes `sdd-*` con el orquestador, los comandos `/sdd-*` y las reglas `sdd-*`) no se instala por defecto. Añade `--with-sdd` a cualquier instalador para incluirlo (`npm run setup:claude -- --with-sdd`, `node scripts/configure/install-codex.js --with-sdd`); el instalador TUI lo ofrece como paquete «Modo SDD». Una reinstalación sin el flag conserva SDD si la instalación anterior lo traía y lo avisa; `--no-sdd` lo quita. Los agentes `review-*`, `skills/_shared/` y el runtime se quedan en toda instalación porque IDD los usa.

### 🧩 Paquete opcional de extras (todos los targets)
`issue-creation`, `comment-writer`, `gh-release-notes`, `judgment-day`, `caveman-compress` y `stack-webmcp` no se instalan por defecto. Añade `--with-extras` a cualquier instalador para incluirlas (`npm run setup:claude -- --with-extras`, `node scripts/configure/install-codex.js --with-extras`). Cada instalación elimina lo que la nueva build ya no trae, así que volver a ejecutar un instalador sin el flag las desinstala.

### 🧠 Memoria de sesión con Engram (todos los targets)
Cada `npm run setup:<target>` (Claude, Codex, Antigravity, opencode, Cursor, VS Code, Copilot CLI) configura [Engram](https://github.com/Gentleman-Programming/engram) automáticamente si el binario `engram` está en el PATH. Para ello ejecuta el `engram setup <agente>` oficial (`claude-code`, `codex`, `antigravity-cli`, `opencode`, `cursor`, `vscode-copilot`). Copilot CLI no tiene setup oficial, así que en su caso el instalador añade una entrada `engram mcp` a `~/.copilot/mcp-config.json`. El paso es idempotente y fail-open, y nunca cambia el código de salida de la instalación. Para omitirlo, usa `--no-engram` (`npm run setup:codex -- --no-engram`). Sin el binario, el instalador solo muestra cómo instalarlo.
- **Claude Code en Windows**: una sonda corta de fork en Git Bash decide si se puede desactivar el modo seguro del hook oficial (`ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` en `~/.claude/settings.json`). Ese modo seguro desactiva la captura de prompts y los recordatorios de guardado. Si ya tienes un valor, nunca se sobrescribe. Los hooks oficiales necesitan bash, jq y curl.
- **Cursor**: Cursor no lee reglas globales desde disco, así que hay que pegar una vez `~/.cursor/engram-memory-protocol.md` en Settings → Rules → User Rules.
- Todos los targets llevan el mismo addendum de memoria SDD, neutral respecto al host. Engram no es autoritativo: `idd/` y el estado de OpenSpec en disco siguen siendo la fuente de verdad.

## Qué incluye

| Ruta | Propósito |
| --- | --- |
| `rules/ospec-router.instructions.md` | El router *always-on*: IDD por defecto para cambios de código y SDD solo bajo petición, a través del orquestador del host. Los instaladores lo añaden en todos los targets. |
| `skills/idd/` | El protocolo IDD que carga el router para un cambio de código. |
| `scripts/ospec.js` | El CLI `ospec` (`status`, `next`, `record`, `signals`, `check`, `run`, `review`, `close`), que viaja con el runtime. |
| `idd/` | Configuración IDD (`config.yaml`), cambios en curso y `archive/`, en cada proyecto. |
| `.plugin.json` | Manifiesto **canónico** (VS Code/direct-load). Editá este primero. |
| `.claude-plugin/plugin.json` | Copia de compatibilidad para la distribución Claude; también es la fuente que lee el generador (`scripts/configure/cli.js`). Debe reflejar el canónico — `scripts/manifest-sync.test.js` lo verifica en CI. |
| `agents/` | Orquestador y agentes especializados por fase. |
| `commands/` | Comandos visibles y routing hacia el orquestador. |
| `skills/` | Capacidades bajo demanda y contratos compartidos. |
| `rules/` | Reglas persistentes de SDD, OpenSpec y Strict TDD. |
| `hooks/` | Declaración de eventos del ciclo de vida del plugin. |
| `scripts/hooks/` | Runtime de los hooks (Node.js) y sus tests. |
| `scripts/lib/` | Librerías compartidas: estado OpenSpec, artifact-store y el núcleo del generador (`frontmatter`, `model-resolver`, `target-transform`, perfiles). |
| `scripts/configure/` | CLI del generador multi-target (`cli.js`), validadores por perfil y fixtures golden. |
| `models.yaml` | Tablas tier→modelo por target para el generador. |
| `profiles/models/` | Perfiles opcionales de routing de modelos (uso directo en VS Code). |
| `docs/` | Documentación detallada de arquitectura y uso. |
| `.mcp.json` | Fuente MCP canónica. Codex no la empaqueta: `setup:codex` traduce sus entradas al CLI nativo y evita duplicados. |
| `openspec/` | Fuente de verdad versionable de cada cambio SDD. |

## Modo SDD opcional

SDD lleva un cambio por fases planificadas (propuesta, specs, diseño, tareas, apply, verify, archive) con artefactos OpenSpec. Úsalo cuando quieras el contrato escrito y aprobado antes de cualquier código: instala el paquete con `--with-sdd` y ejecuta un comando `/sdd-*` o pide trabajo guiado por especificación («hazme un SDD para X»). El resto de esta sección describe ese modo.

### Comandos SDD

| Comando | Uso |
| --- | --- |
| `/sdd-init` | Detecta el proyecto y prepara OpenSpec, testing y registro de skills. |
| `/sdd-baseline` | Seed openspec/specs/ with baseline specs of existing behavior (brownfield repos, resumable batches). |
| `/sdd-workspace` | Gestiona la federación multi-repo: atlas (`init`), estado cross-repo (`status`), impacto por contratos (`impact`). |
| `/sdd-new` | Inicia un cambio persistido y selecciona el workflow. |
| `/sdd-lite` | Ejecuta el flujo reducido para cambios pequeños y de bajo riesgo. |
| `/sdd-ff` | Completa la planificación: propuesta, specs, diseño y tareas. |
| `/sdd-continue` | Reanuda la siguiente fase disponible desde OpenSpec. |
| `/sdd-explore` | Investiga una idea sin implementar. |
| `/sdd-propose` | Define intención, alcance, riesgos y enfoque del cambio. |
| `/sdd-spec` | Escribe requisitos y escenarios verificables. |
| `/sdd-design` | Define arquitectura, flujo de datos y estrategia de testing. |
| `/sdd-tasks` | Divide el cambio en unidades implementables y revisables. |
| `/sdd-apply` | Implementa tareas en tandas revisables. |
| `/sdd-verify` | Comprueba specs, diseño, tareas y evidencia de tests. |
| `/sdd-archive` | Consolida y archiva un cambio verificado. |
| `/sdd-onboard` | Guía un ciclo SDD real sobre el repositorio actual. |

`sdd-foundation` crea la base documental cuando el proyecto está vacío. Los agentes de fase no deben invocarse como un equipo descoordinado: el orquestador conserva el orden y los contratos.

### Flujos SDD

El ciclo completo estándar recorre todas las fases de planificación, implementación y cierre:

```text
propose → spec → design → tasks → apply → verify → archive
```

Pero no todo cambio necesita el ciclo entero. El orquestador evalúa la tabla de routing
(`openspec/config.yaml`) de arriba a abajo y activa la **primera ruta que coincide**.

#### Rutas canónicas

| Ruta | Clasificación | Cuándo | Fases |
| --- | --- | --- | --- |
| **foundation** | normal, high-risk | Proyecto vacío, sin stack ni arquitectura | `sdd-foundation` |
| **federated** | normal, high-risk | Workspace multi-repo (`workspace-federated`) | `sdd-workspace` → propose → spec → design → tasks → apply → verify → archive |
| **bugfix** | small, normal | El usuario indica intención explícita de bugfix | `sdd-explore` → tasks → apply → verify → archive |
| **brownfield** | normal, high-risk | Hay código pero `openspec/specs/` está vacío | `sdd-baseline` (en tandas por dominio) |
| **refactor** | small, normal | El usuario indica intención explícita de refactor | design → tasks → apply → verify → archive |
| **hotfix** | trivial, small | Parche de emergencia explícito | apply → verify → archive |
| **standard** | normal, high-risk | Proyecto activo (ruta por defecto) | propose → spec → design → tasks → apply → verify → archive |
| **lite** | trivial, small | Cambio pequeño y de bajo riesgo | propose → tasks → apply → verify → archive |

#### Atajos de entrada

| Comando | Qué hace |
| --- | --- |
| `/sdd-new` | Clasifica el cambio, selecciona la ruta y arranca la primera fase. |
| `/sdd-ff` | Fast-forward de planificación: ejecuta propose → spec → design → tasks sin implementar. |
| `/sdd-lite` | Inicia la ruta lite directamente. |
| `/sdd-continue` | Recupera estado desde `state.yaml` y reanuda la siguiente fase pendiente. |

#### Gates

Algunas rutas incluyen gates que bloquean el avance hasta que se resuelven:

- **clarify** — el orquestador detecta ambigüedad y pide aclaraciones antes de continuar.
- **4r-review-gate** — tras un `sdd-verify` exitoso, evalúa si el cambio requiere revisión humana.
- **impact** — en rutas federadas, evalúa impacto cross-repo antes de implementar.
- **brownfield-advisory** — informa sobre el estado de baseline antes de ejecutar.

#### Implementación por tandas

`/sdd-apply` trabaja por tandas revisables (fusiona `apply-progress.md`). Cuando el cambio supera el
presupuesto de ~400 líneas, el orquestador propone PRs encadenadas (`stacked-to-main` o
`feature-branch-chain`) o exige una `size:exception` consciente.

#### Modos de ejecución

| Modo | Comportamiento |
| --- | --- |
| **Interactive** (default) | Pausa entre fases para revisar decisiones. |
| **Automatic** | Encadena fases sin pausar, pero nunca evita los gates de riesgo, arquitectura, testing o carga de revisión. |

Detalle completo en [docs/sdd-workflows.md](docs/sdd-workflows.md).

## Runtime y continuidad

Los hooks descargan del prompt tareas repetitivas del ciclo de vida y aplican políticas de seguridad y control:

| Evento | Responsabilidad |
| --- | --- |
| `SessionStart` | Valida OpenSpec, refresca la caché compacta de skills y ejecuta escaneos de seguridad de **AgentShield** (alertas por archivos `.env` expuestos o credenciales en `.git/config`). |
| `PreToolUse` | Bloquea o solicita confirmación para comandos peligrosos, evalúa límites de **Token Budget Advisor** (límite de 50k tokens por archivo, 150k tokens acumulados por sesión) e implementa **AgentShield** (bloqueo de claves SSH, `.npmrc`, `.git/config`, y prompts interactivos ante secretos). |
| `PreCompact` | Persiste un resumen recuperable antes de compactar contexto. |
| `SubagentStop` | Detecta degradación en la resolución de skills. |
| `Stop` | Registra la continuidad mínima de la sesión. |

### Variables de Entorno de Bypass (Harness Gates)

Puedes omitir temporalmente las distintas comprobaciones de seguridad, presupuestos y validadores utilizando las siguientes variables de entorno:

- `DISABLE_AGENT_SHIELD=true`: Desactiva el escaneo y los bloqueos/preguntas de archivos sensibles y credenciales (AgentShield).
- `DISABLE_TOKEN_ADVISOR=true`: Desactiva la comprobación del tamaño de tokens estimados en lecturas de archivos de la sesión (Token Budget Advisor).
- `DISABLE_OSPEC_PRECOMMIT=true`: Desactiva la ejecución local de la validación del espacio de trabajo y Strict TDD en el hook pre-commit de Git.

Los hooks ejecutan código nativo (Node.js o ejecutables Go optimizados). `.ospec/cache` y `.ospec/session` son auxiliares; **`idd/` y el estado de OpenSpec en disco siguen siendo la fuente de verdad**.

## Routing de modelos

Los agentes no fijan nombres de modelos concretos. Por defecto heredan el modelo seleccionado y pueden usar perfiles locales:

- `default`: fallback de un solo modelo;
- `cheap`: reduce coste en exploración y propuesta;
- `premium`: aumenta razonamiento en diseño y verificación.

Los perfiles viven en `profiles/models/`. Consulta [model-routing.md](docs/model-routing.md).

## Compatibilidad multi-target

El origen canónico está en formato VS Code y se carga directamente, sin transformación.
Para otros targets, un generador puro (`scripts/configure/cli.js`) produce un árbol nativo
y validado en `dist/<target>/` sin tocar el origen:

| Target | Salida |
| --- | --- |
| `vscode` | Identidad canónica: VS Code carga el repositorio tal cual, sin generar `dist/`. |
| `claude` | Árbol `.claude-plugin`: renombra archivos, reestructura manifiesto y hooks, sustituye herramientas (context-aware), reescribe variables de comando, incorpora `rules/` y emite el orquestador como **skill**. Gate: `claude plugin validate --strict` 0/0. |
| `github-copilot` | Layout `.github/`: agentes a `.github/agents/*.agent.md` (`target: github-copilot`, `vscode/askQuestions`→`ask_user`), comandos a `.github/prompts/*.prompt.md`, reglas a `.github/instructions/*.instructions.md` (con el `applyTo` de origen; las de `agents/**` van dentro del agente orquestador), hooks a `.github/hooks/hooks.json` (schema Copilot) y `.mcp.json` tal cual. Validado por `scripts/configure/validate-github-copilot.js` dentro del flujo de perfiles. |
| `opencode` | Layout `.opencode/` + `opencode.json`: agentes a `.opencode/agents/*.md` (`mode: primary\|subagent`, `tools:` como **mapa**, modelo `provider/model`), comandos a `.opencode/commands/*.md` (conserva `agent:`, args `$1`/`$ARGUMENTS`), reglas a `.opencode/instructions/*.md` referenciadas por `instructions` en `opencode.json`, MCP plegado dentro de `opencode.json` (`mcp` con `type: local\|remote`) y, como opencode no tiene hooks de shell, el runtime se puentea con un plugin JS en `.opencode/plugins/ospec.js`. Validado por `scripts/configure/validate-opencode.js`. |
| `codex` | Layout `.codex-plugin/` + `.codex/agents/*.toml`, sin `.mcp.json` en el bundle: el plugin y los agentes se instalan por separado; `setup:codex` registra MCPs globales faltantes con IDs válidos y deduplicación por identidad. El generador rechaza `.codex/config.toml`, `.mcp.json` y `mcpServers` dentro del payload. Validado por `scripts/configure/validate-codex.js`. |

```powershell
node scripts/configure/cli.js --target claude          --out dist/claude
node scripts/configure/cli.js --target codex           --out dist/codex
node scripts/configure/cli.js --target github-copilot  --out dist/github-copilot
node scripts/configure/cli.js --target opencode        --out dist/opencode
```

La transform es pura y testeada bajo Strict TDD; el CLI es la capa de IO con un gate de
validación por target (golden fixtures, `claude plugin validate` para `claude` y validadores Node para GitHub Copilot y opencode). La selección de
modelo se abstrae en tiers (`models.yaml`). Cada árbol generado es **autocontenido**: el generador
sigue los `require` desde los hooks e incluye su runtime (`scripts/hooks/` + sus dependencias de
`scripts/lib/`), sin tests ni el propio generador. Consulta [model-routing.md](docs/model-routing.md)
y la [guía de instalación](docs/plugin-installation.md).

## MCP

La configuración predeterminada se mantiene deliberadamente pequeña:

- Context7 para documentación actualizada de librerías;
- MarkItDown para conversión de documentos.

Los servidores adicionales deben activarse explícitamente. Consulta [mcp-policy.md](docs/mcp-policy.md).

## Garantías del workflow

- Un cambio solo está hecho cuando `ospec close` termina bien; las obligaciones solo se satisfacen con evidencia de ejecuciones que observa el CLI.
- Strict TDD cuando el proyecto lo activa (`strict_tdd: true` en IDD, un runner compatible en SDD).
- Estado del cambio recuperable desde disco: `idd/<cambio>/` en IDD, `openspec/changes/{change-name}/` en SDD.
- Gates y aprobaciones persistidos en `state.yaml`, resueltos solo con una respuesta explícita, nunca inferidos del historial del chat.
- Prompts dinámicos delimitados para separar intención, artefactos, estándares y contexto de aprobación.
- Skills resueltas como reglas compactas para controlar el presupuesto de tokens.
- Cambios organizados en unidades revisables, con guardas cuando la carga supera el presupuesto recomendado.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice y recorrido recomendado. |
| [openspec/specs/idd/spec.md](openspec/specs/idd/spec.md) | Contrato IDD: señales, obligaciones, gates y el CLI `ospec`. |
| [docs/sdd-metodologia.md](docs/sdd-metodologia.md) | Modo SDD: principios y modelo mental. |
| [docs/sdd-fases.md](docs/sdd-fases.md) | Contratos de cada fase. |
| [docs/sdd-workflows.md](docs/sdd-workflows.md) | Líneas de trabajo: estándar, lite, fast-forward, foundation, baseline brownfield, continuación, workspace y onboarding. |
| [docs/openspec.md](docs/openspec.md) | Persistencia, specs delta y archivado. |
| [docs/tdd-y-revision.md](docs/tdd-y-revision.md) | Strict TDD y presupuesto de revisión. |
| [docs/harness-runtime.md](docs/harness-runtime.md) | Arquitectura del runtime de hooks. |
| [docs/model-routing.md](docs/model-routing.md) | Tiers de modelo y formato por target (`models.yaml`). |
| [docs/mcp-policy.md](docs/mcp-policy.md) | Política y configuración de servidores MCP. |
| [docs/plugin-installation.md](docs/plugin-installation.md) | Instalación, generación por target, confianza y diagnóstico. |

## Validación

Un solo comando cubre la verificación local y de CI del runtime de hooks, generador multi-target,
validadores de perfiles y artefactos esperados:

```powershell
node scripts/check.js
```

CI ejecuta el mismo gate en `.github/workflows/validate-harness.yml` con Node 22 y matriz multi-OS.

Antes de publicar cambios en el manifiesto, hooks, MCP o el generador, revisa expresamente la nueva
superficie de ejecución y confianza.
