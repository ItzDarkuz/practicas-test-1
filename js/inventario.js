// ============================================================
// inventario.js
// Carga la tabla de inventario, aplica filtros/búsqueda en el
// cliente, y maneja el modal de crear/editar artículo.
//
// Nota de diseño: los filtros (búsqueda, categoría, estado de
// stock) se aplican en JavaScript sobre los datos ya cargados,
// no con una consulta nueva a Supabase cada vez. Para 20-100
// artículos esto es más rápido y simple; si el catálogo creciera
// a miles de artículos, convendría mover los filtros a la
// consulta SQL (where + ilike) en vez de filtrar en el navegador.
// ============================================================

let TODOS_LOS_ITEMS = []; // cache en memoria de la última carga

async function iniciarInventario() {
  await cargarCategoriasEnFiltro();
  await cargarCategoriasEnFormulario();
  await cargarInventario();

  // Listeners de los filtros: cada vez que cambian, re-dibujamos
  // la tabla a partir de TODOS_LOS_ITEMS (sin volver a consultar Supabase)
  document.getElementById("filtro-busqueda").addEventListener("input", renderizarTabla);
  document.getElementById("filtro-categoria").addEventListener("change", renderizarTabla);
  document.getElementById("filtro-estado-stock").addEventListener("change", renderizarTabla);

  document.getElementById("btn-nuevo-articulo").addEventListener("click", abrirModalNuevo);
  document.getElementById("btn-cancelar").addEventListener("click", () => {
    document.getElementById("modal-articulo").close();
  });
  document.getElementById("form-articulo").addEventListener("submit", guardarArticulo);
}

// ---------- Carga de datos ----------

async function cargarInventario() {
  // Traemos items + su categoría embebida (gracias a la FK category_id)
  const { data: items, error: errorItems } = await supabaseClient
    .from("items")
    .select("id, sku, name, size, price, cost, min_stock, max_stock, category_id, categories(brand, line, category_type)");

  if (errorItems) {
    console.error("Error cargando items:", errorItems);
    return;
  }

  // Stock total por artículo (mismo patrón que en el Dashboard)
  const { data: stockRows, error: errorStock } = await supabaseClient
    .from("stock")
    .select("item_id, quantity");

  if (errorStock) {
    console.error("Error cargando stock:", errorStock);
    return;
  }

  const stockPorItem = new Map();
  for (const fila of stockRows) {
    const acumulado = stockPorItem.get(fila.item_id) || 0;
    stockPorItem.set(fila.item_id, acumulado + fila.quantity);
  }

  // Combinamos todo en un solo arreglo que usamos para pintar la tabla
  TODOS_LOS_ITEMS = items.map((item) => ({
    ...item,
    stock_total: stockPorItem.get(item.id) || 0,
  }));

  renderizarTabla();
}

async function cargarCategoriasEnFiltro() {
  const { data: categorias, error } = await supabaseClient
    .from("categories")
    .select("id, brand, line");

  if (error) {
    console.error("Error cargando categorías:", error);
    return;
  }

  const select = document.getElementById("filtro-categoria");
  for (const cat of categorias) {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = `${cat.brand} - ${cat.line}`;
    select.appendChild(option);
  }
}

async function cargarCategoriasEnFormulario() {
  const { data: categorias, error } = await supabaseClient
    .from("categories")
    .select("id, brand, line");

  if (error) {
    console.error("Error cargando categorías para el formulario:", error);
    return;
  }

  const select = document.getElementById("form-category");
  select.innerHTML = "";
  for (const cat of categorias) {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = `${cat.brand} - ${cat.line}`;
    select.appendChild(option);
  }
}

// ---------- Filtros + render ----------

function renderizarTabla() {
  const busqueda = document.getElementById("filtro-busqueda").value.toLowerCase().trim();
  const categoriaId = document.getElementById("filtro-categoria").value;
  const estadoStock = document.getElementById("filtro-estado-stock").value;

  const filtrados = TODOS_LOS_ITEMS.filter((item) => {
    const coincideBusqueda =
      !busqueda ||
      item.name.toLowerCase().includes(busqueda) ||
      item.sku.toLowerCase().includes(busqueda);

    const coincideCategoria = !categoriaId || item.category_id === categoriaId;

    const bajoMinimo = item.stock_total < item.min_stock;
    const coincideEstado =
      !estadoStock ||
      (estadoStock === "bajo" && bajoMinimo) ||
      (estadoStock === "normal" && !bajoMinimo);

    return coincideBusqueda && coincideCategoria && coincideEstado;
  });

  const tbody = document.getElementById("tabla-inventario");

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10">No hay artículos que coincidan con estos filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados
    .map((item) => {
      const bajoMinimo = item.stock_total < item.min_stock;
      const estadoBadge = bajoMinimo
        ? `<span class="badge badge-rejected">Bajo mínimo</span>`
        : `<span class="badge badge-approved">Normal</span>`;

      return `
        <tr>
          <td>${item.sku}</td>
          <td>${item.name}</td>
          <td>${item.categories.brand}</td>
          <td>${item.categories.line} (${item.categories.category_type})</td>
          <td>${item.size ?? "-"}</td>
          <td>${item.stock_total}</td>
          <td>S/ ${Number(item.cost ?? 0).toFixed(2)}</td>
          <td>S/ ${Number(item.price ?? 0).toFixed(2)}</td>
          <td>${estadoBadge}</td>
          <td>
            <button class="btn-link" onclick="abrirModalEditar('${item.id}')">Editar</button>
            <button class="btn-link btn-danger" onclick="eliminarArticulo('${item.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// ---------- Modal: crear / editar ----------

function abrirModalNuevo() {
  document.getElementById("modal-titulo").textContent = "Nuevo artículo";
  document.getElementById("form-articulo").reset();
  document.getElementById("form-id").value = "";
  document.getElementById("modal-articulo").showModal();
}

function abrirModalEditar(itemId) {
  const item = TODOS_LOS_ITEMS.find((i) => i.id === itemId);
  if (!item) return;

  document.getElementById("modal-titulo").textContent = "Editar artículo";
  document.getElementById("form-id").value = item.id;
  document.getElementById("form-sku").value = item.sku;
  document.getElementById("form-name").value = item.name;
  document.getElementById("form-category").value = item.category_id;
  document.getElementById("form-size").value = item.size ?? "";
  document.getElementById("form-price").value = item.price ?? "";
  document.getElementById("form-cost").value = item.cost ?? "";
  document.getElementById("form-min-stock").value = item.min_stock ?? "";
  document.getElementById("form-max-stock").value = item.max_stock ?? "";

  document.getElementById("modal-articulo").showModal();
}
// La hacemos visible globalmente porque se llama desde el atributo
// onclick="" generado dinámicamente en renderizarTabla()
window.abrirModalEditar = abrirModalEditar;

async function guardarArticulo(evento) {
  evento.preventDefault();

  const id = document.getElementById("form-id").value;
  const datos = {
    sku: document.getElementById("form-sku").value,
    name: document.getElementById("form-name").value,
    category_id: document.getElementById("form-category").value,
    size: Number(document.getElementById("form-size").value) || null,
    price: Number(document.getElementById("form-price").value) || null,
    cost: Number(document.getElementById("form-cost").value) || null,
    min_stock: Number(document.getElementById("form-min-stock").value) || 0,
    max_stock: Number(document.getElementById("form-max-stock").value) || null,
  };

  let error;
  if (id) {
    // Editar artículo existente
    ({ error } = await supabaseClient.from("items").update(datos).eq("id", id));
  } else {
    // Crear artículo nuevo
    ({ error } = await supabaseClient.from("items").insert(datos));
  }

  if (error) {
    alert("Error al guardar: " + error.message);
    console.error(error);
    return;
  }

  document.getElementById("modal-articulo").close();
  await cargarInventario(); // recargamos la tabla con el dato actualizado
}

async function eliminarArticulo(itemId) {
  const item = TODOS_LOS_ITEMS.find((i) => i.id === itemId);
  const confirmado = confirm(`¿Seguro que quieres eliminar "${item.name}" (${item.sku})?`);
  if (!confirmado) return;

  const { error } = await supabaseClient.from("items").delete().eq("id", itemId);

  if (error) {
    // Esto va a fallar si el artículo tiene stock, movimientos u órdenes
    // asociadas, porque las llaves foráneas lo protegen de un borrado
    // accidental que dejaría datos huérfanos.
    alert(
      "No se pudo eliminar: este artículo tiene movimientos o stock relacionado.\n\n" +
        "Detalle técnico: " + error.message
    );
    console.error(error);
    return;
  }

  await cargarInventario();
}
window.eliminarArticulo = eliminarArticulo;

iniciarInventario();