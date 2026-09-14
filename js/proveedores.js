// ============================================================
// proveedores.js
// CRUD simple: la tabla "suppliers" solo tiene name y contact,
// así que no hace falta ningún join ni cálculo, a diferencia de
// inventario.js. Este es el patrón más básico del proyecto.
// ============================================================

let TODOS_LOS_PROVEEDORES = [];

async function iniciar() {
  await cargarProveedores();

  document.getElementById("btn-nuevo").addEventListener("click", abrirModalNuevo);
  document.getElementById("btn-cancelar").addEventListener("click", () => {
    document.getElementById("modal-proveedor").close();
  });
  document.getElementById("form-proveedor").addEventListener("submit", guardar);
}

async function cargarProveedores() {
  const { data, error } = await supabaseClient
    .from("suppliers")
    .select("id, name, contact, created_at")
    .order("name");

  if (error) {
    console.error("Error cargando proveedores:", error);
    return;
  }

  TODOS_LOS_PROVEEDORES = data;
  renderizarTabla();
}

function renderizarTabla() {
  const tbody = document.getElementById("tabla-proveedores");

  if (TODOS_LOS_PROVEEDORES.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No hay proveedores registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = TODOS_LOS_PROVEEDORES
    .map((p) => {
      const fecha = new Date(p.created_at).toLocaleDateString("es-PE");
      return `
        <tr>
          <td>${p.name}</td>
          <td>${p.contact || "-"}</td>
          <td>${fecha}</td>
          <td>
            <button class="btn-link" onclick="abrirModalEditar('${p.id}')">Editar</button>
            <button class="btn-link btn-danger" onclick="eliminar('${p.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function abrirModalNuevo() {
  document.getElementById("modal-titulo").textContent = "Nuevo proveedor";
  document.getElementById("form-proveedor").reset();
  document.getElementById("form-id").value = "";
  document.getElementById("modal-proveedor").showModal();
}

function abrirModalEditar(id) {
  const p = TODOS_LOS_PROVEEDORES.find((x) => x.id === id);
  if (!p) return;

  document.getElementById("modal-titulo").textContent = "Editar proveedor";
  document.getElementById("form-id").value = p.id;
  document.getElementById("form-name").value = p.name;
  document.getElementById("form-contact").value = p.contact || "";
  document.getElementById("modal-proveedor").showModal();
}
window.abrirModalEditar = abrirModalEditar;

async function guardar(evento) {
  evento.preventDefault();

  const id = document.getElementById("form-id").value;
  const datos = {
    name: document.getElementById("form-name").value,
    contact: document.getElementById("form-contact").value || null,
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from("suppliers").update(datos).eq("id", id));
  } else {
    ({ error } = await supabaseClient.from("suppliers").insert(datos));
  }

  if (error) {
    alert("Error al guardar: " + error.message);
    console.error(error);
    return;
  }

  document.getElementById("modal-proveedor").close();
  await cargarProveedores();
}

async function eliminar(id) {
  const p = TODOS_LOS_PROVEEDORES.find((x) => x.id === id);
  if (!confirm(`¿Eliminar a "${p.name}"?`)) return;

  const { error } = await supabaseClient.from("suppliers").delete().eq("id", id);

  if (error) {
    alert("No se pudo eliminar: probablemente tiene órdenes asociadas.\n\n" + error.message);
    console.error(error);
    return;
  }

  await cargarProveedores();
}
window.eliminar = eliminar;

iniciar();