// ============================================================
// ordenes.js
// Lista de órdenes + el workflow de aprobación:
//   crear orden (PENDING, no toca stock)
//     -> Aprobar (actualiza stock real + movimientos a APPROVED)
//     -> Rechazar (no toca stock, solo cambia el estado)
//
// Esta es la implementación del bonus "workflow de aprobación"
// + "actualización automática del stock" de la rúbrica.
// ============================================================

let TODAS_LAS_ORDENES = [];
let MAPA_ALMACENES = new Map();     // id -> nombre
let CONTADOR_ITEMS_FORM = 0;         // para dar id único a cada fila del formulario

async function iniciarOrdenes() {
  await cargarAlmacenesEnMapa();
  await cargarSelectsDelFormulario();
  await cargarOrdenes();

  document.getElementById("filtro-tipo").addEventListener("change", renderizarOrdenes);
  document.getElementById("filtro-estado-orden").addEventListener("change", renderizarOrdenes);

  document.getElementById("btn-nueva-orden").addEventListener("click", abrirModalOrden);
  document.getElementById("btn-cancelar-orden").addEventListener("click", () => {
    document.getElementById("modal-orden").close();
  });
  document.getElementById("form-tipo").addEventListener("change", alternarCamposPorTipo);
  document.getElementById("btn-agregar-item").addEventListener("click", () => agregarFilaItem());
  document.getElementById("form-orden").addEventListener("submit", crearOrden);
}

// ---------- Carga inicial ----------

async function cargarAlmacenesEnMapa() {
  const { data, error } = await supabaseClient.from("warehouses").select("id, name");
  if (error) return console.error(error);
  for (const w of data) MAPA_ALMACENES.set(w.id, w.name);
}

async function cargarOrdenes() {
  const { data: ordenes, error } = await supabaseClient
    .from("orders")
    .select("id, type, status, created_at, supplier_id, customer_id, origin_warehouse_id, destination_warehouse_id, suppliers(name), customers(name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando órdenes:", error);
    return;
  }

  const { data: itemsPorOrden, error: errorItems } = await supabaseClient
    .from("order_items")
    .select("order_id, quantity, items(name, sku)");

  if (errorItems) {
    console.error("Error cargando order_items:", errorItems);
    return;
  }

  // Agrupamos los items por orden en un Map: order_id -> [ {name, sku, quantity}, ... ]
  const itemsAgrupados = new Map();
  for (const fila of itemsPorOrden) {
    const lista = itemsAgrupados.get(fila.order_id) || [];
    lista.push({ name: fila.items.name, sku: fila.items.sku, quantity: fila.quantity });
    itemsAgrupados.set(fila.order_id, lista);
  }

  TODAS_LAS_ORDENES = ordenes.map((o) => ({
    ...o,
    items: itemsAgrupados.get(o.id) || [],
  }));

  renderizarOrdenes();
}

// ---------- Filtros + render ----------

function renderizarOrdenes() {
  const tipo = document.getElementById("filtro-tipo").value;
  const estado = document.getElementById("filtro-estado-orden").value;

  const filtradas = TODAS_LAS_ORDENES.filter((o) => {
    return (!tipo || o.type === tipo) && (!estado || o.status === estado);
  });

  const tbody = document.getElementById("tabla-ordenes");

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">No hay órdenes que coincidan con estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas
    .map((orden) => {
      const fecha = new Date(orden.created_at).toLocaleDateString("es-PE");

      let contraparte;
      let almacenTexto;
      if (orden.type === "INBOUND") {
        contraparte = orden.suppliers?.name || "-";
        almacenTexto = MAPA_ALMACENES.get(orden.destination_warehouse_id) || "-";
      } else if (orden.type === "OUTBOUND") {
        contraparte = orden.customers?.name || "-";
        almacenTexto = MAPA_ALMACENES.get(orden.origin_warehouse_id) || "-";
      } else {
        // TRANSFER: no tiene proveedor ni cliente, tiene origen Y destino
        contraparte = "Transferencia interna";
        const origenNombre = MAPA_ALMACENES.get(orden.origin_warehouse_id) || "-";
        const destinoNombre = MAPA_ALMACENES.get(orden.destination_warehouse_id) || "-";
        almacenTexto = `${origenNombre} → ${destinoNombre}`;
      }

      const resumenItems = orden.items
        .map((i) => `${i.sku} x${i.quantity}`)
        .join(", ");

      const badgeClase = orden.status === "PENDING" ? "badge-pending"
        : orden.status === "APPROVED" ? "badge-approved" : "badge-rejected";
      const badgeTexto = orden.status === "PENDING" ? "Pendiente"
        : orden.status === "APPROVED" ? "Aprobado" : "Rechazado";

      const acciones = orden.status === "PENDING"
        ? `
          <button class="btn-link" onclick="aprobarOrden('${orden.id}')">Aprobar</button>
          <button class="btn-link btn-danger" onclick="rechazarOrden('${orden.id}')">Rechazar</button>
        `
        : `<span class="texto-tenue">Sin acciones</span>`;

      return `
        <tr>
          <td>${fecha}</td>
          <td>${orden.type}</td>
          <td>${contraparte}</td>
          <td>${almacenTexto}</td>
          <td>${resumenItems}</td>
          <td><span class="badge ${badgeClase}">${badgeTexto}</span></td>
          <td>${acciones}</td>
        </tr>
      `;
    })
    .join("");
}

// ---------- Workflow: Aprobar / Rechazar ----------

async function aprobarOrden(ordenId) {
  const orden = TODAS_LAS_ORDENES.find((o) => o.id === ordenId);
  if (!orden) return;

  const confirmado = confirm(
    `¿Aprobar esta orden ${orden.type}? Esto va a actualizar el stock real del almacén.`
  );
  if (!confirmado) return;

  // Según el tipo, la orden puede tener almacén de origen (de donde sale
  // mercadería), de destino (a donde llega), o ambos si es TRANSFER.
  const almacenOrigenId =
    orden.type === "OUTBOUND" || orden.type === "TRANSFER" ? orden.origin_warehouse_id : null;
  const almacenDestinoId =
    orden.type === "INBOUND" || orden.type === "TRANSFER" ? orden.destination_warehouse_id : null;

  // Por cada artículo de la orden, ajustamos el stock
  for (const item of orden.items) {
    const { data: itemCompleto } = await supabaseClient
      .from("items")
      .select("id")
      .eq("sku", item.sku)
      .single();

    const itemId = itemCompleto.id;
    let posicionOrigenId = null;
    let posicionDestinoId = null;

    // --- Lado de origen: resta stock (aplica a OUTBOUND y TRANSFER) ---
    if (almacenOrigenId) {
      // Igual que antes: usamos una lista, no .single(), por si un artículo
      // llegara a tener stock repartido en más de una posición del almacén.
      const { data: filasOrigen, error: errorOrigen } = await supabaseClient
        .from("stock")
        .select("id, quantity, position_id")
        .eq("item_id", itemId)
        .eq("warehouse_id", almacenOrigenId)
        .limit(1);

      if (errorOrigen) {
        console.error("Error buscando stock de origen:", errorOrigen);
        continue;
      }

      const stockOrigen = filasOrigen && filasOrigen.length > 0 ? filasOrigen[0] : null;

      if (!stockOrigen || stockOrigen.quantity < item.quantity) {
        alert(
          `⚠️ Stock insuficiente para ${item.sku} en el almacén de origen. ` +
            `Disponible: ${stockOrigen?.quantity ?? 0}, solicitado: ${item.quantity}.`
        );
        continue; // saltamos este artículo (no restamos ni sumamos nada)
      }

      posicionOrigenId = stockOrigen.position_id;
      await supabaseClient
        .from("stock")
        .update({ quantity: stockOrigen.quantity - item.quantity })
        .eq("id", stockOrigen.id);
    }

    // --- Lado de destino: suma stock (aplica a INBOUND y TRANSFER) ---
    if (almacenDestinoId) {
      const { data: filasDestino, error: errorDestino } = await supabaseClient
        .from("stock")
        .select("id, quantity, position_id")
        .eq("item_id", itemId)
        .eq("warehouse_id", almacenDestinoId)
        .limit(1);

      if (errorDestino) {
        console.error("Error buscando stock de destino:", errorDestino);
        continue;
      }

      const stockDestino = filasDestino && filasDestino.length > 0 ? filasDestino[0] : null;

      // Si el artículo todavía no tiene una posición asignada en el almacén
      // de destino, le pedimos al trabajador dónde lo va a ubicar antes de
      // confirmar el stock.
      const necesitaPosicion = !stockDestino || !stockDestino.position_id;
      posicionDestinoId = necesitaPosicion
        ? await pedirYResolverPosicion(almacenDestinoId, item.sku)
        : stockDestino.position_id;

      if (stockDestino) {
        await supabaseClient
          .from("stock")
          .update({
            quantity: stockDestino.quantity + item.quantity,
            position_id: stockDestino.position_id || posicionDestinoId,
          })
          .eq("id", stockDestino.id);
      } else {
        await supabaseClient
          .from("stock")
          .insert({
            item_id: itemId,
            warehouse_id: almacenDestinoId,
            quantity: item.quantity,
            position_id: posicionDestinoId,
          });
      }
    }

    // Reflejamos las posiciones usadas en el movimiento correspondiente
    // (from_position_id solo si hubo origen, to_position_id solo si hubo
    // destino), para que la columna "De → A" de Movimientos sea exacta.
    const camposPosicion = {};
    if (almacenOrigenId) camposPosicion.from_position_id = posicionOrigenId;
    if (almacenDestinoId) camposPosicion.to_position_id = posicionDestinoId;

    await supabaseClient
      .from("movements")
      .update(camposPosicion)
      .eq("order_id", ordenId)
      .eq("item_id", itemId);
  }

  // Actualizamos el estado de la orden y de sus movimientos asociados
  await supabaseClient
    .from("orders")
    .update({ status: "APPROVED", approved_at: new Date().toISOString() })
    .eq("id", ordenId);

  await supabaseClient
    .from("movements")
    .update({ status: "APPROVED", executed_at: new Date().toISOString() })
    .eq("order_id", ordenId);

  await cargarOrdenes();
}
window.aprobarOrden = aprobarOrden;

// Pide al usuario el código de rack y posición donde va a ubicar el
// artículo, mostrándole primero qué racks y posiciones YA EXISTEN en ese
// almacén (para que no elija a ciegas), y crea las filas nuevas en
// "racks"/"positions" si hace falta. Devuelve el id de la posición, o
// null si el usuario cancela (el stock se guarda igual, sin posición).
async function pedirYResolverPosicion(almacenId, sku) {
  // 1. Mostramos qué racks ya existen en este almacén
  const { data: racksExistentes } = await supabaseClient
    .from("racks")
    .select("id, code")
    .eq("warehouse_id", almacenId)
    .order("code");

  const listaRacks = racksExistentes && racksExistentes.length > 0
    ? racksExistentes.map((r) => r.code).join(", ")
    : "(este almacén todavía no tiene ningún rack)";

  const rackCode = prompt(
    `Artículo ${sku}\n\n` +
      `Racks que ya existen en este almacén: ${listaRacks}\n\n` +
      `¿En qué RACK lo vas a ubicar? (escribe uno de los de arriba, o uno ` +
      `nuevo si necesitas crearlo, ej: RACK-03)`
  );
  if (!rackCode) return null;

  // Buscamos si ese rack ya existía (de la lista de arriba, o algo distinto
  // que el usuario haya escrito)
  const rackYaExistia = racksExistentes?.find((r) => r.code === rackCode);
  let rackId = rackYaExistia?.id;

  // 2. Si el rack ya existe, mostramos qué posiciones ya están ocupadas ahí
  let mensajePosiciones = "Este rack es nuevo, todavía no tiene posiciones registradas.";
  if (rackId) {
    const { data: posicionesDelRack } = await supabaseClient
      .from("positions")
      .select("code")
      .eq("rack_id", rackId)
      .order("code");

    mensajePosiciones = posicionesDelRack && posicionesDelRack.length > 0
      ? `Posiciones que ya están en uso en ${rackCode}: ${posicionesDelRack.map((p) => p.code).join(", ")}`
      : `${rackCode} existe pero todavía no tiene posiciones registradas.`;
  }

  const positionCode = prompt(
    `${mensajePosiciones}\n\n` +
      `¿En qué POSICIÓN dentro de ${rackCode} lo vas a ubicar? ` +
      `(evita repetir una que ya esté en uso, ej: A-03-05)`
  );
  if (!positionCode) return null;

  // 3. Creamos el rack si no existía
  if (!rackId) {
    const { data: rackNuevo, error: errorRack } = await supabaseClient
      .from("racks")
      .insert({ warehouse_id: almacenId, code: rackCode })
      .select()
      .single();
    if (errorRack) {
      alert("No se pudo crear el rack: " + errorRack.message);
      return null;
    }
    rackId = rackNuevo.id;
  }

  // 4. Buscamos si la posición ya existe en ese rack; si no, la creamos
  const { data: posicionExistente } = await supabaseClient
    .from("positions")
    .select("id")
    .eq("rack_id", rackId)
    .eq("code", positionCode)
    .maybeSingle();

  if (posicionExistente) {
    const confirmarReutilizar = confirm(
      `La posición ${positionCode} ya está en uso. ¿Quieres reutilizarla de todas formas? ` +
        `(esto puede mezclar dos artículos en el mismo espacio físico)`
    );
    if (!confirmarReutilizar) return null;
    return posicionExistente.id;
  }

  const { data: posicionNueva, error: errorPosicion } = await supabaseClient
    .from("positions")
    .insert({ rack_id: rackId, code: positionCode })
    .select()
    .single();

  if (errorPosicion) {
    alert("No se pudo crear la posición: " + errorPosicion.message);
    return null;
  }

  return posicionNueva.id;
}

async function rechazarOrden(ordenId) {
  const confirmado = confirm("¿Rechazar esta orden? El stock no se modifica.");
  if (!confirmado) return;

  await supabaseClient.from("orders").update({ status: "REJECTED" }).eq("id", ordenId);
  await supabaseClient.from("movements").update({ status: "REJECTED" }).eq("order_id", ordenId);

  await cargarOrdenes();
}
window.rechazarOrden = rechazarOrden;

// ---------- Modal: nueva orden ----------

async function cargarSelectsDelFormulario() {
  const { data: proveedores } = await supabaseClient.from("suppliers").select("id, name");
  const selectProveedor = document.getElementById("form-proveedor");
  selectProveedor.innerHTML = proveedores
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join("");

  const { data: clientes } = await supabaseClient.from("customers").select("id, name");
  const selectCliente = document.getElementById("form-cliente");
  selectCliente.innerHTML = clientes
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  const { data: almacenes } = await supabaseClient.from("warehouses").select("id, name");
  const opcionesAlmacen = almacenes.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
  document.getElementById("form-almacen-origen").innerHTML = opcionesAlmacen;
  document.getElementById("form-almacen-destino").innerHTML = opcionesAlmacen;

  const { data: trabajadores } = await supabaseClient.from("workers").select("id, name");
  const selectWorker = document.getElementById("form-worker");
  selectWorker.innerHTML = trabajadores
    .map((t) => `<option value="${t.id}">${t.name}</option>`)
    .join("");
}

// Muestra/oculta los campos del formulario según el tipo de orden elegido:
// INBOUND necesita proveedor + almacén destino.
// OUTBOUND necesita cliente + almacén origen.
// TRANSFER necesita almacén origen Y destino, sin proveedor ni cliente.
function alternarCamposPorTipo() {
  const tipo = document.getElementById("form-tipo").value;

  document.getElementById("label-proveedor").style.display = tipo === "INBOUND" ? "flex" : "none";
  document.getElementById("label-cliente").style.display = tipo === "OUTBOUND" ? "flex" : "none";
  document.getElementById("label-almacen-origen").style.display =
    tipo === "OUTBOUND" || tipo === "TRANSFER" ? "flex" : "none";
  document.getElementById("label-almacen-destino").style.display =
    tipo === "INBOUND" || tipo === "TRANSFER" ? "flex" : "none";
}

function abrirModalOrden() {
  document.getElementById("form-orden").reset();
  document.getElementById("lista-items-orden").innerHTML = "";
  CONTADOR_ITEMS_FORM = 0;
  agregarFilaItem(); // arrancamos con una fila lista para llenar
  alternarCamposPorTipo();
  document.getElementById("modal-orden").showModal();
}

async function agregarFilaItem() {
  const { data: items } = await supabaseClient.from("items").select("id, sku, name").order("sku");

  const idFila = `item-fila-${CONTADOR_ITEMS_FORM++}`;
  const opciones = items.map((i) => `<option value="${i.id}">${i.sku} - ${i.name}</option>`).join("");

  const filaHtml = `
    <div class="fila-item-orden" id="${idFila}">
      <select class="select-item-orden">${opciones}</select>
      <input type="number" class="input-cantidad-orden" placeholder="Cantidad" min="1" required />
      <button type="button" class="btn-link btn-danger" onclick="document.getElementById('${idFila}').remove()">✕</button>
    </div>
  `;
  document.getElementById("lista-items-orden").insertAdjacentHTML("beforeend", filaHtml);
}
window.agregarFilaItem = agregarFilaItem;

async function crearOrden(evento) {
  evento.preventDefault();

  const tipo = document.getElementById("form-tipo").value;
  const almacenOrigenId = document.getElementById("form-almacen-origen").value;
  const almacenDestinoId = document.getElementById("form-almacen-destino").value;

  const filas = document.querySelectorAll(".fila-item-orden");
  if (filas.length === 0) {
    alert("Agrega al menos un artículo a la orden.");
    return;
  }

  const itemsOrden = Array.from(filas).map((fila) => ({
    item_id: fila.querySelector(".select-item-orden").value,
    quantity: Number(fila.querySelector(".input-cantidad-orden").value),
  }));

  const datosOrden = {
    type: tipo,
    status: "PENDING",
    supplier_id: tipo === "INBOUND" ? document.getElementById("form-proveedor").value : null,
    customer_id: tipo === "OUTBOUND" ? document.getElementById("form-cliente").value : null,
    // INBOUND solo tiene destino; OUTBOUND solo tiene origen; TRANSFER tiene ambos.
    origin_warehouse_id: tipo === "OUTBOUND" || tipo === "TRANSFER" ? almacenOrigenId : null,
    destination_warehouse_id: tipo === "INBOUND" || tipo === "TRANSFER" ? almacenDestinoId : null,
    worker_id: document.getElementById("form-worker").value,
  };

  const { data: ordenCreada, error: errorOrden } = await supabaseClient
    .from("orders")
    .insert(datosOrden)
    .select()
    .single();

  if (errorOrden) {
    alert("Error al crear la orden: " + errorOrden.message);
    console.error(errorOrden);
    return;
  }

  // Insertamos el detalle (order_items)
  const detalle = itemsOrden.map((i) => ({
    order_id: ordenCreada.id,
    item_id: i.item_id,
    quantity: i.quantity,
  }));
  await supabaseClient.from("order_items").insert(detalle);

  // Mapeamos el tipo de orden al tipo de movimiento correspondiente
  const movementTypePorTipo = {
    INBOUND: "RECEPTION",
    OUTBOUND: "DISPATCH",
    TRANSFER: "INTERNAL_TRANSFER",
  };

  // Y el movimiento pendiente asociado (sin posición asignada todavía;
  // la posición se define al momento de aprobar, ver aprobarOrden())
  const workerId = document.getElementById("form-worker").value;
  const movimientos = itemsOrden.map((i) => ({
    item_id: i.item_id,
    order_id: ordenCreada.id,
    movement_type: movementTypePorTipo[tipo],
    quantity: i.quantity,
    status: "PENDING",
    worker_id: workerId,
  }));
  await supabaseClient.from("movements").insert(movimientos);

  document.getElementById("modal-orden").close();
  await cargarOrdenes();
}

iniciarOrdenes();