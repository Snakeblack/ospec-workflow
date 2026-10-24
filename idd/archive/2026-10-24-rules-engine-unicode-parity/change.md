# rules-engine-unicode-parity

## Intent and acceptance

Los motores JS y Go de las 19 reglas DENY/ASK deciden distinto con caracteres no ASCII: regexp2 trata \w, \d, \s y \b como Unicode y pliega K (U+212A) e İ (U+0130) a ASCII con IgnoreCase

Acceptance: Un corpus compartido con caracteres no ASCII da la misma decisión en JS y en Go para las 19 reglas, comprobado por las dos suites, y la fila de la regla de disco del spec de hooks deja de nombrar la divergencia del motor Go

## Plan

1. `internal/rules/rules.go`: compilar con `regexp2.ECMAScript` y evaluar sobre `asciiView(cmd)`, que cambia cada carácter no ASCII que no sea espacio de JS por U+FFFD (dos si está fuera del BMP, como las dos unidades UTF-16 de JS).
2. `scripts/hooks/pre-tool-use.js`, en `DISK_FORMAT_RE`: la clase `NON_ASCII` (`[^\x00-\x7f\s]`) entra en el valor de un flag de barra, en su fin de nombre (`NOT_NAME`), en el prefijo `VAR=` y en la variable `$x=`. `internal/rules/rules.json` copia el patrón.
3. Corpus compartido `internal/rules/testdata/unicode-corpus.json` con la decisión y el motivo esperados. Lo comprueban `TestEvaluate_UnicodeCorpus` (Go) y `parity-contract.test.js` (JS), que además verifica que ningún patrón distingue dos caracteres no ASCII. Hay vectores de linealidad nuevos en las dos suites.
4. Contrato: la fila de la regla de disco y el requisito de paridad de `openspec/specs/hooks/spec.md`.

## Decisions

Decisiones del usuario del 2026-10-25 (gate `open-facts`, las tres recomendadas):

- La semántica de referencia es la ASCII de JS sin flag `u`, y Go la adopta.
- La regla de disco reconoce nombres con letras no ASCII (`/user:CORP\Zoë`, `Zoë=1`, `$vär=`) y los deniega en los dos motores.
- Go deja de denegar órdenes escritas con `İ` (U+0130) o con la K Kelvin (U+212A) en lugar de `i` o `k`, igual que JS.

Decisiones de desarrollo:

- `ECMAScript` sola no basta. En regexp2 v1.12.0 hace ASCII `\w` y `\d` y alinea `\s` con JS (U+0085 no es espacio y U+FEFF sí), pero `\b` sigue usando `IsECMAWordChar`, que es Unicode, e `IgnoreCase` pliega con `unicode.ToLower`. En la medición inicial, con `ECMAScript` seguían divergiendo 15 de 37 órdenes. `asciiView` resuelve las dos cosas para cualquier entrada, no solo para las del corpus, porque los patrones no distinguen entre sí dos caracteres no ASCII que no sean espacio. Un test de `parity-contract.test.js` lo exige: patrones ASCII, sin `\u` ni `\x` por encima de `\x7f`.
- Las letras no ASCII se nombran con la clase negada `[^\x00-\x7f\s]`, nunca con un rango positivo. En regexp2, `[\u0080-￿]` con `IgnoreCase` también acepta `i` e `I`, porque al compilar añade la minúscula de `İ`. La clase negada excluye los espacios, así que una frontera de token sigue teniendo una sola lectura.
- La señal `persistent-data` que derivó el diff, porque `pre-tool-use.js` ya contenía un `writeFile`, se retira con la confirmación del usuario del 2026-10-25: el cambio solo toca el patrón.
- La revisión de confianza aprobó sin BLOCKER, CRITICAL ni WARNING. Su SUGGESTION se aplica: los casos de U+00A0 y U+FEFF pasaban también si `asciiView` cambiaba esos espacios por el marcador. Los sustituyen cinco casos (U+00A0, U+FEFF, U+2028 y U+3000) cuya decisión depende de que el carácter siga siendo espacio. Una mutación de `asciiView` que convierte los espacios hace fallar los cinco. La revisión sucesora (generación 2) quedó aprobada sin hallazgos.
- Además del corpus, una comparación aleatoria de 40 000 órdenes, hechas con fragmentos de las 19 reglas y caracteres no ASCII, da 0 diferencias de decisión y de motivo entre JS y Go (4412 deny y 3399 ask). Es una comprobación puntual y no queda como test.
- El hook de esta sesión (el binario Go) bloqueó dos veces el texto de las preguntas del gate por esas formas (`gİt push` con `--force`, y `of=/dev/nvme١n1`). Es la divergencia observada en vivo.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-24T23:20:34.154Z)
- ev-2: check-run for checks-pass (2026-10-24T23:22:43.190Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-24T23:22:43.190Z)
- ev-4: frozen-review for trust-review (2026-10-24T23:26:36.023Z, subagent-stop)
- ev-5: check-run for checks-pass (2026-10-24T23:28:10.497Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-24T23:28:10.497Z)
- ev-7: frozen-review for trust-review (2026-10-24T23:31:02.354Z, subagent-stop)
- ev-8: check-run for checks-pass (2026-10-24T23:32:07.639Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-10-24T23:32:07.639Z)
- ev-10: living-doc-current for living-doc (2026-10-24T23:32:24.034Z)
<!-- ospec:evidence:end -->
