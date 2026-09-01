# ADR-015: Arquitectura del Componente Footer Contextual en `internal/tui/footer`

## Estado
Aceptado

## Fecha
2026-08-30

## Contexto
Anteriormente, el footer de la aplicación se renderizaba a través de `theme.RenderFooter`, el cual contenía únicamente atajos estáticos globales (`1-4/Tab Switch Tab • ? Help • q Quit`). A medida que se incorporaron las vistas de *Models Hub* (selección de presets `1-3`, `Enter`), *Targets Manager* (sincronización `s`, recarga `r`) y *System Doctor* (re-escaneo `r`/`Enter`), los usuarios requieren visibilidad inmediata de las operaciones disponibles en la vista actual sin tener que memorizarlas.

## Decisión
Crear el paquete `internal/tui/footer` exponiendo `RenderContextualFooter(activeTab int, width int) string`. Este componente analiza la pestaña activa y genera la lista de atajos correspondiente con estilo Lip Gloss de alto contraste. Para terminales con ancho $< 80$ columnas, implementa una variante compacta que evita desbordamientos o saltos de línea no deseados.

## Consecuencias
- **Positivas**: Mayor ergonomía, descubrimiento contextual de acciones, cero impacto en la lógica de las vistas hijas.
- **Mitigaciones**: Mantener desacoplamiento total: el footer recibe únicamente el índice de pestaña y las dimensiones, sin depender de los estados internos de las vistas.
