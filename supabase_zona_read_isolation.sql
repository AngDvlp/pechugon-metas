-- ============================================================
-- ZONA READ ISOLATION — Aislar lecturas por zona
-- Cada zona solo lee sus propios datos.
-- Solo el superadmin puede leer datos de todas las zonas.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Helper reutilizable: IDs de sucursales visibles para el usuario actual
-- (evita repetir el subquery en cada política)
CREATE OR REPLACE FUNCTION public.mis_sucursal_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM sucursales
  WHERE zona_id = public.get_my_zona_id()
$$;

GRANT EXECUTE ON FUNCTION public.mis_sucursal_ids() TO authenticated;

-- ── 1. METAS — lectura zona-scoped ───────────────────────────
-- Antes: cualquier autenticado leia todas las metas de todas las zonas
DROP POLICY IF EXISTS "metas_read"       ON metas;
DROP POLICY IF EXISTS "metas_suplente_select" ON metas;
DROP POLICY IF EXISTS "metas_read_zona"  ON metas;

CREATE POLICY "metas_read_zona" ON metas
  FOR SELECT USING (
    public.is_superadmin()
    OR sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── 2. VENTAS_DIARIAS — lectura zona-scoped ───────────────────
-- Antes: auth.role() = 'authenticated' → todas las zonas visibles
DROP POLICY IF EXISTS "ventas_read_all"  ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_read_zona" ON ventas_diarias;

CREATE POLICY "ventas_read_zona" ON ventas_diarias
  FOR SELECT USING (
    public.is_superadmin()
    OR sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── 3. POLLOS_TACO — lectura zona-scoped ──────────────────────
DROP POLICY IF EXISTS "pollos_taco_read"      ON pollos_taco;
DROP POLICY IF EXISTS "pollos_taco_read_zona" ON pollos_taco;

CREATE POLICY "pollos_taco_read_zona" ON pollos_taco
  FOR SELECT USING (
    public.is_superadmin()
    OR sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── 4. POLLOS_TACO_MINIMOS — lectura zona-scoped ──────────────
-- pollos_taco_min_write es FOR ALL (incluye SELECT) solo para sup/ger/suplente
-- Añadir lectura explícita zona-scoped para encargados y cocina también
DROP POLICY IF EXISTS "pollos_taco_minimos_read"      ON pollos_taco_minimos;
DROP POLICY IF EXISTS "pollos_taco_minimos_read_zona" ON pollos_taco_minimos;

CREATE POLICY "pollos_taco_minimos_read_zona" ON pollos_taco_minimos
  FOR SELECT USING (
    public.is_superadmin()
    OR sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── 5. PEDIDOS_POLLO_TACO — lectura zona-scoped ───────────────
-- Supervisor/suplente: solo sus propios pedidos (ya existe)
-- Cocina: todos los pedidos — pero solo de su zona
-- Gerente: todos los pedidos — pero solo de su zona

-- Recrear política de cocina con zona scoping
DROP POLICY IF EXISTS "pedidos_cocina_select"   ON pedidos_pollo_taco;
DROP POLICY IF EXISTS "pedidos_gerente_select"  ON pedidos_pollo_taco;

CREATE POLICY "pedidos_cocina_select" ON pedidos_pollo_taco
  FOR SELECT USING (
    public.is_superadmin()
    OR (
      public.get_my_rol() = 'cocina'
      AND sucursal_id IN (SELECT public.mis_sucursal_ids())
    )
  );

-- Gerente puede ver todos los pedidos de su zona
CREATE POLICY "pedidos_gerente_select" ON pedidos_pollo_taco
  FOR SELECT USING (
    public.get_my_rol() = 'gerente'
    AND sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── 6. SUPERVISOR_SUCURSALES — lectura zona-scoped ────────────
DROP POLICY IF EXISTS "sup_suc_read"       ON supervisor_sucursales;
DROP POLICY IF EXISTS "sup_suc_suplente_select" ON supervisor_sucursales;
DROP POLICY IF EXISTS "sup_suc_read_zona"  ON supervisor_sucursales;

CREATE POLICY "sup_suc_read_zona" ON supervisor_sucursales
  FOR SELECT USING (
    public.is_superadmin()
    OR (
      auth.uid() IS NOT NULL
      AND public.get_my_rol() IN ('gerente', 'supervisor', 'suplente')
      AND sucursal_id IN (SELECT public.mis_sucursal_ids())
    )
  );

-- ── 7. RUTA_SUCURSALES — lectura zona-scoped ──────────────────
-- ruta_suc_select era auth.uid() IS NOT NULL — demasiado amplio
DROP POLICY IF EXISTS "ruta_suc_select"      ON ruta_sucursales;
DROP POLICY IF EXISTS "ruta_suc_read_zona"   ON ruta_sucursales;

CREATE POLICY "ruta_suc_read_zona" ON ruta_sucursales
  FOR SELECT USING (
    public.is_superadmin()
    OR sucursal_id IN (SELECT public.mis_sucursal_ids())
  );

-- ── Verificación opcional ──────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'metas','ventas_diarias','pollos_taco',
--   'pollos_taco_minimos','pedidos_pollo_taco',
--   'supervisor_sucursales','ruta_sucursales'
-- )
-- ORDER BY tablename, policyname;
