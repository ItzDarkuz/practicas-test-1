// ============================================================
// almacen.js
// Dibuja el mapa visual del almacén seleccionado: sus racks, y
// dentro de cada rack, sus posiciones. Cada posición se pinta
// como "ocupada" (con el artículo que tiene asignado) o "libre"
// (sin ninguna fila en stock que la referencie).
//
// Nota importante de alcance: este mapa solo puede dibujar las
// posiciones que YA EXISTEN como filas en la tabla "positions".
// En este proyecto, esas posiciones se crearon a partir de la
// data de ejemplo del CSV (20 posiciones en total). No estamos
// generando un grid teórico completo de "todas las posiciones
// posibles" del almacén (eso requeriría definir de antemano
// cuántos racks y posiciones tiene físicamente cada almacén,
// algo que el caso no especifica). Por eso, en este demo, no vas
// a ver posiciones "libres" — todas las que existen tienen stock.
// Si se agregan posiciones nuevas sin stock asignado, sí se
// verían aquí como libres automáticamente.
// ============================================================

async function iniciarAlmacen() {
  await cargarSelectorAlmacenes();

  document.getElementById("selector-almacen").addEventListener("change", (e) => {
    const warehouseId = e.target.value;
    if (warehouseId) {
      dibujarMapaAlmacen(warehouseId);
    } else {
      document.getElementById("contenedor-racks").innerHTML =
        `<p class="mensaje-vacio">Selecciona un almacén para ver su mapa de racks y posiciones.</p>`;
    }
  });

  document.getElementById("btn-cerrar-detalle").addEventListener("click", () => {
    document.getElementById("modal-posicion").close();
  });
}

async function cargarSelectorAlmacenes() {
  const { data: warehouses, error } = await supabaseClient
    .from("warehouses")
    .select("id, name, type")
    .order("type", { ascending: false }); // CENTRAL primero, alfabético con STORE después

  if (error) {
    console.error("Error cargando almacenes:", error);
    return;
  }

  const select = document.getElementById("selector-almacen");
  for (const w of warehouses) {
    const option = document.createElement("option");
    option.value = w.id;
    option.textContent = `${w.name} (${w.type === "CENTRAL" ? "Central" : "Tienda"})`;
    select.appendChild(option);
  }

  // Seleccionamos el primero automáticamente para no dejar la página vacía
  if (warehouses.length > 0) {
    select.value = warehouses[0].id;
    dibujarMapaAlmacen(warehouses[0].id);
  }
}

async function dibujarMapaAlmacen(warehouseId) {
  const contenedor = document.getElementById("contenedor-racks");
  contenedor.innerHTML = `<p class="mensaje-vacio">Cargando mapa...</p>`;

  // 1. Racks de este almacén
  const { data: racks, error: errorRacks } = await supabaseClient
    .from("racks")
    .select("id, code")
    .eq("warehouse_id", warehouseId)
    .order("code");

  if (errorRacks) {
    console.error("Error cargando racks:", errorRacks);
    return;
  }

  if (racks.length === 0) {
    contenedor.innerHTML = `<p class="mensaje-vacio">Este almacén todavía no tiene racks registrados.</p>`;
    return;
  }

  const rackIds = racks.map((r) => r.id);

  // 2. Posiciones de esos racks
  const { data: positions, error: errorPositions } = await supabaseClient
    .from("positions")
    .select("id, code, rack_id")
    .in("rack_id", rackIds)
    .order("code");

  if (errorPositions) {
    console.error("Error cargando posiciones:", errorPositions);
    return;
  }

  // 3. Stock de este almacén, con el artículo embebido (para saber
  //    qué hay en cada posición ocupada)
  const { data: stockRows, error: errorStock } = await supabaseClient
    .from("stock")
    .select("position_id, quantity, items(sku, name)")
    .eq("warehouse_id", warehouseId);

  if (errorStock) {
    console.error("Error cargando stock del almacén:", errorStock);
    return;
  }

  // Mapa rápido: position_id -> info de stock (si existe)
  const stockPorPosicion = new Map();
  for (const fila of stockRows) {
    stockPorPosicion.set(fila.position_id, fila);
  }

  // 4. Pintamos un bloque por cada rack, con sus posiciones adentro
  contenedor.innerHTML = racks
    .map((rack) => {
      const posicionesDelRack = positions.filter((p) => p.rack_id === rack.id);

      const cajasHtml = posicionesDelRack
        .map((pos) => {
          const stockInfo = stockPorPosicion.get(pos.id);
          const ocupada = !!stockInfo;

          if (ocupada) {
            return `
              <div class="caja-posicion caja-ocupada" onclick="mostrarDetallePosicion('${pos.code}', '${stockInfo.items.name}', '${stockInfo.items.sku}', ${stockInfo.quantity})">
                <span class="caja-codigo">${pos.code}</span>
                <span class="caja-info">${stockInfo.items.sku}</span>
              </div>
            `;
          }

          return `
            <div class="caja-posicion caja-libre">
              <span class="caja-codigo">${pos.code}</span>
              <span class="caja-info">Libre</span>
            </div>
          `;
        })
        .join("");

      return `
        <div class="rack-card">
          <h3>${rack.code}</h3>
          <div class="rack-grid">${cajasHtml}</div>
        </div>
      `;
    })
    .join("");
}

function mostrarDetallePosicion(codigoPosicion, nombreArticulo, sku, cantidad) {
  document.getElementById("detalle-posicion-titulo").textContent = `Posición ${codigoPosicion}`;
  document.getElementById("detalle-posicion-contenido").innerHTML = `
    <p><strong>Artículo:</strong> ${nombreArticulo}</p>
    <p><strong>SKU:</strong> ${sku}</p>
    <p><strong>Cantidad:</strong> ${cantidad} unidades</p>
  `;
  document.getElementById("modal-posicion").showModal();
}
window.mostrarDetallePosicion = mostrarDetallePosicion;

iniciarAlmacen();