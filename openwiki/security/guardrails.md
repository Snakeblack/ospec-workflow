# Guardrails de seguridad

`ospec-workflow` combina cuatro salvaguardas independientes que se disparan en
distintos puntos del ciclo de vida — sesión, herramienta, commit y mensaje de
commit — para reducir fuga de secretos, agotamiento de contexto y estados de
git riesgosos, sin bloquear el flujo de forma agresiva.

## Panorama general

| Guardrail | Se dispara en | Decisión posible | Objetivo |
| --- | --- | --- | --- |
| **AgentShield** | `SessionStart`, `PreToolUse` | `ask` / alerta | Evitar fuga de secretos, credenciales, llaves SSH. |
| **Token Budget Advisor** | `PreToolUse` (lecturas de archivo) | `allow` / `ask` | Evitar pérdida de contexto por lecturas excesivas. |
| **git-collaboration-guard** | `PreToolUse` (antes de `git commit`) | `ask` (nunca `deny`) | Confirmar antes de commits riesgosos. |
| **pre-commit / commit-msg hooks** | Git local (`.git/hooks/`) | Bloquea el commit | Validar OpenSpec, Strict TDD y atribución de commits. |

Las tres primeras corren dentro del runtime de hooks del host de chat (ver
[Runtime de hooks de ciclo de vida](../hooks-runtime/lifecycle.md)); la cuarta
corre nativamente en Git, independiente del agente.

## AgentShield Security

Escanea automáticamente el workspace en `SessionStart` en busca de
configuración insegura:

- Verifica que archivos de entorno comunes (`.env`, `.env.local`,
  `.env.development`, `.npmrc`) estén listados en `.gitignore`; si no lo
  están, reporta una alerta de seguridad.
- Inspecciona `.git/config` en busca de credenciales en texto plano (por
  ejemplo, contraseñas o tokens embebidos en URLs de origen).
- En `PreToolUse`, bloquea o pregunta ante accesos a llaves SSH, `.npmrc`,
  `.git/config`, y otros archivos sensibles, incluso ante prompts
  interactivos que intenten extraer secretos.

Se puede desactivar temporalmente con `DISABLE_AGENT_SHIELD=true`.

## Token Budget Advisor

Calcula el costo de tokens de cada lectura de archivo con heurísticas
estándar:

- Código/datos estructurados (`.js`, `.go`, `.json`, `.yaml`, `.yml`, `.md`,
  `.txt`): `caracteres / 4`.
- Prosa/texto plano: `palabras * 1.3`.

Si el costo estimado de un archivo supera **50.000 tokens**, el advisor
retorna `ask` con una advertencia explícita del costo antes de continuar.
También rastrea el acumulado de la sesión contra un límite de **220.000
tokens**. Se desactiva con `DISABLE_TOKEN_ADVISOR=true`.

## git-collaboration-guard

Salvaguarda **advisory-first** — siempre retorna `ask`, nunca `deny`, y
degrada de forma segura (fail open) cuando git no está disponible. Se evalúa
solo cuando un comando `git commit` está a punto de ejecutarse (no en cada
edición de archivo). Cubre dos patrones riesgosos:

1. Ejecutar `git commit` estando en la rama por defecto.
2. Ejecutar `git commit` con el árbol de trabajo ya sucio (incluso en una
   rama feature).

Resolución de estado, en orden, con fail-open independiente por chequeo:

| Paso | Comando | Ante fallo |
| --- | --- | --- |
| Rama por defecto | `git symbolic-ref refs/remotes/origin/HEAD --short` | Fail open solo para este chequeo; el chequeo de árbol sucio sigue corriendo. |
| Rama actual | `git branch --show-current` | Igual que arriba. |
| Estado del árbol | `git status --porcelain` | Fail open: se omite la advertencia de árbol sucio, retorna `allow`. |

Todos los comandos deben completar dentro del presupuesto de 5s de
`PreToolUse`. Un HEAD detached, un remoto `origin` ausente, o un timeout se
tratan como "resolución no disponible" solo para el chequeo afectado.

## Hooks locales de Git: pre-commit y commit-msg

Instalados de forma idempotente con `npm run setup:git-hooks`
(`scripts/setup-git-hooks.js`), que escribe en `.git/hooks/pre-commit` un
script de entrada hacia `scripts/hooks/pre-commit-hook.js`, sin destruir
hooks preexistentes de otras herramientas.

- **pre-commit** (`pre-commit-hook.js`): ejecuta las validaciones equivalentes
  a `node scripts/check.js` (consistencia de OpenSpec). Si `strict_tdd: true`
  está activo y hay código de producción staged (`internal/**/*.go`,
  `scripts/hooks/*.js`, etc.) sin un test correspondiente (`*_test.go`,
  `*.test.js`) o sin `tasks.md` del cambio activo también staged, el commit se
  bloquea.
- **commit-msg** (`commit-msg-hook.js`): rechaza mensajes con atribución de
  IA/modelo (Co-Authored-By vendor, firmas de asistentes) — el proyecto exige
  Conventional Commits sin atribución de IA.

Ambos se pueden desactivar localmente con `DISABLE_OSPEC_PRECOMMIT=true`.

## Por qué la arquitectura está diseñada así

Cada guardrail resuelve un riesgo distinto con el punto de enganche más
barato posible: AgentShield actúa donde hay I/O de archivos, Token Budget
Advisor donde hay lecturas, git-collaboration-guard donde hay un commit a
punto de ejecutarse, y los hooks nativos de Git donde el commit ya está
confirmado localmente. Ninguno usa `deny` salvo los hooks nativos de Git — los
guardrails del host de chat prefieren `ask` para no bloquear flujos legítimos
por falsos positivos, delgando la decisión final al humano.

## Principales puntos de extensión

- Nuevas heurísticas de estimación de tokens: extender la tabla de
  extensión→fórmula en el módulo del Token Budget Advisor.
- Nuevos patrones de secretos: extender el escaneo de AgentShield
  (`internal/hooks/secretscan.go` y su contraparte Node).
- Nuevas reglas de pre-commit: agregar validaciones a
  `scripts/hooks/pre-commit-hook.js`, manteniendo el patrón fail-safe.

## Cosas a vigilar al editar

- git-collaboration-guard NUNCA debe retornar `deny` — es un contrato
  explícito de la spec.
- Todo guardrail de `PreToolUse` debe respetar el presupuesto de 5s; un
  guardrail que no falla de forma segura ante timeout puede bloquear
  herramientas legítimas.
- No agregues escaneo de contenido de secretos reales a esta documentación ni
  a ningún artefacto versionado — solo se documenta la existencia del
  mecanismo, nunca valores sensibles.

## Mapa de fuentes

- `/openspec/specs/agent-shield-security/spec.md`
- `/openspec/specs/token-budget-advisor/spec.md`
- `/openspec/specs/git-collaboration-guard/spec.md`
- `/openspec/specs/git-precommit-hook/spec.md`
- `/scripts/hooks/pre-commit-hook.js`, `/scripts/hooks/commit-msg-hook.js`
- `/scripts/setup-git-hooks.js`
- `/internal/hooks/secretscan.go`, `/internal/hooks/pretooluse.go`
