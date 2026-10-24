# disk-rule-command-precision

## Intent and acceptance

La regla de disco del PreToolUse deniega `format` solo cuando es la orden (inicio de orden o tras un envoltorio que ejecuta su operando), no cuando es una palabra suelta; paridad JS/Go (#407, OSP-033, E1.35)

Acceptance: Los cinco ejemplos de #407 y un heredoc que los cite no reciben decisión; formatear una unidad como orden (directa, con `cmd /c`, asignada), `Format-Volume` y `Clear-Disk` siguen denegados con los casos actuales; la paridad JS/Go pasa

## Plan

1. `scripts/hooks/pre-tool-use.js`: `DISK_FORMAT_RE`, compuesto por piezas, sustituye al literal de la regla de disco. `format` (o `format.com`/`format.exe`, entrecomillado o con ruta) se deniega solo en posición de orden. Esa posición es el inicio, un salto de línea, `;`, `&`, `|`, `(`, `{`, la comilla invertida o `$x=`, seguidos de una cadena de envoltorios que ejecutan su operando. Cada envoltorio puede ir entrecomillado, con ruta o como `%ComSpec%`, y lleva sus flags, flags de barra y operandos numéricos; `-ArgumentList` también es un token de la cadena. Detrás de `format` no puede ir `-`, `.` ni una letra (`Format-Table`, `--output-format`). Desaparece la lista de formateadores (`dotnet`, `ruff`…): en `dotnet format` la orden es `dotnet`. `Clear-Disk` y `Format-Volume` no cambian.
2. `internal/rules/rules.json`: el mismo patrón, copiado de `DISK_FORMAT_RE.source`; Go lo sigue evaluando con regexp2.
3. Tests, en JS (`pre-tool-use.test.js`) y en Go (`rules_test.go`):
   - Pasan a permitidos los cinco ejemplos, un heredoc que los cita, `cmd /c dotnet format` (también con `cmd.exe` con ruta) y una lista numerada dentro de un heredoc.
   - Se deniegan los envoltorios nuevos, los que llevan ruta o variable, los de las dos revisiones de confianza, y las comillas y heredocs conservadores.
   - Un test de tiempo con entradas adversarias comprueba que una orden real detrás de ellas sigue denegada.
4. Contrato: la fila «Format or clear a disk» de `openspec/specs/hooks/spec.md`, con los límites explícitos.

## Decisions

Decisiones del usuario del 2026-10-24 («haz las recomendadas»):

- Las comillas no se interpretan: un `;`, `&` o `|` dentro de comillas sigue abriendo una orden. Ignorarlas exigiría distinguir en dos motores de regex las comillas que se ejecutan (`cmd /c "…"`, `powershell -c "…"`), y un fallo dejaría pasar un formateo real.
- Una línea de un heredoc cuenta como línea de órdenes: el regex no sabe si el cuerpo va a `cat` o a `bash`.
- `cmd /c dotnet format C:\repo\app.sln` pasa a permitido: la orden que ejecuta `cmd` es `dotnet`.
- Lista amplia de envoltorios, para no abrir huecos respecto a la regla anterior, que lo denegaba todo.
- `Clear-Disk` y `Format-Volume` se siguen denegando como palabra en cualquier posición.

Decisiones de desarrollo, tras las dos revisiones de confianza (CRITICAL: envoltorios con ruta y backtracking exponencial en `if a==b`; WARNING: lanzadores y palabras clave del shell que faltaban):

- Cada envoltorio admite delante una ruta (sin comillas, o entre comillas con espacios y paréntesis equilibrados, como `Program Files (x86)`) y la comilla que la cierra. `%ComSpec%` y `$env:ComSpec` cuentan como `cmd`.
- Se añaden `eval`, `xargs`, `command`, `builtin`, `nice`, `runas`, `timeout`, `wsl`, `gsudo`, `do`, `then`, `else`, `!` y los equivalentes de `npx` en los otros gestores (`npm exec`, `yarn dlx`, `bunx`). Los lanzadores que siguen fuera de la lista (`schtasks`, `psexec`, `wmic`, `ssh`) quedan escritos como límite en el contrato.
- Cada envoltorio declara qué flags llevan valor (`sudo -u`, `pwsh -ExecutionPolicy`, `xargs -n`…). Un flag con valor nunca se lee como flag suelto, y `-ArgumentList` nunca es flag de un envoltorio. Así cada flag tiene una sola lectura y no hay backtracking exponencial (`sudo -u -u -u …`, `-u sudo -u sudo …`).
- Ningún token ni la búsqueda de la unidad cruzan `;&|(){}` ni la comilla invertida, y `==` parte el token en un solo sitio. Cada inicio de orden recorre solo hasta el siguiente, y el coste es lineal en JS y en regexp2. Con un fuzz de formas aleatorias, cuadruplicar la entrada cuadruplica el tiempo en los dos motores (peor caso ×4,4). La regla anterior ya era cuadrática con muchos `format` en un mismo tramo. A cambio, `format $(echo D:)` ya no se deniega.
- Tras la revisión sucesora (CRITICAL: lecturas dobles con `sudo -u a"…` y `"/sudo /sudo"`; WARNING: `-ArgumentList` con flags del programa o con lista por comas), cada frontera entre tokens tiene una sola lectura:
  - los valores, asignaciones y operandos no llevan comillas ni comas;
  - un flag de barra nunca deletrea un envoltorio (`/sudo` solo es ruta más `sudo`);
  - una ruta con espacios entre comillas solo abre la cadena, y su comilla cierra justo tras el nombre;
  - el título de `start` solo puede ser `""`;
  - `-ArgumentList` lee los flags sueltos del programa lanzado y la lista separada por comas.

  Lo que queda fuera está escrito en el contrato: una ruta con espacios entre comillas detrás del primer envoltorio, valores con comillas o comas y flags con valor dentro de `-ArgumentList`.
- Una ruta no contiene `=`: `A=1C:\a\env` se leía como asignación de `env` y como ruta más `env`. La búsqueda de trozos de 4 tokens en Go lo encontró.
- Tras los *follow-ups* de la validación (no bloqueantes):
  - Detrás de `format` tiene que venir un espacio, una comilla, `(` o `,`. Con un `(?![\w.-])`, una palabra como `format/format/…` reintentaba la búsqueda de la unidad en cada barra (cuadrático, 1,25 s con 112 KB). A cambio, `format/q D:`, pegado, ya no se reconoce.
  - Los envoltorios que tienen ejecutable o *shim* en Windows aceptan su sufijo (`gsudo.exe`, `npx.cmd`, `env.exe`…). Cada nombre lleva un único sufijo opcional, porque dos seguidos darían dos lecturas.
- Tras la revisión del árbol final (dos WARNING: formas de Git Bash y órdenes de lanzadores que la regla anterior denegaba):
  - `VAR=valor` es un token de la cadena (`MSYS_NO_PATHCONV=1 cmd …`), y `env` deja de leer sus propias asignaciones para que haya una sola lectura.
  - Los flags de barra admiten `//c`.
  - Los flags con valor de Start-Process (`-WindowStyle`, `-Verb`…) son flags con valor de todos los envoltorios, y se leen delante y detrás del programa.
  - `""` es un token en cualquier punto, y `start` deja de tener título propio.
  - Los flags de `-ArgumentList` admiten listas por comas.

  Esa revisión no llegó a registrarse: el CLI rechazó su cita `rules_test.go:1-327` en un fichero de 326 líneas (la evidencia de #415), y el árbol cambió de todos modos con estas correcciones.
- La cuarta revisión de confianza (autorizada por el usuario en el gate `review-limit`) quedó aprobada sin BLOCKER ni CRITICAL. Según lo acordado con el usuario, sus dos avisos no se corrigen en este cambio: quedan como seguimiento en el roadmap, junto con la actualización de la fila del contrato, que reabriría la revisión:
  - WARNING: el valor de un flag de barra no admite `\` ni `@`, así que `runas /user:HOST\admin "format D:"` y `/user:a@b` no se deniegan. Admitir `\` sin más daría una segunda lectura con ruta más nombre (`/user:a\sudo`).
  - SUGGESTION: la comilla doble de cmd delante de una ruta (`cmd /c ""C:\…\format.com" D: /q"`) no se reconoce.
- Comprobación de linealidad: una búsqueda exhaustiva de trozos de uno y dos tokens (y una muestra de tres y cuatro), repetidos 30 veces, no encuentra ninguno lento en JS. La misma búsqueda sí encuentra las cadenas exponenciales del patrón anterior.
- Los números sueltos solo cuentan como cuentas o duraciones (`5`, `1.5m`), para que `1. format C:` de una lista Markdown no abra una orden. `2) format C:` sigue permitido, porque `)` no abre orden.
- La clase de separador de ruta se escribe `[\/\\]` y no `[\\\/]`: la normalización de `parity-contract.test.js` (`\/` → `/`) no es idempotente con la segunda forma.
- Un `git commit` del test usa el stub de git de rama limpia: con el árbol sucio, el guard de git pide confirmación por su cuenta, sin relación con la regla de disco.
- El comentario de la regla no cita rutas `X:\`: `validate-github-copilot.js` las rechaza como residuo de ruta absoluta.
- La primera revisión de confianza se registró como `relayed`: el recibo de SubagentStop era el de la primera respuesta del revisor, que el CLI rechazó por formato (#415), y el usuario autorizó borrar el recibo viejo. La sucesora sí quedó atestada por su recibo.
