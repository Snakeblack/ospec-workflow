# ospec-workflow en 10 minutos — para el tech lead que evalúa

**La pregunta que respondes aquí: ¿qué me garantiza esto?**

## Qué es

ospec es un harness de desarrollo guiado por impacto (IDD, impact-driven development). Su flujo por defecto: el agente lleva cada cambio de código con el CLI `ospec`, que deriva las obligaciones de ese cambio a partir de su impacto (contrato público, datos persistentes, frontera de seguridad, bug, Strict TDD, ADR tocada) y decide cuándo está hecho. El estado vive en ficheros versionados con el repo, en `idd/`.

SDD (spec-driven development con OpenSpec) es un modo opcional, para quien quiere un contrato aprobado antes de escribir código.

## Qué garantiza IDD

| Garantía | Mecanismo | Dónde auditarlo |
|---|---|---|
| Un cambio solo está hecho con evidencia observada | Cada obligación se cierra solo con evidencia que graba el CLI al ejecutar (`ospec check`, `ospec run`, `ospec review`) sobre el árbol actual. Afirmar "los tests pasan" no satisface nada | `idd/<change>/state.yaml` → `evidence`, `runs` |
| Los gates los resuelve solo una persona | Cinco gates (intención ambigua, hechos abiertos, enmienda o contradicción de una ADR, operación irreversible, revisiones agotadas). Solo una respuesta explícita del usuario los resuelve, y se registra con su `source`. Aparte, el comando de tests del proyecto se aprueba antes de usarse | `state.yaml` → `gates` |
| La ceremonia crece con el impacto | Las señales salen del plan declarado y del diff real, y cada obligación (salvo `checks-pass`) depende de una señal. Un cambio de solo documentación no pasa por revisión de confianza | `state.yaml` → `signals`, `obligations` |
| El cierre es transaccional | `ospec close` solo tiene éxito con todas las obligaciones resueltas y ningún gate abierto. Archiva el cambio en `idd/archive/` | `idd/archive/` |
| La revisión de seguridad está acotada | Solo con señal de frontera de seguridad: un revisor de solo lectura, como máximo tres revisiones por cambio (más las que el usuario autorice) y una corrección acotada por revisión | `state.yaml` → `reviews`, `frozen-review` |
| Las decisiones de arquitectura quedan declaradas | Cada ADR o escenario de calidad tocado lleva su impacto (`none`, `conforms`, `amends`, `supersedes`, `contradicts`) | `state.yaml` → `impacts` |

## Perfil de equipo: un `team:` en `idd/config.yaml`

El proyecto puede declarar su perfil con `size` (`solo`, `small` o `multi-team`) y, opcionalmente, `experience` (`junior`, `mixed` o `senior`). El perfil fija los valores por defecto sin volver a preguntar:

| `size` | Estrategia de entrega | Strict TDD |
|---|---|---|
| `solo` | `single-pr` | no |
| `small` | `ask-on-risk` | sí |
| `multi-team` | `auto-chain` | sí |

- `experience` decide la mentoría (`junior` → `mentor`, `mixed` → `balanced`, `senior` → `expert`). Un `junior` activa Strict TDD sea cual sea el tamaño.
- Una clave explícita gana al perfil (por ejemplo `strict_tdd` en `idd/config.yaml`).
- `ospec team` muestra el perfil, su origen y sus defaults, en solo lectura. `ospec next` devuelve el perfil junto con el siguiente paso.

## Qué no garantiza

- **No revisa tu código como lo haría una persona.** La revisión de confianza es un revisor automático de solo lectura, y su evidencia es tan buena como los comandos de `checks:` que apruebes.
- **No entrega nada.** Ramas, commits y PR son decisión del equipo.
- **No cubre igual todos los hosts.** Las protecciones de los hooks de ciclo de vida dependen del host y del evento que mapea: no hay paridad total. Los git hooks locales son la única capa compartida por todos los targets, cuando se instalan (ver `docs/target-capabilities.md`).

## Modo SDD (opcional): contrato aprobado antes del código

Elige SDD cuando el cambio necesita acuerdo antes de implementar: APIs, reglas de negocio, integraciones o refactors de riesgo. El ciclo tiene siete fases (propuesta, especificación, diseño, tareas, aplicación con TDD, verificación y archivo), coordinadas por un orquestador. Sus aprobaciones quedan en `state.yaml` y solo nacen de una respuesta explícita del usuario. El coste es más artefactos y más fases que IDD. Se instala con `--with-sdd` y se activa solo con un comando `/sdd-*` o una petición explícita.

## Cómo evaluarlo en tu repo (30 min)

1. Instala el plugin. Con el marketplace (`claude plugin install ospec-workflow@ospec-tools`) obtienes solo IDD, sin el paquete SDD. Para incluir SDD, instala desde un checkout del repositorio con `npm run setup:claude -- --with-sdd`.
2. Declara el perfil en `idd/config.yaml` (`team:`) y ejecuta `ospec team` para ver los defaults que decide.
3. Pide un cambio pequeño al agente y mira `ospec status` y `idd/<change>/state.yaml`: las señales, las obligaciones y su evidencia.
4. Abre `idd/archive/` de este mismo repo: cada cambio cerrado trae la evidencia que lo respalda. Ese es el argumento de auditoría real.
