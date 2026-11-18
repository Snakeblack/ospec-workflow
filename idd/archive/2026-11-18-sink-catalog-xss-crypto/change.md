# sink-catalog-xss-crypto

## Intent and acceptance

Dos debilidades nuevas en el catálogo de sinks de scripts/lib/idd-sinks.js: salida HTML sin escapar (CWE-79) y cifrado débil (CWE-327), con un corpus de falsos positivos propio (E1.102)

Acceptance: El corpus de idd-sinks.test.js encuentra la salida HTML sin escapar (CWE-79) y el cifrado débil (CWE-327) en los lenguajes y plantillas acordados, con dos etiquetas propias al final del catálogo; sus formas seguras no derivan la señal; cada caso anterior conserva su etiqueta; el barrido de los repositorios locales de E1.100 no da falsos positivos nuevos; la spec de IDD y el handbook nombran las dos debilidades; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-18T00:02:16.852Z):

> continua

Answer 1 — open-facts, user, 2026-11-18T00:04:11.373Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/lib/idd-sinks.js`, `scripts/lib/idd-sinks.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Las dos debilidades nuevas van al final del catálogo, detrás de CWE-322, con sus propias etiquetas: «unescaped HTML output (CWE-79)» y «weak cipher (CWE-327)»; así no le quitan la etiqueta a una línea que otra debilidad ya nombraba y las respuestas guardadas siguen casando
- CWE-79: las API hechas para saltarse el escape del framework cuentan salvo que su argumento sea un único literal constante; las del DOM (innerHTML u outerHTML asignado, insertAdjacentHTML, document.write) solo con un valor compuesto o variable; [innerHTML] de Angular no cuenta porque Angular lo sanea, ni .html() de jQuery
- Un saneador de librería que envuelve el valor entero (DOMPurify.sanitize, sanitizeHtml, bleach.clean, nh3.clean, Sanitize.fragment, HtmlSanitizer.Sanitize, bluemonday) o una plantilla compuesta con cada interpolación pasada por una función de escape neutralizan la línea; JSON.stringify no, salvo que la misma línea escape <
- .vue, .svelte, .astro y .html reciben las formas de plantilla y todas las reglas de JS, y sus comentarios de marcado (<!-- -->) o de JS no cuentan; las plantillas de servidor (.cshtml, .razor, .erb, .ejs, .hbs, .handlebars, .jinja, .jinja2, .j2, .twig) pasan a ser código de producto en PRODUCT_EXT con sus formas de CWE-79
- Cifrado débil: DES, 3DES, RC2, RC4, Blowfish y el modo ECB de cualquier cifrado, también Cipher.getInstance("AES") sin modo, al cifrar y al descifrar, solo en la llamada que elige el algoritmo; una palabra suelta como ECB no cuenta
- El análisis de valores (CWE-79) admite como seguros, además de lo acordado, los números (aritmética sin +, Math.*, length, toFixed), los ternarios y las listas items.map((x) => <html>).join(sep) cuyas ramas o cuerpo son seguros, porque no pueden llevar marcado; una función propia como pct(x), definida en otra línea, sigue contando
- Un include de EJS y el {{{body}}} de un layout de Handlebars no cuentan: son las plantillas ya renderizadas de la propia app; un valor anidado tan hondo que desborda la pila cuenta como sink en lugar de tumbar ospec check
- Un valor CWE-79 que la línea no termina (paréntesis, comilla o etiqueta de plantilla sin cerrar, operador al final, valor vacío) cuenta: cada línea se juzga sola y el resto del valor está abajo; % solo es aritmética con un número a la izquierda, un comentario final no es una división y replace solo escapa < con g o replaceAll
- El escape de < con replace solo vale como última llamada de una cadena que forma todo el valor, y en Python, Ruby y Jinja * solo es aritmética entre números: texto por número repite el texto
- Un .html puede ser una plantilla de servidor que renderiza sus comentarios, así que en él no se salta ninguna línea; Handlebars no tiene operadores y {{{ }}} solo es seguro con un literal; set:html entre comillas invertidas es una plantilla literal; una asignación sin punto y coma cuya línea añadida siguiente abre con un operador cuenta; los operandos se leen en una pasada para no colgar ospec check
<!-- ospec:decisions:end -->

### Barrido de falsos positivos

- Contra el catálogo de `main`, el código de producto de los 17 repositorios locales (unas 770 000 líneas) no pierde ningún sink ni cambia ninguna etiqueta, y no da cifrado débil.
- Las 8 líneas nuevas son de CWE-79. Tres escriben un valor sin escapar: dos `innerHTML` con valores interpolados y un JSON-LD con `JSON.stringify`. Cinco son seguras por código de otra línea (una función que escapa `<`, DOMPurify en la línea anterior, un icono constante, CSS propio, una función numérica); según la respuesta del usuario cuentan y se retiran con su respuesta.

### Revisión de confianza

- Primera revisión: un CRITICAL (un valor que seguía en la línea siguiente se juzgaba seguro, así que el XSS partido por Prettier o Black no derivaba la señal) y tres avisos (`isNumeric` tomaba por número el `%` de Python, la barra de un comentario o de una ruta de Handlebars y un `replace` sin `g`; `dangerouslySetInnerHTML` solo contaba con `__html:` en la misma línea; `{{{body}}}` quedaba exento en cualquier vista y no solo en `layouts/`). Corregidos los cuatro; el validador dio la corrección por buena y señaló que el escape de `<` con `replace` no exigía cubrir todo el valor, también corregido.
- Segunda revisión, sobre el árbol corregido: tres avisos y dos sugerencias, ninguno bloqueante (un `.html` saltaba comentarios que una plantilla de servidor renderiza; la lectura de operandos podía retroceder de forma exponencial y colgar `ospec check`; `set:html` entre comillas invertidas interpola; `{{{post/body}}}` y `{{{item-1}}}` pasaban por aritmética; una asignación sin punto y coma seguida de una línea que abre con un operador no contaba). Corregidos los cinco; el validador los dio por resueltos, sin regresión.

### Memoria

- Prior decision (memory): E1.100: catálogo de sinks ordenado por debilidad y lenguaje -> scripts/lib/idd-sinks.js: current
- Prior decision (memory): E1.50: catálogo de sinks adaptado de gentle-ai -> scripts/lib/idd-sinks.js: stale (el catálogo ya no adapta el de gentle-ai; la memoria quedó marcada como sustituida)

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-18T00:21:47.103Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-18T00:21:47.103Z)
- ev-3: frozen-review for trust-review (2026-11-18T00:51:46.824Z, subagent-stop)
- ev-4: check-run for checks-pass (2026-11-18T00:56:11.576Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-18T00:56:11.576Z)
- ev-6: frozen-review for trust-review (2026-11-18T21:29:25.275Z, subagent-stop)
- ev-7: frozen-review for trust-review (2026-11-18T21:36:37.042Z, subagent-stop)
- ev-8: check-run for checks-pass (2026-11-18T22:58:22.249Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-11-18T22:58:22.249Z)
- ev-10: living-doc-current for living-doc (2026-11-18T22:58:28.179Z)
<!-- ospec:evidence:end -->
