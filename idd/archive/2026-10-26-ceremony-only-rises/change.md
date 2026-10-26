# ceremony-only-rises

## Intent and acceptance

E1.44 (B3, B6, B7, B9): el modelo solo puede subir la ceremonia; boundary-tests exige un test en el diff, las citas de open-facts quedan acotadas, un cambio de checks frente a la base abre el gate checks-changed y check contrasta --kind con el diff

Acceptance: Los cuatro casos de la auditoría (feature sin test nuevo, cita a package.json, checks cambiado a true, kind docs que toca producto y refactor que borra líneas de un contrato) se rechazan con su motivo y su how, y los tests de los cambios legítimos siguen en verde

## Plan

1. B3, `boundary-tests`. `settleBoundary` (`idd-check.js`) recibe `tests`, los tests del diff con alguna línea añadida que no esté en blanco (`addedTests` en `ospec.js`), y sin ellos deja la obligación `pending` con la razón «the diff adds no line to a test». Un check que pasa con `tests > 0` o sin recuento la cumple solo entonces. La evidencia `tested-check` nombra esos `tests`, y `validateState` sigue aceptando el `has_test` de los estados anteriores.
2. B6, citas. `parseCite` (`idd-facts.js`) rechaza con `cite-unresolved` una cita a un manifiesto o un lockfile; `classifyPath` llega inyectado para no cerrar un ciclo de imports, y `MANIFESTS` suma los lockfiles que faltaban. `citesOutsidePlan` (`idd-signals.js`) nombra las citas fuera de la documentación cuyo fichero no está en el plan ni en el diff.
3. B7, `checks-changed`. Sexto gate en `GATES`, con su pregunta en `idd-next.js` y el catálogo de Go regenerado. `readBaseChecks` (`idd-workspace.js`) lee los checks de `idd/config.yaml` en la base con `git show` (ninguno con base nula, sin fichero o ilegible), y `settleChecksChange` (`idd-check.js`) abre una entrada con los `checks` que aprueba cuando difieren de la base y de los ya aprobados. `record gate --open` lo rechaza con `gate-managed-by-check`.
4. B9, `--kind`. `changedLinesByFile` lee también las líneas quitadas del diff (`removedLines`). `kindMismatch` rechaza un `docs` que toca producto y un `refactor` que quita una línea de un documento de contrato o una línea de documentación que declara un contrato. `requireDeclaredCeremony` lanza `kind-mismatch` y `cite-outside-plan` con su `how` en `check`, antes de ejecutar nada, y en `close` (`requireDerived`), que además rechaza los checks que ningún `checks-changed` resuelto aprueba. `recordIntent` acepta volver a registrar una intención resuelta si el kind sube (`raiseIntent`).
5. Contrato y docs. REQ-idd-003, 008 (seis gates), 009, 011, 014 y 018 en `openspec/specs/idd/spec.md`; la línea del gate en la skill `idd`, la regla de las citas en `references/open-facts.md`, `references/approvals.md`, los README, `docs/` y `openwiki/`. La fixture `s-checks-changed` fija que Go y JS reanudan igual con el gate abierto.
6. Tras la trust review (dos WARNING, aprobada): `untested-product` se deriva con la misma regla que `boundary-tests` (`addedTests`, ahora en `idd-signals.js`), así que un test borrado o vaciado antes del primer `check` ya no evita la señal. Y la spec, los README y openwiki dicen qué contrasta el CLI en lugar de «nunca bajarla»: `strict_tdd`, `impact` y `contracts` siguen sin compararse con la base, un límite escrito en REQ-idd-014 que fija un test y que cierra E1.53.
7. Tras la segunda (un WARNING, aprobada): `close` (`requireDerived`) rechaza un `boundary-tests` satisfecho cuando el diff contra la base del cambio no añade ninguna línea a un test, porque un `check --base` más antiguo contaba como añadidos los tests de commits anteriores.
8. Tras la tercera (un WARNING y una SUGGESTION, aprobada) y con la cuarta review autorizada por el usuario: una cita nueva se escribe en forma canónica (`citePath`: sin `./`, `.` ni barra final) y `citeTarget` (`ospec.js`) la resuelve al fichero real, con los symlinks resueltos, antes de juzgarla, leerla y guardarla. `package.json/:2` o un symlink a `package.json` ya no esquivan el rechazo del manifiesto.
9. La cuarta review (un WARNING y dos SUGGESTION) quedó aprobada, y el usuario decidió cerrar y pasar los tres avisos a E1.53.

## Decisions

- **`boundary-tests` cuenta un test con una línea añadida que no esté en blanco** (respuesta del usuario). Borrar o vaciar un test no cuenta, y el check sigue exigiendo `tests > 0` o ningún recuento.
- **Una cita nunca cae en un manifiesto ni en un lockfile, y fuera de la documentación nombra un fichero del plan o del diff** (respuesta del usuario). `record intent` va antes que `signals`, así que el plan se comprueba en `check` y en `close`, y la salida es `ospec signals --path`. Los estados ya guardados siguen validando sus citas.
- **`checks-changed` se abre también en la primera configuración, y cada juego de checks tiene su entrada** (respuesta del usuario). Así queda registrada la aprobación que la skill ya pedía en prosa, y una respuesta aprueba solo los checks que lista. Una entrada que nadie respondió sigue a los checks y desaparece cuando vuelven a la base o a un juego aprobado.
- **Un `refactor` solo se rechaza por quitar líneas de documentos de contrato o de documentación que declara un contrato** (respuesta del usuario). Una línea quitada que vuelve a aparecer en uno de ellos es un movimiento. El código de una ruta `public_contract` no cuenta, porque una línea modificada es borrada más añadida y bloquearía cualquier refactor interno.
- **La salida de `kind-mismatch` es volver a registrar la intención con un kind mayor** (respuesta del usuario): `docs` a `refactor`, `bug` o `feature`, y `refactor` a `bug` o `feature`. Bajar el kind o cambiar entre `bug` y `feature` sigue siendo `intent-conflict`. Mientras `open-facts` está abierto, la subida se rechaza con `open-facts-open`, para que no se salte preguntas ya hechas, y solo una pregunta nueva abre otra entrada.
- **Un `docs` se rechaza solo si el diff toca código de producto** (respuesta del usuario). Tests, manifiestos y configuración no cuentan: aquí un cambio de documentación puede tocar `manifest-sync.test.js` o subir una versión.
- **Una entrada resuelta de `open-facts` puede sobrevivir a los hechos que la abrieron.** Tras subir el kind, `validateFacts` solo exige preguntas a una entrada abierta; sin eso, pasar de preguntas a `--no-open-facts` dejaría un estado inválido.
- **El parser del diff solo lee cabeceras antes del primer hunk.** Con `--unified=0`, una línea quitada `-- x` sale como `--- x` y una añadida `++ x` como `+++ x`; el parser anterior las tomaba por cabeceras, y leer las líneas quitadas lo hacía visible.
- **`untested-product` y `boundary-tests` comparten la definición de test.** Con dos reglas, un test borrado o vaciado en el primer `check` evitaba la señal, y con ella la obligación (hallazgo de la trust review).
- **El resto de `idd/config.yaml` queda para E1.53 `config-only-rises`, justo detrás de E1.44** (decisión del usuario sobre el segundo hallazgo de la review). Este cambio acota lo que promete: solo `checks` se contrasta con la base, y `strict_tdd`, `impact` y `contracts` todavía pueden bajar las obligaciones derivadas.
- **`close` vuelve a leer los tests de `boundary-tests` contra la base del cambio, sin tocar `check --base`.** La opción sigue sirviendo para leer el diff contra otra referencia, y `close`, que es el único «hecho», no acepta una evidencia que esa lectura haya inflado. `contract-spec-and-test` tiene el mismo hueco desde antes de este cambio y queda fuera.
- **Una cita se juzga por el fichero que alcanza, no por cómo se escribe** (hallazgo de la tercera review). La cobertura guarda ese fichero, así que el plan también se compara con él. Los estados ya guardados siguen validando sus rutas como estaban.
- **Los dos residuos de las reviews pasan a E1.53** (decisión del usuario): `contract-spec-and-test` con un `check --base` más antiguo, anterior a E1.44, y la lista de extensiones de producto de `classifyPath`.
- **Los tres avisos de la cuarta review pasan a E1.53** (decisión del usuario: cerrar ya). Con `git config diff.mnemonicPrefix` o un `.gitattributes` con `-diff`, `readGitDiff` no trae líneas de los ficheros versionados, y quedan ciegos el contraste de B9, los tests de B3 y las señales por contenido que ya existían; se reprodujo. Una sola línea de comentario en un test cumple `boundary-tests`. Y subir a feature repitiendo una pregunta ya respondida no reabre `open-facts`, mientras que la subida puede reescribir `intent.request`.
- **El contraste del kind y de las citas rechaza el comando, no añade una obligación.** `check` no ejecuta nada mientras lo declarado contradice el diff, porque la evidencia que registraría pertenecería a otra ceremonia, y la salida es un comando barato.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-26T08:08:01.870Z)
- ev-2: frozen-review for trust-review (2026-10-26T08:31:21.017Z, subagent-stop)
- ev-3: check-run for checks-pass (2026-10-26T08:39:37.336Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-26T08:39:37.336Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-26T08:39:37.336Z)
- ev-6: frozen-review for trust-review (2026-10-26T08:46:45.155Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-10-26T08:49:30.675Z)
- ev-8: contract-spec-and-test for contract-spec-and-test (2026-10-26T08:49:30.675Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-10-26T08:49:30.675Z)
- ev-10: frozen-review for trust-review (2026-10-26T08:59:23.156Z, subagent-stop)
- ev-11: check-run for checks-pass (2026-10-26T09:53:32.181Z)
- ev-12: contract-spec-and-test for contract-spec-and-test (2026-10-26T09:53:32.181Z)
- ev-13: adr-impact-declaration for adr-impact-declaration (2026-10-26T09:53:32.181Z)
- ev-14: frozen-review for trust-review (2026-10-26T10:04:17.477Z, subagent-stop)
- ev-15: living-doc-current for living-doc (2026-10-26T10:13:13.853Z)
<!-- ospec:evidence:end -->
