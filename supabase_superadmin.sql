-- ============================================================
-- SUPERADMIN + ARQUITECTURA MULTI-ZONA
-- Ejecutar en Supabase SQL Editor (en orden)
-- ============================================================

-- ── 1. Rol superadmin ────────────────────────────────────────
INSERT INTO roles (nombre) VALUES ('superadmin')
  ON CONFLICT (nombre) DO NOTHING;

-- ── 2. Tabla zonas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zonas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL UNIQUE,
  descripcion TEXT,
  activa      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE zonas ENABLE ROW LEVEL SECURITY;

-- ── 3. Columnas zona_id en tablas existentes ─────────────────
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE SET NULL;
ALTER TABLE usuarios   ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE SET NULL;
ALTER TABLE rutas      ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE SET NULL;

-- ── 4. Zona Principal — migración de datos existentes ────────
DO $$
DECLARE
  zona_principal_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
BEGIN
  INSERT INTO zonas (id, nombre, descripcion)
  VALUES (zona_principal_id, 'Zona Principal', 'Zona de operación principal')
  ON CONFLICT (nombre) DO NOTHING;

  -- Asignar todos los datos existentes a Zona Principal
  UPDATE sucursales SET zona_id = zona_principal_id WHERE zona_id IS NULL;
  UPDATE rutas      SET zona_id = zona_principal_id WHERE zona_id IS NULL;

  -- Solo usuarios que no sean superadmin (superadmin no tiene zona)
  UPDATE usuarios
  SET zona_id = zona_principal_id
  WHERE zona_id IS NULL
    AND rol_id NOT IN (SELECT id FROM roles WHERE nombre = 'superadmin');
END;
$$;

-- ── 5. Funciones helper (SECURITY DEFINER evita recursión RLS)
CREATE OR REPLACE FUNCTION public.get_my_zona_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT zona_id FROM usuarios WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT public.get_my_rol() = 'superadmin';
$$;

GRANT EXECUTE ON FUNCTION public.get_my_zona_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin()  TO authenticated;

-- ── 6. Índices de performance ────────────────────────────────
-- Zonas
CREATE INDEX IF NOT EXISTS idx_sucursales_zona      ON sucursales(zona_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_zona        ON usuarios(zona_id);
CREATE INDEX IF NOT EXISTS idx_rutas_zona           ON rutas(zona_id);

-- Ventas (queries más frecuentes)
CREATE INDEX IF NOT EXISTS idx_ventas_suc_fecha     ON ventas_diarias(sucursal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_encargado     ON ventas_diarias(encargado_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_desc    ON ventas_diarias(fecha DESC);

-- Metas
CREATE INDEX IF NOT EXISTS idx_metas_suc_periodo    ON metas(sucursal_id, fecha_inicio, fecha_fin);

-- Pollos / Pedidos
CREATE INDEX IF NOT EXISTS idx_pollos_suc_cad       ON pollos_taco(sucursal_id, fecha_caducidad);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_suc   ON pedidos_pollo_taco(estado, sucursal_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_solicitado   ON pedidos_pollo_taco(solicitado_por);

-- Usuarios / Relaciones
CREATE INDEX IF NOT EXISTS idx_usuarios_rol         ON usuarios(rol_id);
CREATE INDEX IF NOT EXISTS idx_ruta_suc_ruta        ON ruta_sucursales(ruta_id);
CREATE INDEX IF NOT EXISTS idx_sup_suc_sup          ON supervisor_sucursales(supervisor_id);

-- ── 7. RLS: zonas ────────────────────────────────────────────
DROP POLICY IF EXISTS "zonas_select" ON zonas;
DROP POLICY IF EXISTS "zonas_sa_all" ON zonas;

-- Todos los autenticados pueden listar zonas (para selects de UI)
CREATE POLICY "zonas_select" ON zonas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo superadmin puede crear / editar / eliminar zonas
CREATE POLICY "zonas_sa_all" ON zonas
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ── 8. RLS: sucursales (zona-scoped) ─────────────────────────
DROP POLICY IF EXISTS "sucursales_read"            ON sucursales;
DROP POLICY IF EXISTS "sucursales_gerente_write"   ON sucursales;
DROP POLICY IF EXISTS "sucursales_suplente_select" ON sucursales;
DROP POLICY IF EXISTS "sucursales_sa_all"          ON sucursales;
DROP POLICY IF EXISTS "sucursales_read_zona"       ON sucursales;
DROP POLICY IF EXISTS "sucursales_gerente_insert"  ON sucursales;
DROP POLICY IF EXISTS "sucursales_gerente_update"  ON sucursales;

-- Superadmin: acceso total (bypasa todas las restricciones de zona)
CREATE POLICY "sucursales_sa_all" ON sucursales
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Usuarios autenticados leen solo sucursales de su zona
CREATE POLICY "sucursales_read_zona" ON sucursales
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    zona_id = public.get_my_zona_id()
  );

-- Gerente inserta sucursales en su propia zona
CREATE POLICY "sucursales_gerente_insert" ON sucursales
  FOR INSERT WITH CHECK (
    public.get_my_rol() = 'gerente' AND
    zona_id = public.get_my_zona_id()
  );

-- Gerente actualiza sucursales de su zona
CREATE POLICY "sucursales_gerente_update" ON sucursales
  FOR UPDATE USING (
    public.get_my_rol() = 'gerente' AND
    zona_id = public.get_my_zona_id()
  );

-- ── 9. RLS: usuarios (zona-scoped) ───────────────────────────
DROP POLICY IF EXISTS "usuarios_read"           ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert_gerente" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update_gerente" ON usuarios;
DROP POLICY IF EXISTS "usuarios_cocina_read"    ON usuarios;
DROP POLICY IF EXISTS "usuarios_sa_all"         ON usuarios;
DROP POLICY IF EXISTS "usuarios_read_zona"      ON usuarios;

-- Superadmin: acceso total
CREATE POLICY "usuarios_sa_all" ON usuarios
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Lectura: propio registro O misma zona (gerente/supervisor/suplente/cocina)
CREATE POLICY "usuarios_read_zona" ON usuarios
  FOR SELECT USING (
    auth.uid() = id OR
    (
      auth.uid() IS NOT NULL AND
      zona_id = public.get_my_zona_id() AND
      public.get_my_rol() IN ('gerente', 'supervisor', 'suplente', 'cocina')
    )
  );

-- Gerente crea usuarios solo en su zona
CREATE POLICY "usuarios_insert_gerente" ON usuarios
  FOR INSERT WITH CHECK (
    public.get_my_rol() = 'gerente' AND
    zona_id = public.get_my_zona_id()
  );

-- Actualización: propio registro O gerente en la misma zona
CREATE POLICY "usuarios_update_gerente" ON usuarios
  FOR UPDATE USING (
    auth.uid() = id OR
    (public.get_my_rol() = 'gerente' AND zona_id = public.get_my_zona_id())
  );

-- ── 10. RLS: rutas (zona-scoped) ─────────────────────────────
DROP POLICY IF EXISTS "rutas_select"        ON rutas;
DROP POLICY IF EXISTS "rutas_gerente_all"   ON rutas;
DROP POLICY IF EXISTS "rutas_sa_all"        ON rutas;
DROP POLICY IF EXISTS "rutas_read_zona"     ON rutas;
DROP POLICY IF EXISTS "rutas_gerente_write" ON rutas;

CREATE POLICY "rutas_sa_all" ON rutas
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "rutas_read_zona" ON rutas
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    zona_id = public.get_my_zona_id()
  );

CREATE POLICY "rutas_gerente_write" ON rutas
  FOR ALL USING (
    public.get_my_rol() = 'gerente' AND
    zona_id = public.get_my_zona_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'gerente' AND
    zona_id = public.get_my_zona_id()
  );

-- ── 11. RLS: ruta_sucursales ──────────────────────────────────
DROP POLICY IF EXISTS "ruta_suc_select"      ON ruta_sucursales;
DROP POLICY IF EXISTS "ruta_suc_gerente_all" ON ruta_sucursales;
DROP POLICY IF EXISTS "ruta_suc_sa_all"      ON ruta_sucursales;

CREATE POLICY "ruta_suc_sa_all" ON ruta_sucursales
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "ruta_suc_select" ON ruta_sucursales
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ruta_suc_gerente_all" ON ruta_sucursales
  FOR ALL USING (public.get_my_rol() = 'gerente')
  WITH CHECK (public.get_my_rol() = 'gerente');

-- ── 12. RLS: ventas_diarias (+ superadmin bypass) ────────────
DROP POLICY IF EXISTS "ventas_sa_all"        ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_gerente_write" ON ventas_diarias;

-- Superadmin bypass
CREATE POLICY "ventas_sa_all" ON ventas_diarias
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Gerente modernizado (evita subquery costoso)
CREATE POLICY "ventas_gerente_write" ON ventas_diarias
  FOR ALL USING (public.get_my_rol() = 'gerente')
  WITH CHECK (public.get_my_rol() = 'gerente');

-- ── 13. RLS: metas (+ superadmin bypass) ─────────────────────
DROP POLICY IF EXISTS "metas_sa_all"        ON metas;
DROP POLICY IF EXISTS "metas_gerente_write" ON metas;

CREATE POLICY "metas_sa_all" ON metas
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Gerente modernizado
CREATE POLICY "metas_gerente_write" ON metas
  FOR ALL USING (public.get_my_rol() = 'gerente')
  WITH CHECK (public.get_my_rol() = 'gerente');

-- ── 14. RLS: pollos / pedidos / supervisor_sucursales ─────────
DROP POLICY IF EXISTS "pollos_taco_sa_all"         ON pollos_taco;
DROP POLICY IF EXISTS "pollos_taco_minimos_sa_all" ON pollos_taco_minimos;
DROP POLICY IF EXISTS "pedidos_sa_all"             ON pedidos_pollo_taco;
DROP POLICY IF EXISTS "sup_suc_sa_all"             ON supervisor_sucursales;

CREATE POLICY "pollos_taco_sa_all" ON pollos_taco
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "pollos_taco_minimos_sa_all" ON pollos_taco_minimos
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "pedidos_sa_all" ON pedidos_pollo_taco
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "sup_suc_sa_all" ON supervisor_sucursales
  FOR ALL USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ── Verificación opcional (descomentar para revisar) ──────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('zonas','sucursales','usuarios','rutas','ventas_diarias','metas')
-- ORDER BY tablename, policyname;
