# Terminal smoke: Go installer TUI

Fecha: 2026-09-06 (Europe/Madrid)

## Sesión sobre el catálogo real

Comando ejecutado con PTY:

```powershell
go build -o .ospec/temp/ospec-install.exe ./cmd/ospec-install
.\.ospec\temp\ospec-install.exe
```

Secuencia enviada mediante `write_stdin`: `Enter` (destinos), `Enter` (Claude), `Right` (cambiar el modelo seleccionado), `Enter` (resumen), `Esc` (volver al selector), `Esc` (volver a destinos), seis veces `Down` y `Enter` (Antigravity), `q`.

Observaciones:

- El menú inicial mostró `Configurar un destino` y respondió a `Enter`.
- El selector mostró los destinos reales, incluido Claude y Antigravity.
- Claude abrió `Modelos para Claude`; `Right` cambió el modelo visible de `Claude Opus` a `Claude Sonnet`.
- El resumen mostró `Revisar instalación`, Claude y la lista de agentes. `Esc` volvió al selector conservando `Claude Sonnet`.
- Antigravity abrió directamente `Revisar instalación`, sin selector de modelos, y todos los agentes aparecieron como `Heredado`.
- `q` terminó con código 0 y emitió las secuencias de limpieza del terminal (`?2004l`, `?1002l`, `?1003l`, `?1006l`, restauración del cursor).
- No se confirmó ninguna instalación real.

## Fixture de proceso controlado

Para probar la frontera de instalación sin tocar el repositorio ni el home, se compiló el mismo binario en `.ospec/temp/fixture`, junto con un `scripts/configure/installer-adapter.js` efímero. El adaptador devuelve un único destino, un agente seleccionable con valor `minimalversion1plan`, y en `install` escribe sentinelas y sale con código 17.

Comando y secuencia PTY:

```powershell
.\ospec-install.exe                 # cwd: .ospec/temp/fixture
Enter, Enter, Enter, Right, Enter
Write-Output "NativeExitCode=$LASTEXITCODE"
```

Observaciones:

- Se observaron las pantallas `Fixture target` → `Modelos para Fixture target` → `Revisar instalación`.
- El resumen conservó y mostró `minimalversion1plan`.
- Al elegir `Instalar`, se mostró `Instalando…`; después aparecieron `fixture install stdout sentinel`, `fixture native diagnostics sentinel` y `installer install (exit 17): exit status 17`.
- La sesión terminó restaurando el terminal mediante las secuencias de limpieza. La comprobación posterior en el mismo shell imprimió `NativeExitCode=17`, confirmando el código real de `os.Exit(17)`; el wrapper PTY había reportado `exit_code: 1` en la ejecución anterior.
- El fixture no ejecuta instaladores reales ni modifica archivos de usuario.

## Resultado

PASS para navegación, persistencia al retroceder, destino heredado, salida limpia y propagación visible de diagnósticos/código del adaptador. La observación del código de proceso a través del wrapper PTY queda limitada a `exit_code: 1`; el código funcional reportado por la frontera Go/adaptador fue 17.
