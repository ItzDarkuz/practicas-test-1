// ============================================================
// supabaseClient.js
// Conexión única a Supabase. Todas las demás páginas (inventario.js,
// almacen.js, ordenes.js, etc.) van a usar esta misma variable
// "supabaseClient" para hacer sus consultas.
//
// IMPORTANTE: reemplaza los dos valores de abajo con los tuyos,
// que encuentras en Supabase → Project Settings → API Keys.
// ============================================================
 
const SUPABASE_URL = "https://lqjzephujboqfbqexzdr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_P_c7ovDy6dcF7jAwzLg6Qw_DmxR0R_M";
 
// window.supabase viene del script de la CDN que cargamos en el <head> del HTML
// (ver index.html). createClient() arma el objeto que usaremos para
// leer, insertar, editar y borrar datos de cualquier tabla.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);