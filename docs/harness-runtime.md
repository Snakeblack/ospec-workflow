# Harness Runtime

## Objetivo

Reducir carga permanente del prompt y mover automatización repetitiva a hooks.

## Diagrama General de Flujos y Componentes

El siguiente diagrama detalla cómo interactúan los comandos de usuario, el orquestador, los agentes de fase, las capas de persistencia y el ciclo de vida de los hooks (seguridad, tokens y Git):

![Harness Runtime](./diagramas/harness-runtime.png)

## Capas

1. Commands: routing visible.
2. Orchestrator: coordinación.
3. Phase agents: ejecución.
4. Skills: capacidades on-demand.
5. Hooks: lifecycle automation.
6. OpenSpec: fuente de verdad.
7. `.ospec/cache`: cache auxiliar; el registro compacto de skills vive en `.ospec/cache/skill-registry.cache.json`.
8. `.ospec/session`: continuidad auxiliar.

### Esquema de la cache del registro (v2)

`.ospec/cache/skill-registry.cache.json` usa `version: 2`:

```json
{
  "version": 2,
  "fingerprint": "sha256:…",
  "generated_at": "…ISO…",
  "skills": [ { "id": "…", "path": "…", "triggers": ["…"], "compact_rules": ["…"] } ],
  "workspace": { "members": [ { "id": "api", "reachable": true } ], "contracts": [ { "id": "auth", "provider": "api", "consumers": ["web"] } ] }
}
```

- `workspace` solo aparece en modo `workspace-federated`: federa el atlas (miembros y
  contratos) en la cache para que un delegador lea el contexto cross-repo sin reparsear
  `workspace.yaml`. En modo `openspec` se omite.
- Migración: `session-start` invalida cualquier cache con `version` distinto de 2 (cache miss)
  y la regenera; no hay migración manual.
- El hook reporta `registry.status`: `generated` (creada/refrescada), `reused` (hit de
  fingerprint, sin escritura) o `skipped` (sin OpenSpec).

## No fuente de verdad

`.ospec/` es datos derivados de sesión: resúmenes, costes, mediciones y caché. No se versiona. Cada escritor de `.ospec/` (hooks Node y binario nativo) crea `.ospec/.gitignore` con `*` si falta, así que la carpeta se ignora sola en cualquier repositorio sin tocar su `.gitignore` (REQ-hooks-028); uno que ya existe, o un symlink, no se toca. `npm run setup:git-hooks` y la instalación de Codex en un repositorio añaden además `.ospec/` a `.gitignore` si falta. Ignorar no saca del índice lo ya versionado: `ospec doctor` avisa cuando git sigue ficheros de `.ospec/` y propone `git rm -r --cached .ospec`, y también cuando la carpeta existe y git no la ignora.

`.ospec/cache` y `.ospec/session` nunca sustituyen a OpenSpec. `.atl/` es residuo legacy ignorado; no es estado activo del registro ni del runtime.

## Backend de artefactos (adapter)

Los hooks no conocen rutas concretas. Toda la política de layout vive en un solo
sitio: `scripts/lib/artifact-store.js`. Cada hook crea un store con
`createArtifactStore({ mode, workspace })` y pide rutas y operaciones al
contrato, en vez de hardcodear `openspec/` o `.ospec/`.

| Capa | Qué expone el store |
| --- | --- |
| Canónica (fuente de verdad) | `configPath()`, `isInitialized()`, `readConfig()`, `findActiveChanges()`, `changeDirectory()`, `writeSessionSummary()` |
| Derivada (auxiliar) | `cachePath()`, `sessionSummaryPath()`, `latestSessionPath()`, `runtimeEventPath()`, `appendRuntimeEvent()` |

Modos:

- `openspec` (por defecto): adapter actual. Delega en `scripts/lib/ospec-state.js`;
  comportamiento idéntico al previo a la extracción.
- `workspace-federated`: comparte el layout derivado `.ospec/` (workspace-local) y
  resuelve lo canónico desde un atlas `openspec/workspace.yaml`. `isInitialized` lee el
  atlas; `findActiveChanges` agrega los changes de cada miembro alcanzable etiquetados
  con `source` (coordinador = `.`) reusando `ospec-state.findActiveChanges`; los miembros
  inalcanzables se omiten fail-open. Implementado para **lectura**; la escritura
  coordinada multi-repo queda en el roadmap (`changeDirectory`/`writeSessionSummary`
  permanecen coordinator-local). Parser del atlas: `scripts/lib/workspace-atlas.js`.

Selección de backend: los hooks llaman `createArtifactStoreFromConfig`, que lee
`artifact_store.backend` de `openspec/config.yaml` (`readBackendMode`) y construye el
store; ausente o desconocido → `openspec`. Front door: `sdd-workspace` (init/status/impact).

Este `mode` del arnés (dónde y cómo se resuelve el backend) es distinto del
`artifact_store.mode` de la capa de prompts (`openspec | none`, que decide si una
fase persiste o devuelve inline). Ver [openspec.md](openspec.md) y la
`persistence-contract` compartida.

## Filtros de Seguridad y Presupuesto de Tokens (AgentShield y Token Budget Advisor)

El arnés incorpora políticas activas durante el ciclo de vida del agente para evitar el consumo desmedido de tokens y proteger archivos o credenciales sensibles.

### 1. Token Budget Advisor (PreToolUse)
Avisa antes de leer ficheros grandes para no llenar el contexto del modelo sin que lo notes. Nunca bloquea: pide confirmación (`ask`) y, si la apruebas, la herramienta continúa.
- **Estimación**: por tamaño en disco, sin leer el contenido. Bytes / 4 en extensiones de código (`.js`, `.go`, `.json`, `.yaml`, `.yml`, `.md`, `.ts`, `.py`, `.txt`, `.rs`, `.c`, `.cpp`, `.h`, `.html`, `.css`) y (bytes / 6) × 1.3 en el resto. Cuentan los ficheros que existen y que la herramienta trae en su entrada.
- **Límite por petición**: si la suma estimada de los ficheros de una petición supera **50,000 tokens** (~200 KB en código o ~230 KB en otros formatos), pide confirmación. Funciona sin cambio SDD activo.
- **Límite acumulado**: solo con un cambio SDD activo (`openspec/changes/<cambio>/state.yaml` con `status: active`). Cada petición que pasa los controles se suma en `.ospec/session/<cambio>/token-events.jsonl`. Si el total más lo que pide la petición supera **150,000 tokens**, pide confirmación y recomienda compactar. Mientras el total siga por encima, cada llamada a herramienta vuelve a preguntar, incluidas las que no leen ficheros. Se libera borrando ese registro o cambiando el cambio activo. Sin cambio SDD activo (p. ej. en IDD) no se acumula nada y el nombre del cambio es `unknown`.
- **Modo `bypassPermissions`**: la confirmación pasa a ser un aviso (`systemMessage`) y la lectura continúa.
- **Bypass**: Habilita la variable de entorno `DISABLE_TOKEN_ADVISOR=true` para omitir esta validación.

### 2. AgentShield Security (SessionStart y PreToolUse)
Protege contra fugas de información confidencial y el acceso no deseado a credenciales:
- **SessionStart**:
  - Escanea la raíz del espacio de trabajo para detectar archivos sensibles (`.env`, `.env.local`, `.env.development`, `.env.production`, `.npmrc`) que no estén ignorados en `.gitignore`.
  - Verifica si `.git/config` contiene credenciales incrustadas en texto plano en URLs `http`/`https`.
  - Emite alertas en el canal del sistema si se encuentran riesgos.
- **PreToolUse (Lectura de archivos)**:
  - **Bloqueo Estricto (`deny`)**: Niega el acceso a claves privadas SSH (ej. `id_rsa`, `id_ed25519`, archivos que empiecen con `id_` con extensión `.key`/`.pem`), el archivo `.npmrc` y el archivo `.git/config` del repositorio.
  - **Pregunta Interactiva (`ask`)**: Solicita aprobación explícita del usuario para leer archivos `.env*`, `secrets.json`, `credentials` o cualquier archivo menor a 1 MB que contenga patrones de claves API conocidas (OpenAI `sk-`, Google Cloud `AIzaSy`, AWS `AKIA`, Slack `xox-`, JWT) o expresiones regulares de contraseñas/secretos (`password = "..."`).
- **Bypass**: Habilita la variable de entorno `DISABLE_AGENT_SHIELD=true` para desactivar este escudo.

### 3. Git Pre-commit Hook
Validador local que asegura la calidad, seguridad y consistencia del repositorio antes de consolidar cambios:
- **Instalación**: Se configura de manera idempotente usando `npm run setup:git-hooks` (ejecuta [setup-git-hooks.js](../scripts/setup-git-hooks.js) para instalar los hooks en `.git/hooks/`).
- **Escaneo de Secretos (AgentShield Pre-commit)**: Escanea los archivos y contenidos staged antes del commit; bloquea inmediatamente archivos sensibles (`.env*`, claves privadas SSH, `.npmrc`) y patrones de tokens de credenciales (`sk-...`, `AIzaSy...`, `AKIA...`, JWT, contraseñas). Omitible con `DISABLE_AGENT_SHIELD=true`.
- **Validación de Sintaxis en Memoria**: Verifica sintácticamente archivos JS (`node:vm.Script`) y JSON (`JSON.parse`) en memoria de forma fail-fast (<1 ms por archivo).
- **Validación Diferencial de Workspace**: Invoca `scripts/check.js --staged` para validar únicamente los tests y targets afectados por los archivos staged (<1 s frente a ~63 s de la suite completa), garantizando máxima velocidad sin perder cobertura. Para forzar la suite completa: `OSPEC_PRECOMMIT_FULL=true`.
- **Validación de Strict TDD**: Si `testing.tdd_mode: strict` en `openspec/config.yaml`, rechaza commits si hay cambios de código de producción preparados (`staged`) sin sus correspondientes archivos de prueba (`*_test.go`, `*.test.js`) o su archivo `tasks.md` de planificación.
- **Bypass**: Habilita la variable de entorno `DISABLE_OSPEC_PRECOMMIT=true` o usa `git commit --no-verify`.

### 4. No-Model-Attribution Enforcement (Tres Capas)
Protege estrictamente contra la inserción de atribución AI/modelo en commits y PRs. La política se define en [no-model-attribution.instructions.md](../rules/no-model-attribution.instructions.md) y se aplica mediante **tres capas de defensa**:

| Capa | Cuándo actúa | Qué bloquea |
| --- | --- | --- |
| **PreToolUse DENY** (`pre-tool-use.js`) | Antes de que el agente ejecute `git commit -m "..."` o `gh pr create\|edit` | Escanea `-m`/`--message` del commit y `-t`/`--title`/`-b`/`--body` de la PR; deniega si contienen atribución |
| **Git `commit-msg` Hook** (`commit-msg-hook.js`) | Después de que el usuario/IDE componga el mensaje | Lee el archivo temporal de mensaje de Git; rechaza el commit si contiene atribución |
| **Rules file** (`rules/no-model-attribution.instructions.md`) | Carga del contexto del agente | Instruye al modelo para que nunca genere atribución; primera barrera pasiva |

**Qué es atribución** (case-insensitive): un trailer `*-by:` cuyo valor nombra una IA o herramienta (un `Co-Authored-By:` humano pasa); una frase `generated|written|created|made|built|authored|assisted|powered|produced` o `generado|escrito|creado|hecho|asistido|producido` + `with|by|using|con|por` con el nombre de la herramienta en las tres palabras siguientes; o `🤖`. Nombrar un agente no es atribución: `fix(claude): …` o «soporte de Antigravity» pasan. Herramientas reconocidas: `claude`, `anthropic`, `opus`, `sonnet`, `haiku`, `fable`, `gpt`, `chatgpt`, `openai`, `codex`, `copilot`, `gemini`, `bard`, `llama`, `mistral`, `cohere`, `antigravity`, `agy`, `cursor`, `windsurf`, `kiro`, `opencode`, `qwen`, `deepseek`, `grok`, `devin`, `aider`, `cline`, `junie`, `amp`.

**Instalación**: `npm run setup:git-hooks` instala tanto el `pre-commit` como el `commit-msg` hook. El PreToolUse DENY está integrado en el hook `PreToolUse` del arnés y no requiere instalación adicional.

**Bypass**: `DISABLE_OSPEC_ATTRIBUTION_CHECK=true` desactiva únicamente el `commit-msg` hook. El DENY de PreToolUse no tiene bypass — es un bloqueo absoluto para agentes.

### 5. Estado del CLI (PreToolUse y `ospec close`)
Solo el CLI escribe el estado de un cambio IDD (REQ-idd-003, REQ-hooks-029):
- **PreToolUse (`deny`)**: niega a una herramienta que escribe un fichero (`Write`, `Edit`, `apply_patch`, `write_to_file`, una MCP de escritura o de movimiento…) tocar `idd/<cambio>/state.yaml` con su `.tmp` y su `.bak`, cualquier fichero de `idd/archive/` o de `.ospec/review-receipts/`. Vale en cualquier modo de permisos y no tiene bypass. Las lecturas y el shell pasan. Actúa donde el host manda la edición a su `PreToolUse`: [target-capabilities](target-capabilities.md#3-paridad-de-hooks--protecciones-por-target-d2) dice por target si ese hook corre, y hoy VS Code y GitHub Copilot no lo corren.
- **`ospec close`**: revalida el estado con las reglas de los comandos y vale en los 7 targets; es la garantía en todos ellos. Rechaza una obligación `withdrawn` o ausente que una señal activa deriva, una señal, gate o referencia que el diff deriva y el estado no tiene, y la evidencia ligada al árbol de otro árbol. `ospec check` lo repara. Un cambio marcado `closed` sin archivar solo se archiva si sigue sin nada pendiente, y `closed_at` debe ser una fecha ISO.
- **Cursor**: el `hooks.json` generado no tiene hook antes de editar un fichero. `install-cursor.js` copia el guard al `preToolUse` genérico de Cursor, que deniega la escritura si Cursor le manda la edición, pero ospec no cuenta con ello: su garantía es la revalidación de `close` (`CLI_OWNED_STATE_GUARD` en `scripts/configure/validate-cursor.js`).
- **Límites**: el guard solo lee las claves de ruta declaradas y las cabeceras de parche. Una herramienta que nombra su fichero con otra clave, o mover un directorio `idd/<cambio>` entero, no se deniega; ahí queda la revalidación de `close`.
