# gastos

Librería de gastos compartidos para grupos: viajes, pisos y cenas. Todos los
importes son céntimos enteros: `1250` son 12,50 €.

Un gasto es `{ concepto, importe, pagadoPor }`.

| Función | Qué hace |
| --- | --- |
| `totalPorPersona(gastos)` | Lo que ha pagado cada persona, por ejemplo `{ ana: 5540, bruno: 1200 }` |
| `totalDelGrupo(gastos)` | La suma de todos los gastos |

Pruebas: `npm test`.
