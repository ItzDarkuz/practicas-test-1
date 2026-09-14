# Sistema de Gestión de Almacén — Calzado Deportivo

Proyecto desarrollado para la primera evaluación de práctica en DH-INSIGHT. Sistema de gestión interna (back-office) de inventario y operación de almacén — INBOUND, OUTBOUND y transferencias entre almacenes — para una empresa de calzado deportivo con un almacén central y almacenes de tienda.

## Tecnologías utilizadas

- **Supabase** (PostgreSQL) como base de datos y backend.
- **HTML + CSS + JavaScript** puro para el frontend (sin frameworks).
- **Supabase JS Client** (vía CDN) para conectar el frontend con la base de datos.

## Cómo ejecutar el proyecto

1. Abrir `index.html` con la extensión **Live Server** de VS Code (o cualquier servidor local). No abrir el archivo directo con doble click, ya que algunos navegadores restringen peticiones de red hechas desde `file://`.
2. La conexión a Supabase está configurada en `js/supabaseClient.js` (URL del proyecto + Publishable/anon key).

## Alcance: herramienta de gestión interna, no un sitio de compra

Este sistema está pensado para el **equipo logístico y de almacén** (quienes crean órdenes, ubican productos, aprueban movimientos) — no incluye un frontend orientado al cliente/comprador final (sin carrito, sin checkout, sin catálogo público), porque el caso de negocio no lo solicita. Los módulos de "Clientes" y "Proveedores" son catálogos de datos que usa el personal interno para saber a quién se le despacha o de quién se recibe mercadería, no un portal para que esas personas ingresen al sistema.

## Arquitectura

```
/proyecto
  index.html          → Dashboard (KPIs)
  inventario.html      → Catálogo de artículos (CRUD, búsqueda, filtros)
  almacen.html          → Mapa visual de racks y posiciones
  ordenes.html           → Órdenes INBOUND/OUTBOUND/TRANSFER + workflow de aprobación
  movimientos.html        → Log de trazabilidad de movimientos
  proveedores.html         → CRUD de proveedores
  clientes.html              → CRUD de clientes/tiendas destino
  trabajadores.html           → CRUD de trabajadores de almacén
  /css/styles.css               → Estilos de todo el sitio
  /js/
    supabaseClient.js             → Conexión única a Supabase + utilidades compartidas (formatearFecha)
    index.js, inventario.js, ...    → Lógica de cada página
```

Cada página HTML es independiente (sin framework de enrutamiento); `index.html` funciona como punto de entrada con la navegación principal hacia el resto del sitio, tal como se solicitó.

## Modelo de datos

El enunciado del test pedía 3 tablas principales interconectadas: `inventory_items`, `inventory`, `inventory_movements`. El caso de negocio (`CASO.txt`), sin embargo, exige resolver requerimientos que esas 3 tablas por sí solas no cubren: mapa físico del almacén, reserva de espacio, diferenciación entre una orden creada y un movimiento ejecutado, y manejo de estados/aprobaciones.

Se optó por **respetar la relación núcleo pedida y extenderla** en 12 tablas:

| Tabla del enunciado | Implementada como | Tablas de soporte agregadas |
|---|---|---|
| `inventory_items` | `items` (+ `categories`) | Jerarquía marca → línea → artículo, cada talla es un SKU independiente |
| `inventory` | `stock` | `warehouses`, `racks`, `positions` — ubicación física real |
| `inventory_movements` | `movements` | `orders`, `order_items` — separan la intención (orden) de la ejecución (movimiento) |
| *(no especificado)* | — | `suppliers`, `customers`, `workers` — trazabilidad de quién y con quién |

### Relaciones principales

- `categories` (1) → `items` (N)
- `warehouses` (1) → `racks` (1) → `positions` (N)
- `items` + `warehouses` + `positions` → `stock` (cantidad ubicada por almacén)
- `suppliers`/`customers` + `workers` → `orders` (1) → `order_items` (N)
- `items` + `orders` → `movements` (log de ejecución, con posición origen/destino)

### Decisiones de diseño relevantes

- **Cada talla es un artículo (SKU) independiente**, no una variante dentro de un mismo artículo — esto agiliza la búsqueda puntual y la detección de quiebre de stock por talla específica, que es como opera el negocio real.
- **Se modelaron 3 almacenes**: un almacén central (`type = CENTRAL`, donde llega la mercadería del proveedor primero) y 2 almacenes de tienda (`type = STORE`), reflejando un modelo de distribución realista.
- El stock de un mismo artículo puede existir simultáneamente en varios almacenes con cantidades y posiciones distintas — por eso `stock` es una tabla puente y no una columna directa en `items`.
- Una posición está libre si ninguna fila de `stock` la referencia; ocupada si sí. El mapa visual (`almacen.html`) solo dibuja las posiciones que existen como registros — no se generó una cuadrícula teórica completa del almacén, ya que el caso no especifica dimensiones físicas. El almacén tampoco tiene un límite de racks/posiciones definido — es de capacidad abierta, tal como especificó el caso de negocio.

## Funcionalidades implementadas

- **Dashboard**: total de artículos, stock total, artículos bajo stock mínimo (con detalle), valor total de inventario, movimientos recientes.
- **Inventario**: listado con búsqueda por nombre/SKU, filtro por categoría y por estado de stock; crear, editar y eliminar artículos.
- **Mapa de Almacén**: selector de almacén, visualización de racks y sus posiciones (ocupada/libre), detalle del artículo al hacer click en una posición ocupada.
- **Órdenes**: listado filtrable por tipo y estado; creación de nuevas órdenes INBOUND, OUTBOUND o TRANSFER con múltiples artículos y trabajador responsable.
- **Movimientos**: historial completo y filtrable de todo lo que se movió físicamente, con motivo, posición origen/destino, trabajador responsable y estado.
- **Proveedores, Clientes, Trabajadores**: CRUD simple para cada catálogo de apoyo.

## Workflow de aprobación (bonus)

Una orden nueva se crea siempre en estado `PENDING`, junto con su detalle (`order_items`) y su movimiento asociado (también `PENDING`) — el stock **no se modifica todavía**, replicando el comportamiento descrito en el caso (ejemplo: una salida de 20 unidades solicitada permanece "pendiente" sin afectar el stock hasta la aprobación). Al crear la orden se selecciona también el **trabajador responsable**, que queda registrado tanto en la orden como en su movimiento asociado — esto es lo que permite saber "quién fue el que movió esto", como se pidió en la reunión de indicaciones.

- **Aprobar** una orden actualiza el stock real (`stock.quantity`):
  - `INBOUND`: suma en el almacén de destino.
  - `OUTBOUND`: resta en el almacén de origen (con validación de stock insuficiente antes de restar).
  - `TRANSFER`: resta en el origen y suma en el destino en la misma operación.
  - Si el artículo aprobado todavía no tiene una posición asignada en el almacén correspondiente, el sistema muestra primero qué racks y posiciones ya existen ahí (para no elegir a ciegas) y pide el código de rack/posición donde se va a ubicar (creándolos si no existen, y avisando si esa posición ya está en uso) antes de confirmar el stock. Ese dato queda reflejado tanto en `stock` como en el movimiento correspondiente (`from_position_id`/`to_position_id`).
  - El estado de la orden y de sus movimientos asociados se sincroniza a `APPROVED`.
- **Rechazar** una orden cambia el estado a `REJECTED` sin modificar el stock.

### Transferencias entre almacenes (TRANSFER)

Además de INBOUND (proveedor → almacén) y OUTBOUND (almacén → cliente/tienda), el sistema soporta un tercer tipo de orden, **TRANSFER**, para mover stock entre dos almacenes propios (por ejemplo, del almacén central a una tienda que se quedó sin stock, o de una tienda a otra). Una orden TRANSFER no tiene proveedor ni cliente asociado — en su lugar, especifica un almacén de origen y uno de destino, y genera un movimiento de tipo `INTERNAL_TRANSFER`.

## Actualización automática del stock (bonus)

Implementada dentro del mismo flujo de aprobación descrito arriba (`ordenes.js`), en vez de requerir una edición manual del stock por separado. Adicionalmente, la columna `updated_at` de `items` y `stock` se actualiza automáticamente mediante un trigger de base de datos (`set_updated_at()`) cada vez que se modifica una fila, sin intervención del frontend.

## Seguridad / RLS

Row Level Security está **deshabilitado** en todas las tablas durante esta etapa de desarrollo y pruebas, para simplificar la construcción iterativa. Como mejora futura, se recomienda:

- Habilitar RLS en las 12 tablas.
- Política de lectura abierta (o restringida a usuarios autenticados, según necesidad del negocio).
- Política de escritura restringida a usuarios autenticados vía Supabase Auth.
- Roles diferenciados (admin / trabajador / proveedor) si el negocio lo requiere — no implementado en esta versión porque el caso no lo exige explícitamente y se priorizó completar el flujo operativo funcional dentro del tiempo disponible.

## Limitaciones conocidas

- No hay autenticación de usuarios ni control de acceso por rol.
- El mapa de almacén solo muestra posiciones que ya tienen un registro en la base de datos (no genera una cuadrícula teórica completa).
- La columna `motivo` en Movimientos se deriva dinámicamente de la orden asociada; los movimientos sin orden asociada se muestran como "Movimiento interno".
- Los nombres de artículos/proveedores/clientes con apóstrofes (comillas simples) podrían romper algunos botones de acción en la interfaz, ya que se insertan directamente en atributos `onclick`. No se detectó ningún caso así en la data de prueba usada.
- El estado `EXECUTED` definido originalmente para `movements.status` no se utiliza: el flujo actual pasa directamente de `PENDING` a `APPROVED`/`REJECTED`, sin un paso intermedio de "ejecución física" separado de la aprobación.
- Las fechas de la data de ejemplo original (importada del CSV) se guardaron sin hora específica (medianoche UTC); se muestran usando la fecha guardada tal cual, sin conversión de zona horaria, para evitar que aparezcan un día antes en husos horarios detrás de UTC (como Perú).
