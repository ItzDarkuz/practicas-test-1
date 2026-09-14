-- ============================================================
-- schema.sql
-- Esquema completo de la base de datos del proyecto (Supabase / PostgreSQL).
-- Reconstruido a partir del historial real de comandos ejecutados durante
-- el desarrollo, en el orden correcto de dependencias.
--
-- Se incluye aquí, además del proyecto ya desplegado, para que cualquier
-- persona pueda revisar las 12 tablas, sus columnas y relaciones sin
-- necesitar acceso al dashboard de Supabase.
-- ============================================================

-- ---------- Tablas sin dependencias ----------

create table categories (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  line text not null,
  category_type text,
  created_at timestamptz default now()
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('CENTRAL', 'STORE')),
  location text,
  created_at timestamptz default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('B2C', 'B2B')),
  contact text,
  created_at timestamptz default now()
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  created_at timestamptz default now()
);

-- ---------- Tablas con una dependencia ----------

create table racks (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id),
  code text not null,
  created_at timestamptz default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  sku text not null unique,
  name text not null,
  size int,
  price numeric,
  cost numeric,
  min_stock int default 0,
  max_stock int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Mapa físico del almacén y stock ----------

create table positions (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references racks(id),
  code text not null,
  created_at timestamptz default now()
);

create table stock (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  warehouse_id uuid not null references warehouses(id),
  position_id uuid references positions(id),
  quantity int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (item_id, warehouse_id, position_id)
);

-- ---------- Flujo de negocio: órdenes y movimientos ----------

create table orders (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('INBOUND', 'OUTBOUND', 'TRANSFER')),
  status text not null default 'PENDING'
    check (status in ('ANNOUNCED', 'PENDING', 'APPROVED', 'PREPARED', 'DISPATCHED', 'COMPLETED', 'REJECTED')),
  supplier_id uuid references suppliers(id),
  customer_id uuid references customers(id),
  origin_warehouse_id uuid references warehouses(id),
  destination_warehouse_id uuid references warehouses(id),
  worker_id uuid references workers(id),
  created_at timestamptz default now(),
  approved_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  item_id uuid not null references items(id),
  quantity int not null
);

create table movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  order_id uuid references orders(id),
  from_position_id uuid references positions(id),
  to_position_id uuid references positions(id),
  movement_type text not null
    check (movement_type in ('RECEPTION', 'INTERNAL_TRANSFER', 'PICKING', 'DISPATCH', 'RETURN')),
  quantity int not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
  worker_id uuid references workers(id),
  created_at timestamptz default now(),
  executed_at timestamptz
);

-- ---------- Trigger: actualización automática de updated_at ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_items_updated_at
before update on items
for each row execute function set_updated_at();

create trigger trg_stock_updated_at
before update on stock
for each row execute function set_updated_at();
