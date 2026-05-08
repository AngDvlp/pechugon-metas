-- ============================================================
-- FIX DEFINITIVO — Elimina recursión infinita + arregla todo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. FUNCIONES HELPER (SECURITY DEFINER = sin RLS) ─────────
--    Estas funciones leen la tabla usuarios SIN aplicar RLS,
--    evitando la recursión infinita que causa el error 500.

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT r.nombre
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_sucursal_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT sucursal_id FROM usuarios WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rol()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sucursal_id()  TO authenticated;

-- ── 2. USUARIOS: arreglar políticas (causa del error 500) ────

DROP POLICY IF EXISTS "usuarios_read"              ON usuarios;
DROP POLICY IF EXISTS "usuarios_suplente_select"   ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert_gerente"    ON usuarios;
DROP POLICY IF EXISTS "usuarios_update_gerente"    ON usuarios;

-- Cada usuario puede leer su propio perfil.
-- Gerente / supervisor / suplente pueden leer todos.
CREATE POLICY "usuarios_read" ON usuarios
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_my_rol() IN ('gerente', 'supervisor', 'suplente')
  );

CREATE POLICY "usuarios_insert_gerente" ON usuarios
  FOR INSERT WITH CHECK (public.get_my_rol() = 'gerente');

CREATE POLICY "usuarios_update_gerente" ON usuarios
  FOR UPDATE USING (
    auth.uid() = id
    OR public.get_my_rol() = 'gerente'
  );

-- ── 3. VENTAS_DIARIAS: arreglar encargado ────────────────────

DROP POLICY IF EXISTS "ventas_encargado_insert" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_encargado_update" ON ventas_diarias;

CREATE POLICY "ventas_encargado_insert" ON ventas_diarias
  FOR INSERT WITH CHECK (
    public.get_my_rol() = 'encargado'
    AND sucursal_id = public.get_my_sucursal_id()
  );

CREATE POLICY "ventas_encargado_update" ON ventas_diarias
  FOR UPDATE USING (
    public.get_my_rol() = 'encargado'
    AND sucursal_id = public.get_my_sucursal_id()
  );

-- ── 4. ROL SUPLENTE ──────────────────────────────────────────

INSERT INTO roles (nombre) VALUES ('suplente')
  ON CONFLICT (nombre) DO NOTHING;

-- ── 5. VENTAS_DIARIAS: políticas suplente ────────────────────

DROP POLICY IF EXISTS "ventas_suplente_select" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_insert" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_update" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_delete" ON ventas_diarias;

CREATE POLICY "ventas_suplente_select" ON ventas_diarias
  FOR SELECT USING (public.get_my_rol() = 'suplente');
CREATE POLICY "ventas_suplente_insert" ON ventas_diarias
  FOR INSERT WITH CHECK (public.get_my_rol() = 'suplente');
CREATE POLICY "ventas_suplente_update" ON ventas_diarias
  FOR UPDATE USING (public.get_my_rol() = 'suplente');
CREATE POLICY "ventas_suplente_delete" ON ventas_diarias
  FOR DELETE USING (public.get_my_rol() = 'suplente');

-- ── 6. SUCURSALES: suplente ───────────────────────────────────

DROP POLICY IF EXISTS "sucursales_suplente_select" ON sucursales;
CREATE POLICY "sucursales_suplente_select" ON sucursales
  FOR SELECT USING (public.get_my_rol() = 'suplente');

-- ── 7. METAS: suplente ───────────────────────────────────────

DROP POLICY IF EXISTS "metas_suplente_select" ON metas;
CREATE POLICY "metas_suplente_select" ON metas
  FOR SELECT USING (public.get_my_rol() = 'suplente');

-- ── 8. SUPERVISOR_SUCURSALES: suplente ───────────────────────

DROP POLICY IF EXISTS "sup_suc_suplente_select" ON supervisor_sucursales;
CREATE POLICY "sup_suc_suplente_select" ON supervisor_sucursales
  FOR SELECT USING (public.get_my_rol() = 'suplente');

-- ── 9. POLLOS_TACO: ampliar permisos (+ suplente) ────────────

DROP POLICY IF EXISTS "pollos_taco_encargado_insert" ON pollos_taco;
DROP POLICY IF EXISTS "pollos_taco_encargado_update" ON pollos_taco;
DROP POLICY IF EXISTS "pollos_taco_encargado_delete" ON pollos_taco;
DROP POLICY IF EXISTS "pollos_taco_sup_ger_write"    ON pollos_taco;
DROP POLICY IF EXISTS "taco_suplente_all"            ON pollos_taco;

CREATE POLICY "pollos_taco_encargado_insert" ON pollos_taco
  FOR INSERT WITH CHECK (
    public.get_my_rol() = 'encargado'
    AND sucursal_id = public.get_my_sucursal_id()
  );
CREATE POLICY "pollos_taco_encargado_update" ON pollos_taco
  FOR UPDATE USING (
    public.get_my_rol() = 'encargado'
    AND sucursal_id = public.get_my_sucursal_id()
  );
CREATE POLICY "pollos_taco_encargado_delete" ON pollos_taco
  FOR DELETE USING (
    public.get_my_rol() = 'encargado'
    AND sucursal_id = public.get_my_sucursal_id()
  );
CREATE POLICY "pollos_taco_sup_ger_suplente_write" ON pollos_taco
  FOR ALL USING (public.get_my_rol() IN ('supervisor', 'gerente', 'suplente'))
  WITH CHECK (public.get_my_rol() IN ('supervisor', 'gerente', 'suplente'));

-- ── 10. POLLOS_TACO_MINIMOS: ampliar permisos (+ suplente) ───

DROP POLICY IF EXISTS "pollos_taco_min_write"    ON pollos_taco_minimos;
DROP POLICY IF EXISTS "minimos_suplente_select"  ON pollos_taco_minimos;
DROP POLICY IF EXISTS "minimos_suplente_update"  ON pollos_taco_minimos;
DROP POLICY IF EXISTS "minimos_suplente_insert"  ON pollos_taco_minimos;

CREATE POLICY "pollos_taco_min_write" ON pollos_taco_minimos
  FOR ALL USING (public.get_my_rol() IN ('supervisor', 'gerente', 'suplente'))
  WITH CHECK (public.get_my_rol() IN ('supervisor', 'gerente', 'suplente'));

-- ── VERIFICAR (descomentar para revisar resultado) ────────────
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('usuarios','ventas_diarias','pollos_taco')
-- ORDER BY tablename, policyname;
