# pedidos

Pedidos de una tienda en línea. Los precios y los totales son céntimos
enteros: `1250` son 12,50 €.

| Pieza | Qué hace |
| --- | --- |
| `src/domain/` | Reglas de los pedidos: crear, confirmar y cancelar |
| `src/infra/` | Almacén de pedidos y correo saliente |
| `src/app.js` | Casos de uso: `createApp()` devuelve `crear`, `confirmar`, `cancelar` y `ver` |

Las decisiones de arquitectura están en `docs/architecture/decisions/`.

Pruebas: `npm test`.
