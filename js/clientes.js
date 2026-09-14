// ============================================================
// clientes.js
// Mismo patrón que proveedores.js, con un campo extra: "type"
// (B2C/B2B), que también se usa en Órdenes para elegir el
// destino de una salida OUTBOUND.
// ============================================================

let TODOS_LOS_CLIENTES = [];

async function iniciar() {
  await cargarClientes();

  document.getElementById("btn-nuevo").addEventListener("click", abrirModalNuevo);
  document.getElementById("btn-cancelar").addEventListener("click", () => {
    document.getElementById("modal-cliente").close();
  });
  document.getElementById("form-cliente").addEventListener("submit", guardar);
}

async function cargarClientes() {
  const { data, error } = await supabaseClient
    .from("customers")
    .select("id, name, type, contact, created_at")
    .order("name");

  if (error) {
    console.error("Error cargando clientes:", error);
    return;
  }

  TODOS_LOS_CLIENTES = data;
  renderizarTabla();
}

function renderizarTabla() {
  const tbody = document.getElementById("tabla-clientes");

  if (TODOS_LOS_CLIENTES.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No hay clientes registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = TODOS_LOS_CLIENTES
    .map((c) => {
      const fecha = new Date(c.created_at).toLocaleDateString("es-PE");
      return `
        <tr>
          <td>${c.name}</td>
          <td>${c.type || "-"}</td>
          <td>${c.contact || "-"}</td>
          <td>${fecha}</td>
          <td>
            <button class="btn-link" onclick="abrirModalEditar('${c.id}')">Editar</button>
            <button class="btn-link btn-danger" onclick="eliminar('${c.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function abrirModalNuevo() {
  document.getElementById("modal-titulo").textContent = "Nuevo cliente";
  document.getElementById("form-cliente").reset();
  document.getElementById("form-id").value = "";
  document.getElementById("modal-cliente").showModal();
}

function abrirModalEditar(id) {
  const c = TODOS_LOS_CLIENTES.find((x) => x.id === id);
  if (!c) return;

  document.getElementById("modal-titulo").textContent = "Editar cliente";
  document.getElementById("form-id").value = c.id;
  document.getElementById("form-name").value = c.name;
  document.getElementById("form-type").value = c.type || "B2C";
  document.getElementById("form-contact").value = c.contact || "";
  document.getElementById("modal-cliente").showModal();
}
window.abrirModalEditar = abrirModalEditar;

async function guardar(evento) {
  evento.preventDefault();

  const id = document.getElementById("form-id").value;
  const datos = {
    name: document.getElementById("form-name").value,
    type: document.getElementById("form-type").value,
    contact: document.getElementById("form-contact").value || null,
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from("customers").update(datos).eq("id", id));
  } else {
    ({ error } = await supabaseClient.from("customers").insert(datos));
  }

  if (error) {
    alert("Error al guardar: " + error.message);
    console.error(error);
    return;
  }

  document.getElementById("modal-cliente").close();
  await cargarClientes();
}

async function eliminar(id) {
  const c = TODOS_LOS_CLIENTES.find((x) => x.id === id);
  if (!confirm(`¿Eliminar a "${c.name}"?`)) return;

  const { error } = await supabaseClient.from("customers").delete().eq("id", id);

  if (error) {
    alert("No se pudo eliminar: probablemente tiene órdenes asociadas.\n\n" + error.message);
    console.error(error);
    return;
  }

  await cargarClientes();
}
window.eliminar = eliminar;

iniciar();