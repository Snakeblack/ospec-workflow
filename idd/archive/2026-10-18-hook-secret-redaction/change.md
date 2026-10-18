# hook-secret-redaction

## Intent and acceptance

E1.27 hook-secret-coverage (#336): ampliar tokens conocidos (GitHub, Anthropic, OpenAI project) y lectores od/tar/scp del PreToolUse, y añadir un hook PostToolUse que censura los secretos de alta confianza en la salida de las herramientas antes de que la vea el modelo, sin falsos positivos

Acceptance: Write/Read con tokens ghp_/github_pat_/sk-ant-/sk-proj- da ask; od .env, tar cf - .env y scp .env host: dan ask; un README normal y un .pem sin clave siguen sin decisión; en Claude Code un Read/Bash/Grep de un fichero con secretos entrega al modelo el contenido con cada secreto sustituido por un marcador y el resto intacto, verificado en vivo; un corpus de negativos (código, i18n, docs, placeholders) queda sin cambios; paridad JS/Go

## Plan

1. Cobertura E1.27: tokens de GitHub (clásicos y fine-grained), Anthropic y OpenAI project en `KNOWN_TOKEN_PATTERNS`, además de Stripe, npm, GitLab, Hugging Face y SendGrid y `\b` en los existentes; `od`, `tar` y `scp` como lectores, con `scp -i/-o` exentos (JS `secret-scan.js`, `shell-file-access.js`; Go `secretscan.go`, `shellfileaccess.go`).
2. Motor de censura `secret-redact.js` / `secretredact.go` con corpus compartido `internal/testdata/secret-redaction/cases.json` (positivos y negativos con plantillas, sin secretos literales).
3. Hook `post-tool-use` (Node y Go) con fixtures de paridad `post-tool-use-*`; el launcher lo registra, valida su salida, cae a la censura en proceso o retiene la salida, y lo adapta a Codex como `decision: "block"`. PreToolUse: con `--output-redaction` una lectura sin shell no pregunta, y el marcador sobre un fichero con secretos reales da `deny`.
4. Cableado: `hooks/hooks.json` añade `PostToolUse`; claude anida y añade el flag; codex lo envuelve; vscode y antigravity lo omiten; copilot y cursor lo descartan; el plugin de OpenCode usa `execute.after` (v2) y `tool.execute.after` (v1). Specs (agent-shield-security, hooks, hooks-runtime), golden y documentación.

## Decisions

- Respuestas del usuario (gate `open-facts`): todos los targets posibles; con censura activa la lectura no pregunta; política estricta, cero falsos positivos; `deny` al escribir el marcador sobre secretos reales.
- Censura en `PostToolUse` reescribiendo solo los strings de `tool_response`: la forma queda idéntica y el host la acepta. Verificado en vivo con Claude Code 2.1.302 en Read, Bash, Grep y Edit. Se descartó redirigir el Read a una copia censurada con `updatedInput`, porque rompía el Edit posterior y mostraba otra ruta.
- La exención de la lectura depende de un flag explícito (`--output-redaction`) que solo añade el transform de claude, y que el launcher convierte en `OSPEC_OUTPUT_REDACTION`, borrando cualquier valor heredado. No se detecta el host por variables de entorno: VS Code comparte el formato de hooks y podría heredar `CLAUDECODE`. El shell conserva el `ask` porque su salida puede salir de la máquina sin pasar por el modelo.
- Falsos positivos: barrido de los 4481 ficheros del repositorio. Las reglas se endurecieron hasta dejar solo 17 líneas censuradas, todas fixtures de tests con forma real de secreto. Límite asumido: una contraseña solo de letras en código y un valor que contiene la palabra `password`, `secret` o `token` no se censuran.
- Antigravity queda fuera: agy 1.4.2 entrega `PostToolUse` sin el resultado de la herramienta e ignora `overwriteResult`. VS Code queda fuera porque su `PostToolUse` no reescribe la salida e inyectaría la nota sobre el original. Codex se cablea según su documentación (`block` sustituye el resultado), sin verificación en vivo por falta de sesión.
- Defectos previos fuera de alcance, anotados como seguimientos en E1.27: el `hooks.json` de agy no carga por la clave `enabled`, y OpenCode deduplica plugins por `id`.
- Correcciones de la revisión de confianza (T1-T6):
  - T1: el bloque PEM se censura también con `\n` escapados, como la clave de una cuenta de servicio en JSON.
  - T2: la exención de lectura exige que la censura cubra el fichero: tras censurarlo, el escáner de contenido no encuentra nada fuera de los marcadores. Si no lo cubre, se pregunta como antes. Un fichero clasificado por nombre (`.env*`, `credentials`, `secrets.json`) se censura en modo sensible: asignaciones sin comillas en minúsculas, cualquier palabra sensible del nombre, sin la regla de valores descriptivos y con valores aleatorios de 16 caracteres o más.
  - T3: las claves de OpenCode (`filePath`, `newString`, `oldString`).
  - T4: la exención solo vale para herramientas de lectura.
  - T5: `DISABLE_SECRET_REDACTION=true` anula la exención.
  - T6: el deny del marcador también inspecciona los operandos de una orden de shell.
- La corrección superó el presupuesto de 200 líneas y el CLI no tenía salida. Se arregló en el cambio aparte `review-oversized-correction` (worktree `fix/idd-review-oversized-correction`), y la revisión 2 se abrió como sucesora con los hallazgos pendientes. Sus hallazgos se corrigieron así:
  - N1: un fichero con clave privada nunca queda exento de preguntar.
  - T2 residual: en modo sensible se censura todo valor opaco y la contraseña de URLs con usuario vacío.
- Formato de la revisión: el revisor devolvió `blocker|major|minor` y `fix` porque así se lo pedí. Se tradujo solo el formato al esquema del CLI (`BLOCKER`; `CRITICAL` para `major`, que también bloquea; `WARNING`; `acceptance_criteria`), sin tocar el contenido.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-18T12:51:43.902Z)
- ev-2: check-run for checks-pass (2026-10-18T13:00:22.801Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-18T13:00:22.801Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-18T13:00:47.318Z)
- ev-5: check-run for checks-pass (2026-10-18T13:01:51.610Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-18T13:01:51.610Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-18T13:01:51.610Z)
- ev-8: check-run for checks-pass (2026-10-18T13:14:47.619Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-10-18T13:14:47.619Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-10-18T13:14:47.619Z)
- ev-11: migration-test for migration-compat-and-test (2026-10-18T13:14:59.168Z)
- ev-12: check-run for checks-pass (2026-10-18T13:17:15.091Z)
- ev-13: contract-spec-and-test for contract-spec-and-test (2026-10-18T13:17:15.091Z)
- ev-14: adr-impact-declaration for adr-impact-declaration (2026-10-18T13:17:15.091Z)
- ev-15: migration-test for migration-compat-and-test (2026-10-18T13:17:23.935Z)
- ev-16: check-run for checks-pass (2026-10-18T14:26:17.790Z)
- ev-17: contract-spec-and-test for contract-spec-and-test (2026-10-18T14:26:17.790Z)
- ev-18: adr-impact-declaration for adr-impact-declaration (2026-10-18T14:26:17.790Z)
- ev-19: frozen-review for trust-review (2026-10-18T14:27:21.563Z)
- ev-20: migration-test for migration-compat-and-test (2026-10-18T14:27:37.298Z)
- ev-21: check-run for checks-pass (2026-10-18T14:28:37.799Z)
- ev-22: contract-spec-and-test for contract-spec-and-test (2026-10-18T14:28:37.799Z)
- ev-23: adr-impact-declaration for adr-impact-declaration (2026-10-18T14:28:37.799Z)
- ev-24: living-doc-current for living-doc (2026-10-18T14:28:44.219Z)
<!-- ospec:evidence:end -->
