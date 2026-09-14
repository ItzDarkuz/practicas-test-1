// ============================================================
// trabajadores.js
// Mismo patrón que proveedores.js y clientes.js: CRUD simple
// sobre la tabla "workers" (name, role).
// ============================================================

let TODOS_LOS_TRABAJADORES = [];

async function iniciar() {
  await cargarTrabajadores();

  document.getElementById("btn-nuevo").addEventListener("click", abrirModalNuevo);
  document.getElementById("btn-cancelar").addEventListener("click", () => {
    document.getElementById("modal-trabajador").close();
  });
  document.getElementById("form-trabajador").addEventListener("submit", guardar);
}

async function cargarTrabajadores() {
  const { data, error } = await supabaseClient
    .from("workers")
    .select("id, name, role, created_at")
    .order("name");

  if (error) {
    console.error("Error cargando trabajadores:", error);
    return;
  }

  TODOS_LOS_TRABAJADORES = data;
  renderizarTabla();
}

function renderizarTabla() {
  const tbody = document.getElementById("tabla-trabajadores");

  if (TODOS_LOS_TRABAJADORES.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No hay trabajadores registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = TODOS_LOS_TRABAJADORES
    .map((t) => {
      const fecha = new Date(t.created_at).toLocaleDateString("es-PE");
      return `
        <tr>
          <td>${t.name}</td>
          <td>${t.role || "-"}</td>
          <td>${fecha}</td>
          <td>
            <button class="btn-link" onclick="abrirModalEditar('${t.id}')">Editar</button>
            <button class="btn-link btn-danger" onclick="eliminar('${t.id}')">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function abrirModalNuevo() {
  document.getElementById("modal-titulo").textContent = "Nuevo trabajador";
  document.getElementById("form-trabajador").reset();
  document.getElementById("form-id").value = "";
  document.getElementById("modal-trabajador").showModal();
}

function abrirModalEditar(id) {
  const t = TODOS_LOS_TRABAJADORES.find((x) => x.id === id);
  if (!t) return;

  document.getElementById("modal-titulo").textContent = "Editar trabajador";
  document.getElementById("form-id").value = t.id;
  document.getElementById("form-name").value = t.name;
  document.getElementById("form-role").value = t.role || "";
  document.getElementById("modal-trabajador").showModal();
}
window.abrirModalEditar = abrirModalEditar;

async function guardar(evento) {
  evento.preventDefault();

  const id = document.getElementById("form-id").value;
  const datos = {
    name: document.getElementById("form-name").value,
    role: document.getElementById("form-role").value || null,
  };

  let error;
  if (id) {
    ({ error } = await supabaseClient.from("workers").update(datos).eq("id", id));
  } else {
    ({ error } = await supabaseClient.from("workers").insert(datos));
  }

  if (error) {
    alert("Error al guardar: " + error.message);
    console.error(error);
    return;
  }

  document.getElementById("modal-trabajador").close();
  await cargarTrabajadores();
}

async function eliminar(id) {
  const t = TODOS_LOS_TRABAJADORES.find((x) => x.id === id);
  if (!confirm(`¿Eliminar a "${t.name}"?`)) return;

  const { error } = await supabaseClient.from("workers").delete().eq("id", id);

  if (error) {
    alert("No se pudo eliminar: probablemente tiene órdenes o movimientos asociados.\n\n" + error.message);
    console.error(error);
    return;
  }

  await cargarTrabajadores();
}
window.eliminar = eliminar;

iniciar();