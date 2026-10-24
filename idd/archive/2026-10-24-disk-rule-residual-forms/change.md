# disk-rule-residual-forms

## Intent and acceptance

La regla de disco deniega las formas residuales de E1.35: valor de flag de barra con \ o @ (runas /user:DOMINIO\usuario, /user:a@b) y la comilla doble de cmd delante de una ruta (cmd /c ""C:\…\format.com" D:"), sin segundas lecturas; fila del contrato actualizada (E1.39)

Acceptance: Las tres órdenes de E1.39 se deniegan en JS y en Go (o figuran como límite en el contrato); los casos permitidos y denegados actuales no cambian; los tests de linealidad, con prefijos nuevos para las formas añadidas, siguen por debajo de 1 s en los dos motores; la paridad JS/Go pasa

## Plan

1. `scripts/hooks/pre-tool-use.js`, en `DISK_FORMAT_RE`:
   - El valor de un flag de barra admite `@` y segmentos tras una `\` (`/user:CORP\admin`, `/user:a@b`). Ningún segmento deletrea un envoltorio ni `format`.
   - Tras un espacio, `SEP` admite la comilla doble de cmd pegada al token siguiente (`cmd /c ""C:\…\format.com" D:"`).
2. `internal/rules/rules.json`: el mismo patrón, copiado de `DISK_FORMAT_RE.source`.
3. Tests en JS (`pre-tool-use.test.js`) y en Go (`rules_test.go`): las órdenes de E1.39 y la comilla doble delante de un envoltorio se deniegan; un formateador detrás de `runas /user:CORP\…` o de la comilla doble pasa; prefijos de linealidad nuevos.
4. Contrato: la fila «Format or clear a disk» de `openspec/specs/hooks/spec.md` describe las formas nuevas y el límite de la comilla doble pegada.

## Decisions

Decisiones del usuario del 2026-10-24 (gate `open-facts`, las tres recomendadas):

- Se corrigen las dos formas; no se dejan solo como límite escrito.
- La comilla doble de cmd vale delante de cualquier token (también de un envoltorio con ruta, `""C:\…\cmd.exe" /c …`), no solo delante de `format`.
- La comilla doble pegada al token anterior (`cmd /c""…"`) queda como límite escrito en el contrato: pegada, se leería también como la comilla de cierre de `/c"` más una de apertura, y repetida daría backtracking exponencial.

Decisiones de desarrollo:

- La comilla doble de apertura forma parte de `SEP` (`H+""` seguido de un carácter de palabra), no de cada token. El título vacío `""` sigue exigiendo un separador detrás, así que el carácter siguiente decide entre las dos lecturas.
- Ningún segmento de un flag de barra, ni el primero ni uno tras una `\`, deletrea un envoltorio ni `format`. Sin esta regla, `/user:a\sudo` se leería también como ruta más `sudo`, y `/format.com` también como ruta más `format`. La búsqueda de trozos en regexp2 encontró el segundo caso: con `/format.com ` repetido, la búsqueda de la unidad volvía a recorrer la línea en cada token. Ya era cuadrático en `HEAD` (2,8 s con 64 KB en Go), y la `\` lo extendía a `/u:a\format.com `. No se pierde ninguna denegación: la lectura como `format` busca igualmente la unidad hasta el siguiente carácter que abre orden.
- `-ArgumentList @(` cruza su `(`, que también abre orden. Con `@(-ArgumentList ` repetido, la cadena de cada `(` llegaba hasta el final (cuadrático ya en `HEAD`, 1,5 s con 64 KB en Go). Ahora una cadena cruza como mucho un array (`ARGLIST_ARRAY`, fuera del bucle de tokens). Las formas con array siguen denegadas, porque el `(` abre su propia cadena.
- La primera revisión de confianza aprobó sin BLOCKER ni CRITICAL, con dos WARNING confirmados. El usuario eligió, el 2026-10-24, corregir aquí los dos primeros puntos y llevar al roadmap la diferencia Unicode:
  - Los vectores de linealidad ` ""sudo` y ` """` no ejercitaban la rama `""` de `SEP`, porque no había un token válido delante. Se añaden `sudo ""sudo …` y `cmd /c ""cmd /c …`, que sí la recorren.
  - El valor de un flag de barra admite `%` y `$` (`/user:%USERDOMAIN%\a`, `/user:$env:USERDOMAIN\a`). `$env:comspec` pasa a la lista de nombres, para que `/$env:comspec` siga siendo solo ruta más envoltorio.
  - `\w`, `\d` y `\b` son Unicode en regexp2 y ASCII en JS, así que `runas /user:CORP\Zoë "format D:"` se deniega en Go y no en JS. Afecta a las 19 reglas: entra como E1.41 `rules-engine-unicode-parity`, y la fila del contrato lo nombra como límite.
- La revisión sucesora (generación 2) quedó aprobada sin hallazgos.
- En el primer `ospec check` tras las correcciones, `checks-greenfield.test.js` falló una vez en local (Linux) porque una página del banco no terminó de cargar. Aislado pasó 3 de 3, y el siguiente `ospec check` pasó entero. No tiene relación con este cambio.
- El roadmap marca E1.39 como hecho en v2.150.7, la versión patch que le toca, y añade E1.41 detrás de E1.40.
- Linealidad: una búsqueda exhaustiva de trozos de uno y dos tokens y una muestra de tres y cuatro (5309 trozos, repetidos hasta 4 KB y 16 KB), y un fuzz de 300 cadenas aleatorias de 16 KB y 64 KB. En los dos motores, cuadruplicar la entrada cuadruplica como mucho el tiempo (×4,1 en regexp2, 27 ms con 64 KB).

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-24T20:29:21.467Z)
- ev-2: check-run for checks-pass (2026-10-24T20:31:32.750Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-24T20:31:32.750Z)
- ev-4: frozen-review for trust-review (2026-10-24T20:38:26.072Z, subagent-stop)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-24T21:24:50.974Z)
- ev-6: frozen-review for trust-review (2026-10-24T21:33:36.846Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-10-24T21:34:36.212Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-24T21:34:36.212Z)
- ev-9: living-doc-current for living-doc (2026-10-24T21:34:44.544Z)
<!-- ospec:evidence:end -->
