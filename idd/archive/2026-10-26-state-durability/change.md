# state-durability

## Intent and acceptance

E1.46: el estado en disco sobrevive a un corte y a la concurrencia. La escritura atómica usa un temporal único y hace fsync del fichero y del directorio (JS y Go); el lock lleva un token de dueño (pid y nonce) que se comprueba antes de soltarlo y un heartbeat del mtime mientras dura la operación (JS y Go); un estado ilegible tiene salida apartándolo como *.corrupt con lista blanca. Residuos de E1.43: el guard de PreToolUse deniega también las MCP de copia, anexado o guardado, y REQ-hooks-029 y los docs dicen que close solo revalida el estado de un cambio abierto y que idd/archive/** y .ospec/review-receipts/** solo los protege el hook previo.

Acceptance: Un test con dos procesos concurrentes no pierde ninguna escritura del estado; un lock reclamado no lo borra su dueño anterior; un estado corrupto se aparta y el cambio se reanuda; un copy_file, append_file o save_file sobre idd/<cambio>/state.yaml se deniega en JS y Go; la spec y los docs ya no presentan la revalidación de close como garantía del archivo y los recibos

## Plan

1. Escritura durable. `writeFileAtomic` (`scripts/lib/atomic-write.js`) y `store.WriteFileAtomic` (`internal/store/store.go`) escriben en un temporal propio `<fichero>.<escritor>.tmp` abierto en exclusiva, hacen fsync, lo renombran y hacen fsync del directorio, salvo en Windows o con `EINVAL`/`ENOTSUP`. Antes borran, como mejor esfuerzo, los temporales de su fichero de más de 5 s, incluido el `.tmp` fijo de versiones anteriores. El `atomicWriteFile` propio de `internal/hooks/subagentstop.go` desaparece: el reductor de fases usa el de `store`.
2. Lock con dueño. `withFileLock` (`scripts/lib/ospec-state.js`) y `WithLock` (Go) escriben el token `pid:nonce` en el `.lock`, refrescan su mtime cada `LOCK_HEARTBEAT_MS`/`lockHeartbeat` (1 s) mientras dura la operación, pasan a la operación `assertOwned`/`owned` y, al terminar, solo borran el lock si sigue llevando su token. `mutateChange` (`idd-store.js`), la proyección de fase SDD (JS y Go) y los costes de fase (JS y Go) comprueban el token antes de escribir y fallan con `lock-lost` (`ErrLockLost`). `idd-refusals.js` dice cómo salir de `lock-lost`, y el estado ilegible nombra `ospec doctor --repair`.
3. `ospec doctor --repair` (`ospec-doctor.js`, `ospec.js`). Sin el flag nada cambia. Con él, `quarantineState` renombra `idd/<id>/state.yaml` a `state.yaml.corrupt-<hora UTC>` (con sufijo `-<n>` si ya existe) cuando `idd-change` lo da por error, es un fichero regular en un directorio real y no está en `idd/archive/`. La acción manda a `ospec status` si hay `.bak` y, si no, a `record intent` con el mismo id o a `git checkout`.
4. Guard. `WRITE_TOOL_RE` (JS) y `writeToolRe` (Go) suman `copy`, `append`, `save` y `upload`; en una copia cuentan `source` y `destination`, como en un movimiento. Fixture de paridad `pre-tool-use-state-copy-deny.json`.
5. Contrato y docs. REQ-idd-011 (`lock-lost`), REQ-idd-019 (`--repair`), REQ-idd-027 nuevo (durabilidad), REQ-hooks-029 (verbos y alcance real de `close`), la spec de `explore-transactional-barrier` (temporal propio), `docs/harness-runtime.md`, `docs/target-capabilities.md`, la guía de instalación y el roadmap.
6. Tests que nombraban el temporal fijo. `atomic-write.test.js`, `idd-store.test.js` y `federation-explore.test.js` reconocen `<fichero>.<escritor>.tmp`, envejecen el temporal que debe desaparecer e inyectan el fallo de escritura en `fs.open`; `federation-explore.test.js` pasa a la lista de sucesores de `k1-scope-guard.test.js`, como los ficheros de E1.42 y E1.45.
7. Impacto: ADR 0002, 0003, 0008, 0010 y 0011 y los escenarios `contract-compatibility`, `deterministic-resume`, `guard-fail-closed` y `offline-operation` (verificado a mano) `conforms`; ADR 0004, 0005 y 0009 `none`. La trust review salió sin hallazgos.

## Decisions

- Prior decision (memory): Una herramienta escribe si su nombre lo dice -> idd/archive/2026-10-26-close-revalidates-state/change.md: current. Se mantiene: se añaden verbos, no se invierte la regla.
- Prior decision (memory): `close` valida fuera del lock del estado y compara dentro -> idd/archive/2026-10-26-close-revalidates-state/change.md: current. El heartbeat no cambia eso: un `spawnSync` dentro del lock bloquea el bucle de eventos y el refresco de Node.
- **`ospec doctor --repair` aparta el estado; sin el flag, `doctor` sigue sin escribir** (respuesta del usuario al gate open-facts).
- **La lista blanca es `idd/<id>/state.yaml` de un cambio fuera del archivo que `idd-change` da por error** (JSON ilegible, esquema inválido o `change` distinto), un fichero regular en un directorio real (respuesta del usuario). Un symlink sigue en `error`.
- **Se aparta como `state.yaml.corrupt-<hora>` sin pisar una copia anterior; el cambio se reanuda desde el `.bak` o con `record intent` del mismo id, y `doctor` no toca git** (respuesta del usuario).
- **El dueño que perdió el lock falla con `lock-lost` sin escribir y nunca borra un lock ajeno** (respuesta del usuario). Comprueban el token los escritores que trabajan entre tomar el lock y escribir: el estado IDD y SDD y los costes de fase, que leen el histórico. Un anexado que escribe nada más tomar el lock (eventos, mediciones) no tiene ventana y no lo comprueba.
- **fsync en toda escritura atómica, JS y Go** (respuesta del usuario). Un fallo del fsync del fichero es error y deja el destino como estaba; el del directorio se omite en Windows y se ignora con `EINVAL`, `ENOTSUP` o `EOPNOTSUPP` (`errors.ErrUnsupported` en Go).
- **La siguiente escritura del mismo fichero borra sus temporales de más de 5 s** (respuesta del usuario), también el `.tmp` fijo anterior a E1.46, que antes se borraba siempre: uno más joven puede ser de un escritor vivo de una versión anterior. Es mejor esfuerzo: no poder borrarlo nunca falla la escritura.
- **El guard suma `copy`, `append`, `save` y `upload`, y en una copia cuentan origen y destino** (respuesta del usuario).
- **El token es `pid:nonce` en texto, igual en JS y Go.** Cada runtime solo compara el contenido con su propio token, así que el formato no se interpreta; un lock vacío de una versión anterior se sigue reclamando por mtime.
- **El heartbeat comprueba el token antes de tocar el mtime.** Refrescar por ruta sin comprobarlo podría mantener vivo el lock de otro; la ventana entre leer y tocar es de microsegundos. En Go el tiempo se inyecta (`withLockTiming`) en vez de volver variables las constantes.
- **El reclamo de un lock caducado sigue siendo `stat` y borrar.** Dos procesos que reclaman a la vez el mismo lock muerto pueden creerse dueños los dos; el que pierde lo descubre al comprobar el token antes de escribir y falla con `lock-lost`. Queda un residuo: si el que reclama se detiene entre el `stat` y el borrado más de lo que el otro tarda en leer, reducir y comprobar, la comprobación del otro llega antes del borrado.
- **Go exporta `store.WriteFileAtomic` y `internal/hooks` deja su copia.** Las dos necesitaban fsync y limpieza de temporales; duplicarlo era peor que exportar el helper.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-26T17:04:53.125Z)
- ev-2: check-run for checks-pass (2026-10-26T17:12:07.610Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-26T17:12:07.610Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-26T17:12:30.967Z)
- ev-5: check-run for checks-pass (2026-10-26T17:14:06.094Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-26T17:14:06.094Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-26T17:14:06.094Z)
- ev-8: frozen-review for trust-review (2026-10-26T17:21:50.618Z, subagent-stop)
- ev-9: living-doc-current for living-doc (2026-10-26T17:22:01.261Z)
<!-- ospec:evidence:end -->
