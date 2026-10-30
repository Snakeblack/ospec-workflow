# turn-fence-robustness

## Intent and acceptance

La valla de fin de turno (E1.49) da falsos user-unverified tras reiniciar .ospec/turns, el hook JS crea .ospec/turns en un cwd inexistente, una sesión en un subdirectorio cuenta fuera de la raíz que lee el CLI, el aviso de la valla propone un remedio que no funciona y gate-conflict confunde fuente con respuesta

Acceptance: Tras perderse .ospec/turns, una respuesta registrada después de otro fin de turno queda user; un Stop con cwd inexistente no crea directorios (Node y Go cuentan en el cwd del proceso) y Go escribe latest.md de forma atómica; el aviso user-unverified nombra el remedio según el motivo y no pide re-registrar; gate-conflict distingue otra respuesta de otra fuente; Antigravity no toma un fichero por directorio; la doc del Stop y del guard nombra .ospec/turns; el test de Copilot reintenta ante el plazo del lanzador

## Plan

<!-- ospec:plan:start -->
- Files: `docs/harness-runtime.md`, `internal/hooks/stop.go`, `internal/hooks/stop_test.go`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `openwiki/hooks-runtime/lifecycle.md`, `openwiki/idd/flujo-idd.md`, `scripts/configure/install-global-copilot.test.js`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`, `scripts/hooks/stop.js`, `scripts/hooks/stop.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/pathsafe.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
- Work units: 5
<!-- ospec:plan:end -->

Lo construido, en cinco unidades (lote PR1 de la review general del 2026-10-29, hallazgos 6 a 9, más dos huecos que dejó PR1a):

1. Contador reiniciado: `fenceGates` (`scripts/lib/turn-fence.js`) y `validateState` (`scripts/lib/idd-contract.js`) aceptan cualquier cuenta distinta de la de apertura. Una cuenta menor solo sale de un `.ospec/turns` perdido (`git clean -fdX`, un worktree nuevo) y de un Stop posterior que contó desde 1.
2. Dónde cuenta el Stop: `turnsRoot` sube desde el workspace hasta el primer `.git`, igual en Node (`turn-fence.js`, usado por `scripts/hooks/stop.js`) y en Go (`internal/hooks/stop.go`). `resolveWorkspaceCwd` (`scripts/lib/pathsafe.js`) exige un directorio existente, como `resolveCwd` de Go, así que un cwd inexistente ya no se crea. Go escribe `latest.md` con `store.WriteFileAtomic`.
3. Aviso y rechazo: el aviso de `record` (`scripts/ospec.js`) dice que la respuesta se queda `user-unverified` y da el remedio del motivo para los siguientes gates, que calcula `unverifiedRemedy`. `gate-conflict` (`scripts/lib/idd-record.js`) dice si cambia la respuesta o solo la fuente.
4. Antigravity: `adaptAntigravityHookInput` (`scripts/hooks/ospec-hooks-launch.js`) usa `isExistingDirectory`, como Cursor, y deja de tomar un fichero por directorio.
5. Specs, documentación y test intermitente:
   - REQ-idd-008 y REQ-hooks-030, `openwiki/hooks-runtime/lifecycle.md`, `openwiki/idd/flujo-idd.md` y `docs/harness-runtime.md` §5.
   - El test de Copilot global reintenta una vez si el lanzador agota su plazo en Windows sin haber contado, y enseña la salida del hook cuando falta la cuenta.

## Decisions

<!-- ospec:decisions:start -->
- Un turno distinto del de apertura cuenta como fin de turno (turn !== opened_turn): un contador reiniciado sigue verificando tras el siguiente Stop
- resolveWorkspaceCwd de Node exige un directorio existente, como resolveCwd de Go, y si no cae al cwd del proceso
- El binario desfasado (hallazgo 5 del lote) va en una PR propia (PR1c)
- El Stop cuenta el turno en el primer ancestro del cwd que tiene .git (fichero o directorio), en Node y Go, sin lanzar git; sin ninguno, en el cwd. Solo el contador: latest.md y el resto del Stop siguen en el cwd
<!-- ospec:decisions:end -->

Decisiones de desarrollo:

- La regla pasa de «mayor que» a «distinta de». Solo queda vallado un caso que no se distingue de una respuesta sin fin de turno: perder la cuenta y volver justo al valor de apertura.
- `turnsRoot` comprueba que `.git` exista (`fs.existsSync`, `os.Stat`), sin lanzar git, para no gastar un proceso en cada fin de turno. Un `.git` fichero (worktree o submódulo) también marca la raíz.
- Al resolverse, la respuesta vallada no cambia: volver a registrarla no hace nada. Por eso el remedio del aviso habla de los siguientes gates y ya no pide «registrar la respuesta cuando conteste el usuario».
- `scripts/lib/pathsafe.js` entra en la lista de sucesores K2 de `k1-scope-guard.test.js`, como el resto de módulos que han cambiado desde la base de K1.
- El diff derivó `persistent-data` porque cambia la validación del estado persistido. Hacia delante es compatible. Un CLI anterior rechazaría un gate `user` con `resolved_turn` menor que `opened_turn`, y ningún estado anterior lo tiene.
- Queda para PR1c el binario desfasado (hallazgo 5): no copiarlo, reintentar con Node ante `EACCES`/`ENOEXEC`/126 y la versión embebida.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-30T17:01:05.463Z)
- ev-2: check-run for checks-pass (2026-10-30T17:06:26.668Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-30T17:06:26.668Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-30T17:06:51.415Z)
- ev-5: frozen-review for trust-review (2026-10-30T17:09:55.886Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-10-30T17:11:17.053Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-30T17:11:17.053Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-30T17:11:17.053Z)
- ev-9: living-doc-current for living-doc (2026-10-30T17:11:17.434Z)
<!-- ospec:evidence:end -->
