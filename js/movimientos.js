// ============================================================
// movimientos.js
// Log de trazabilidad: cada fila es un movimiento físico real
// (o pendiente de ejecutar), con de-dónde-a-dónde, cuánto, quién
// lo hizo y por qué (motivo derivado de la orden asociada).
//
// Esta página es de solo lectura (no se edita nada aquí) — es
// justamente el historial que tu jefe pidió poder consultar por
// artículo: "si busco el ID, aparece historial".
// ============================================================

let TODOS_LOS_MOVIMIENTOS = [];

async function iniciarMovimientos() {
  await cargarMovimientos();

  document.getElementById("filtro-busqueda-mov").addEventListener("input", renderizarMovimientos);
  document.getElementById("filtro-tipo-mov").addEventListener("change", renderizarMovimientos);
  document.getElementById("filtro-estado-mov").addEventListener("change", renderizarMovimientos);
  document.getElementById("filtro-fecha-mov").addEventListener("change", renderizarMovimientos);
}

async function cargarMovimientos() {
  // 1. Movimientos con su artículo y trabajador embebidos directamente
  //    (item_id y worker_id son llaves foráneas simples, sin ambigüedad)
  const { data: movimientos, error } = await supabaseClient
    .from("movements")
    .select("id, movement_type, quantity, status, created_at, order_id, from_position_id, to_position_id, items(sku, name), workers(name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando movimientos:", error);
    return;
  }

  // 2. Posiciones: las traemos aparte y armamos un mapa id->code, porque
  //    from_position_id y to_position_id apuntan AMBAS a la misma tabla
  //    "positions" y eso complica pedirlas embebidas directamente.
  const { data: posiciones } = await supabaseClient.from("positions").select("id, code");
  const mapaPosiciones = new Map(posiciones.map((p) => [p.id, p.code]));

  // 3. Órdenes: para armar el "motivo" (de qué proveedor vino / a qué cliente
  //    fue / entre qué almacenes se transfirió)
  const { data: ordenes } = await supabaseClient
    .from("orders")
    .select("id, type, origin_warehouse_id, destination_warehouse_id, suppliers(name), customers(name)");
  const mapaOrdenes = new Map(ordenes.map((o) => [o.id, o]));

  // Reutilizamos un mapa de almacenes (id -> nombre) para armar el motivo
  // de las transferencias internas.
  const { data: almacenes } = await supabaseClient.from("warehouses").select("id, name");
  const mapaAlmacenes = new Map(almacenes.map((w) => [w.id, w.name]));

  TODOS_LOS_MOVIMIENTOS = movimientos.map((mov) => {
    const orden = mapaOrdenes.get(mov.order_id);
    let motivo = "Movimiento interno";
    if (orden) {
      if (orden.type === "INBOUND") {
        motivo = `Recepción de ${orden.suppliers?.name || "proveedor"}`;
      } else if (orden.type === "OUTBOUND") {
        motivo = `Despacho a ${orden.customers?.name || "cliente"}`;
      } else {
        // TRANSFER
        const origenNombre = mapaAlmacenes.get(orden.origin_warehouse_id) || "almacén origen";
        const destinoNombre = mapaAlmacenes.get(orden.destination_warehouse_id) || "almacén destino";
        motivo = `Transferencia: ${origenNombre} → ${destinoNombre}`;
      }
    }

    return {
      ...mov,
      motivo,
      desde: mapaPosiciones.get(mov.from_position_id) || "-",
      hasta: mapaPosiciones.get(mov.to_position_id) || "-",
    };
  });

  renderizarMovimientos();
}

function renderizarMovimientos() {
  const busqueda = document.getElementById("filtro-busqueda-mov").value.toLowerCase().trim();
  const tipo = document.getElementById("filtro-tipo-mov").value;
  const estado = document.getElementById("filtro-estado-mov").value;
  const fecha = document.getElementById("filtro-fecha-mov").value; // formato YYYY-MM-DD

  const filtrados = TODOS_LOS_MOVIMIENTOS.filter((mov) => {
    const coincideBusqueda =
      !busqueda ||
      mov.items.name.toLowerCase().includes(busqueda) ||
      mov.items.sku.toLowerCase().includes(busqueda);

    const coincideTipo = !tipo || mov.movement_type === tipo;
    const coincideEstado = !estado || mov.status === estado;

    const fechaMovimiento = mov.created_at.slice(0, 10); // "2026-09-08"
    const coincideFecha = !fecha || fechaMovimiento === fecha;

    return coincideBusqueda && coincideTipo && coincideEstado && coincideFecha;
  });

  const tbody = document.getElementById("tabla-movimientos");

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">No hay movimientos que coincidan con estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados
    .map((mov) => {
      const fechaTexto = new Date(mov.created_at).toLocaleDateString("es-PE");
      const badgeClase = {
        PENDING: "badge-pending",
        APPROVED: "badge-approved",
        REJECTED: "badge-rejected",
        EXECUTED: "badge-executed",
      }[mov.status];
      const badgeTexto = {
        PENDING: "Pendiente",
        APPROVED: "Aprobado",
        REJECTED: "Rechazado",
        EXECUTED: "Ejecutado",
      }[mov.status];

      return `
        <tr>
          <td>${fechaTexto}</td>
          <td>${mov.items.sku}</td>
          <td>${mov.items.name}</td>
          <td>${mov.movement_type}</td>
          <td>${mov.motivo}</td>
          <td>${mov.desde} → ${mov.hasta}</td>
          <td>${mov.quantity}</td>
          <td>${mov.workers?.name || "-"}</td>
          <td><span class="badge ${badgeClase}">${badgeTexto}</span></td>
        </tr>
      `;
    })
    .join("");
}

iniciarMovimientos();