-- ============================================================
-- SEGUIMIENTO DE METAS EL PECHUGÓN — Supabase Schema
-- ============================================================

-- Habilitar extensión para UUID
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLA: roles (encargado | supervisor | gerente)
-- ============================================================
create table if not exists roles (
  id serial primary key,
  nombre text not null unique -- 'encargado' | 'supervisor' | 'gerente'
);

insert into roles (nombre) values ('encargado'), ('supervisor'), ('gerente')
on conflict do nothing;

-- ============================================================
-- TABLA: sucursales
-- ============================================================
create table if not exists sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- TABLA: usuarios (linked to Supabase Auth)
-- ============================================================
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol_id integer references roles(id),
  sucursal_id uuid references sucursales(id), -- solo para encargados
  created_at timestamptz default now()
);

-- ============================================================
-- TABLA: supervisor_sucursales (relación muchos-a-muchos)
-- Un supervisor puede tener hasta 5 sucursales
-- ============================================================
create table if not exists supervisor_sucursales (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid references usuarios(id) on delete cascade,
  sucursal_id uuid references sucursales(id) on delete cascade,
  unique(supervisor_id, sucursal_id)
);

-- ============================================================
-- TABLA: metas
-- El gerente define meta por sucursal (monto, periodo)
-- ============================================================
create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references sucursales(id) on delete cascade,
  meta_venta numeric(12,2) not null,       -- Meta total en pesos
  fecha_inicio date not null,
  fecha_fin date not null,
  creado_por uuid references usuarios(id),
  created_at timestamptz default now()
);

-- ============================================================
-- TABLA: ventas_diarias
-- El encargado registra al cierre del día
-- ============================================================
create table if not exists ventas_diarias (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references sucursales(id) on delete cascade,
  encargado_id uuid references usuarios(id),
  fecha date not null,
  venta_total numeric(12,2) not null,
  pollos_vendidos integer not null,
  ticket_promedio numeric(10,2) generated always as (venta_total / nullif(pollos_vendidos, 0)) stored,
  created_at timestamptz default now(),
  unique(sucursal_id, fecha)               -- Solo un registro por sucursal por día
);

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_ventas_sucursal on ventas_diarias(sucursal_id);
create index if not exists idx_ventas_fecha on ventas_diarias(fecha);
create index if not exists idx_metas_sucursal on metas(sucursal_id);
create index if not exists idx_sup_suc_supervisor on supervisor_sucursales(supervisor_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table sucursales enable row level security;
alter table usuarios enable row level security;
alter table supervisor_sucursales enable row level security;
alter table metas enable row level security;
alter table ventas_diarias enable row level security;

-- Todos los usuarios autenticados pueden leer sucursales activas
create policy "sucursales_read" on sucursales
  for select using (auth.role() = 'authenticated');

-- Gerente puede insertar/actualizar sucursales
create policy "sucursales_gerente_write" on sucursales
  for all using (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'gerente'
    )
  );

-- Usuarios pueden leer su propio perfil y el gerente/supervisor puede leer todos
create policy "usuarios_read" on usuarios
  for select using (
    auth.uid() = id
    or exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre in ('gerente', 'supervisor')
    )
  );

create policy "usuarios_insert_gerente" on usuarios
  for insert with check (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'gerente'
    )
  );

create policy "usuarios_update_gerente" on usuarios
  for update using (
    auth.uid() = id
    or exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'gerente'
    )
  );

-- supervisor_sucursales: gerente escribe, supervisor y gerente leen
create policy "sup_suc_read" on supervisor_sucursales
  for select using (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre in ('gerente', 'supervisor')
    )
  );

create policy "sup_suc_gerente_write" on supervisor_sucursales
  for all using (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'gerente'
    )
  );

-- Metas: gerente escribe, todos leen
create policy "metas_read" on metas
  for select using (auth.role() = 'authenticated');

create policy "metas_gerente_write" on metas
  for all using (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'gerente'
    )
  );

-- Ventas: encargado inserta/actualiza su propia sucursal, supervisor y gerente leen
create policy "ventas_encargado_insert" on ventas_diarias
  for insert with check (
    exists (
      select 1 from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid() and r.nombre = 'encargado' and u.sucursal_id = sucursal_id
    )
  );

create policy "ventas_encargado_update" on ventas_diarias
  for update using (encargado_id = auth.uid());

create policy "ventas_read_all" on ventas_diarias
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- FUNCIÓN: resumen por sucursal para una meta vigente
-- ============================================================
create or replace function resumen_sucursal(p_sucursal_id uuid)
returns table (
  sucursal_id uuid,
  meta_id uuid,
  meta_venta numeric,
  fecha_inicio date,
  fecha_fin date,
  venta_acumulada numeric,
  dias_transcurridos integer,
  dias_totales integer,
  ticket_promedio_periodo numeric,
  pollos_totales integer,
  avance_porcentaje numeric
) language sql stable as $$
  select
    m.sucursal_id,
    m.id as meta_id,
    m.meta_venta,
    m.fecha_inicio,
    m.fecha_fin,
    coalesce(sum(v.venta_total), 0) as venta_acumulada,
    (current_date - m.fecha_inicio)::integer as dias_transcurridos,
    (m.fecha_fin - m.fecha_inicio + 1)::integer as dias_totales,
    case when coalesce(sum(v.pollos_vendidos), 0) > 0
      then round(sum(v.venta_total) / sum(v.pollos_vendidos), 2)
      else 0
    end as ticket_promedio_periodo,
    coalesce(sum(v.pollos_vendidos), 0)::integer as pollos_totales,
    case when m.meta_venta > 0
      then round((coalesce(sum(v.venta_total), 0) / m.meta_venta) * 100, 2)
      else 0
    end as avance_porcentaje
  from metas m
  left join ventas_diarias v on v.sucursal_id = m.sucursal_id
    and v.fecha between m.fecha_inicio and m.fecha_fin
  where m.sucursal_id = p_sucursal_id
    and current_date between m.fecha_inicio and m.fecha_fin
  group by m.sucursal_id, m.id, m.meta_venta, m.fecha_inicio, m.fecha_fin
  limit 1;
$$;
