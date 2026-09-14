// ============================================================
// index.js
// Lógica del Dashboard: calcula los KPIs principales y muestra
// los movimientos más recientes + artículos bajo stock mínimo.
//
// Nota de diseño: como no usamos framework, todo el cálculo de
// KPIs se hace aquí en JavaScript, combinando datos de varias
// tablas (items + stock + movements). En un proyecto más grande
// esto normalmente se resolvería con una "vista" (VIEW) o una
// función en la base de datos, pero para este tamaño de proyecto
// hacerlo en el frontend es más simple de entender y mantener.
// ============================================================

async function cargarDashboard() {
    await Promise.all([
        cargarKpis(),
        cargarMovimientosRecientes(),
    ]);
}

async function cargarKpis() {
    // 1. Traemos todos los articulos con su precio y stock minimo
    const {data: items, error: errorItems } = await supabaseClient
        .from("items")
        .select("id, price, min_stock");

    if (errorItems) {
        console.error("Error cargando items:", errorItems);
        return;
    }

    // 2. Traemos todo el stock (puede haber varias filas por artículo,
  //    una por cada almacén donde tiene inventario)
  const { data: stockRows, error: errorStock } = await supabaseClient
    .from("stock")
    .select("item_id, quantity");
 
  if (errorStock) {
    console.error("Error cargando stock:", errorStock);
    return;
  }
 
  // 3. Sumamos el stock de cada artículo entre TODOS sus almacenes.
  //    Usamos un Map: item_id -> cantidad total.
  const stockPorItem = new Map();
  for (const fila of stockRows) {
    const acumulado = stockPorItem.get(fila.item_id) || 0;
    stockPorItem.set(fila.item_id, acumulado + fila.quantity);
  }
 
  // 4. Calculamos los 4 KPIs recorriendo la lista de artículos una vez
  let stockTotal = 0;
  let valorTotal = 0;
  let articulosBajoMinimo = 0;
 
  for (const item of items) {
    const stockDelItem = stockPorItem.get(item.id) || 0;
    stockTotal += stockDelItem;
    valorTotal += stockDelItem * (item.price || 0);
    if (stockDelItem < item.min_stock) {
      articulosBajoMinimo++;
    }
  }
 
  document.getElementById("kpi-total-articulos").textContent = items.length;
  document.getElementById("kpi-stock-total").textContent = stockTotal;
  document.getElementById("kpi-bajo-minimo").textContent = articulosBajoMinimo;
  document.getElementById("kpi-valor-total").textContent =
    "S/ " + valorTotal.toLocaleString("es-PE", { minimumFractionDigits: 2 });
 
  // 5. Además, mostramos el detalle de qué artículos están bajo el mínimo
  await cargarTablaBajoMinimo(items, stockPorItem);
}
 
async function cargarTablaBajoMinimo(items, stockPorItem) {
  const tbody = document.getElementById("tabla-bajo-minimo");
 
  const itemsBajoMinimo = items.filter((item) => {
    const stockDelItem = stockPorItem.get(item.id) || 0;
    return stockDelItem < item.min_stock;
  });
 
  if (itemsBajoMinimo.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Ningún artículo está bajo el mínimo. ✅</td></tr>`;
    return;
  }
 
  // Necesitamos sku/nombre, que no pedimos en la consulta de KPIs.
  // Pedimos esos datos completos solo para los artículos en alerta.
  const idsBajoMinimo = itemsBajoMinimo.map((i) => i.id);
  const { data: detalles, error } = await supabaseClient
    .from("items")
    .select("id, sku, name")
    .in("id", idsBajoMinimo);
 
  if (error) {
    console.error("Error cargando detalle de items bajo mínimo:", error);
    return;
  }
 
  tbody.innerHTML = itemsBajoMinimo
    .map((item) => {
      const detalle = detalles.find((d) => d.id === item.id);
      const stockDelItem = stockPorItem.get(item.id) || 0;
      return `
        <tr>
          <td>${detalle.sku}</td>
          <td>${detalle.name}</td>
          <td>${stockDelItem}</td>
          <td>${item.min_stock}</td>
        </tr>
      `;
    })
    .join("");
}
 
async function cargarMovimientosRecientes() {
  const tbody = document.getElementById("tabla-movimientos-recientes");
 
  // Embedding: gracias a la llave foránea movements.item_id -> items.id,
  // Supabase nos deja pedir "items(name, sku)" directamente en el mismo
  // select, sin tener que hacer una segunda consulta aparte.
  const { data, error } = await supabaseClient
    .from("movements")
    .select("id, movement_type, quantity, status, created_at, items(name, sku)")
    .order("created_at", { ascending: false })
    .limit(5);
 
  if (error) {
    console.error("Error cargando movimientos recientes:", error);
    tbody.innerHTML = `<tr><td colspan="6">Error al cargar movimientos.</td></tr>`;
    return;
  }
 
  tbody.innerHTML = data
    .map((mov) => {
      const fecha = new Date(mov.created_at).toLocaleDateString("es-PE");
      return `
        <tr>
          <td>${fecha}</td>
          <td>${mov.items.name}</td>
          <td>${mov.items.sku}</td>
          <td>${mov.movement_type}</td>
          <td>${mov.quantity}</td>
          <td><span class="badge badge-${mov.status.toLowerCase()}">${mov.status}</span></td>
        </tr>
      `;
    })
    .join("");
}
 
cargarDashboard();
