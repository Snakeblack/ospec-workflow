# change-decisions-and-adr-impact

## Intent and acceptance

E3.1: IDD declara el impacto arquitectónico de un cambio y propone ADR con gate; el cierre SDD deja de promover decisiones de desarrollo a docs/adr/

Acceptance: Un cambio en una librería interna no genera ningún ADR; un cambio que introduce mensajería asíncrona entre módulos propone una enmienda al ADR de integración y se detiene en el gate; el archivo SDD emite adr_promotions vacío

## Plan

1. **IDD (impacto arquitectónico).**
   - `ospec signals --adr <id> --quality <id>` activa `adr-or-quality-attribute` y registra cada referencia en `impacts` del estado; el CLI rechaza un ADR o escenario que no existe en disco.
   - `ospec record impact --adr|--quality <id> --impact none|conforms|amends|supersedes|contradicts --reason <texto>` declara el impacto; `amends`, `supersedes` y `contradicts` abren `adr-amend-or-contradict`. `--record <ruta>` adjunta el ADR nuevo que enmienda o sustituye.
   - `ospec check` asienta `adr-impact-declaration` cuando cada referencia tiene impacto, el gate está resuelto y cada ADR nuevo existe, pasa el lint y cita el ADR que cambia.
   - `ospec next` sugiere, sin bloquear, un ADR cuando hay una señal de frontera y ningún ADR declarado.
   - Spec IDD, skills `idd` y `foundation`, y el fixture de referencia `architecture-amendment`.
2. **SDD (archivo).** `sdd-archive` deja de promover; `archive-plan` v1 rechaza entradas en `adr_promotions`; el runtime ya no copia a `docs/adr/`; `sdd-design` guarda decisiones `dc` locales (`decisions/dc-NNN.md`). Specs, tests, `docs/adr/README.md` y la divergencia del mapa de componentes.

## Decisions

- **Respuestas del gate open-facts (usuario, «todas las recomendadas»):** señal declarada en E3.1 y derivada por rutas en E3.2; la declaración más las validaciones del CLI y el gate conforman ADR-0005; vocabulario con `supersedes`; sin K6d (exige nueve dimensiones y un candidato congelado que IDD no produce); el agente redacta el ADR y nunca reescribe uno `accepted`; las decisiones del change quedan en texto libre como `dc`; promoción solo en IDD; un change con dos unidades.
- **Un impacto se declara una vez.** Repetirlo con otro valor se rechaza; solo se puede adjuntar después el ADR nuevo. Un impacto que pide gate con el gate ya resuelto también se rechaza: el usuario decide todas las enmiendas en una sola respuesta.
- **Escenarios de calidad:** `amends` o `supersedes` de un escenario pasan por el gate pero no exigen ADR nuevo; el escenario se actualiza en el mapa de conocimiento.
- **ADR-0009 conforma:** `archive-plan` v1 con entradas en `adr_promotions` se rechaza con un error que nombra el contrato, que es la vía que el ADR permite; el plan lo emite y lo consume el mismo archivo.
- **Sin derivación desde el diff:** la señal solo sale de la declaración; `ospec check` no la recalcula.
- **Rama de lectura en el runtime de archivo:** el staging y el snapshot de ADR se retiran porque la validación de forma se repite en `init` y `preflighted`; el bucle de commit se conserva para una transacción preparada antes de E3.1, que termina como se planificó (ADR-0009).
- **Evidencia `ruta:línea` desplazada:** las ediciones de `scripts/ospec.js` movieron las líneas que citan el mapa de componentes, el mapa de conocimiento y ADR-0003; se actualizan los números de línea, sin tocar el texto de la decisión.
- **Impacto propio (dogfooding):** este change declara ADR 0003, 0004, 0005, 0009 y 0011 y el escenario `contract-compatibility`, todos `conforms`. Se registra con el CLI de la fuente, porque el de `dist` todavía no conoce el campo `impacts`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-11T17:14:47.411Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-11T17:15:13.852Z)
- ev-3: check-run for checks-pass (2026-10-11T17:15:30.977Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-11T17:15:30.977Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-11T17:15:30.977Z)
- ev-6: living-doc-current for living-doc (2026-10-11T17:15:35.289Z)
<!-- ospec:evidence:end -->
