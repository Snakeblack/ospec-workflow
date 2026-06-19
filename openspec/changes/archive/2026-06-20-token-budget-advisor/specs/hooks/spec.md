# Delta for hooks

## MODIFIED Requirements

### Requirement: 3. PreToolUse

**Trigger**: before every tool call Claude attempts to make.

**Source**: `scripts/hooks/pre-tool-use.js`

#### 3.1 Behaviour

Given a tool call is about to execute,
When the hook receives `{tool_name, tool_input}`,
Then it MUST evaluate the call and return:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "<human-readable string>"
  }
}
```

(Previously: Evaluaba los comandos de terminal en busca de reglas de DENY y ASK. Ahora incorpora además las validaciones de límites de tokens del Token Budget Advisor).

#### 3.2 Command extraction

The hook MUST extract candidate commands from `tool_input` as follows:
- If `tool_input.command` is a string: treat it as one command.
- If `tool_input.commands` is an array: treat each element that is a string or has a
  `.command` string property as a command.
- Null, undefined, non-array, and non-string elements are silently skipped.

If no commands are extracted (regardless of whether the tool is a shell tool): return
`allow` (a menos que se disparen las alertas de lectura pesada de archivos descritas en §3.6).

#### 3.3 Shell tool recognition

A tool is considered a shell tool when its normalized name (non-alphanumeric chars
stripped, lower-cased) matches any of:
`runcommand`, `runinterminal`, `runterminalcommand`, `shell`, `shellcommand`, `terminal`.

Shell tool status does NOT change the allow/deny/ask outcome — it is used only for
diagnostic context in log messages. Command inspection applies to all tool types.

#### 3.4 Decision rules

Evaluation MUST proceed in this order; the first match wins:

**Step 1 — BYPASS (Bypass del Advisor).**
Si la variable de entorno `DISABLE_TOKEN_ADVISOR=true` está activa: se omiten los Pasos 2 y 3 del Advisor de Tokens y se procede directamente con el análisis de comandos de seguridad.

**Step 2 — TOKEN BUDGET ADVISOR (Lectura Pesada).**
Si la herramienta lee archivos (como `view_file` o lectura de recurso) y el archivo tiene un tamaño de caracteres estimado superior a **80,000 caracteres** (equivalente heurístico a 20,000 tokens): el hook MUST retornar `ask` advirtiendo sobre el costo de lectura del archivo y requiriendo confirmación.

**Step 3 — SESSION TOKENS (Contexto Saturado).**
Si la sesión acumulada de tokens leídos (obtenida del histórico de eventos `.ospec/runtime/subagent-events.jsonl` o de la memoria de sesión) excede los **90,000 tokens** acumulados: el hook MUST retornar `ask` alertando al usuario de la inminente saturación de contexto y sugiriendo la compactación.

**Step 4 — DENY (no recovery).** Test cada comando extraído contra las reglas de denegación.
Si algún comando coincide con una regla de denegación: retornar `deny` con la razón correspondiente.

| Pattern intent | Example |
|---|---|
| Recursive forced deletion of filesystem root | `rm -rf / --no-preserve-root`, `sudo rm -fr /` |
| Force-push git history | `git push --force`, `git push -f` |
| Pipe download to shell | `curl ... \| bash`, `wget ... \| sudo sh` |
| Pipe download to PowerShell eval | `iwr ... \| iex`, `Invoke-RestMethod ... \| Invoke-Expression` |
| Drive-root recursive forced deletion (Windows) | `Remove-Item C:\\ -Recurse -Force` |
| Filesystem format | `mkfs.ext4 /dev/sda1` |
| Raw write to block device | `dd if=image.iso of=/dev/sda` |
| Format or clear a disk | `Clear-Disk -Number 0`, `format C:` |

**Step 5 — ASK (requires user confirmation).** Test cada comando extraído contra las reglas de consulta.
Si algún comando coincide con una regla de consulta: retornar `ask` con la razón correspondiente.

| Pattern intent | Example |
|---|---|
| Dependency installation | `npm install`, `pnpm add lodash`, `yarn install`, `bun install` |
| Hard git reset | `git reset --hard HEAD~1` |
| Git clean (forced) | `git clean -fd` |
| Docker Compose teardown | `docker compose down`, `docker-compose down --volumes` |
| Recursive forced deletion (non-root) | `rm -rf ./dist` |
| Recursive permission/ownership change | `chmod -R 777 ./data`, `chown --recursive user:group .` |
| PowerShell recursive forced removal (non-drive-root) | `Remove-Item ./dist -Recurse -Force` |
| Recursive dir deletion (Windows cmd) | `rmdir /s build` |
| Force-push with lease | `git push --force-with-lease` |
| Machine restart or shutdown | `shutdown -h now`, `reboot`, `Restart-Computer` |

**Step 6 — ALLOW.** Retornar `allow`.

**Deny beats ask**: Cuando una secuencia de comandos coincide a la vez con una regla de denegación y una de consulta (en comandos separados del array), `deny` MUST ganar.

#### 3.5 Error handling

En cualquier error de parseo o evaluación: retornar `ask` explicando que el hook no pudo inspeccionar la llamada. El hook MUST NOT fallar ni salir con código distinto de cero.
