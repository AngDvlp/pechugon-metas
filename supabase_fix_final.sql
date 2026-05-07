-- ============================================================
-- FIX FINAL: Encargado INSERT/UPDATE + Rol Suplente completo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. ENCARGADO: arreglar INSERT (política principal del bug) ─
DROP POLICY IF EXISTS "ventas_encargado_insert" ON ventas_diarias;
CREATE POLICY "ventas_encargado_insert" ON ventas_diarias
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre = 'encargado'
        AND u.sucursal_id = sucursal_id
    )
  );

-- ── 2. ENCARGADO: arreglar UPDATE ─────────────────────────────
DROP POLICY IF EXISTS "ventas_encargado_update" ON ventas_diarias;
CREATE POLICY "ventas_encargado_update" ON ventas_diarias
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre = 'encargado'
        AND u.sucursal_id = sucursal_id
    )
  );

-- ── 3. SUPLENTE: insertar rol ──────────────────────────────────
INSERT INTO roles (nombre) VALUES ('suplente')
  ON CONFLICT (nombre) DO NOTHING;

-- ── 4. sucursales: suplente SELECT ────────────────────────────
DROP POLICY IF EXISTS "sucursales_suplente_select" ON sucursales;
CREATE POLICY "sucursales_suplente_select" ON sucursales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 5. usuarios: suplente SELECT ──────────────────────────────
DROP POLICY IF EXISTS "usuarios_suplente_select" ON usuarios;
CREATE POLICY "usuarios_suplente_select" ON usuarios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 6. ventas_diarias: suplente acceso completo ───────────────
DROP POLICY IF EXISTS "ventas_suplente_select" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_insert" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_update" ON ventas_diarias;
DROP POLICY IF EXISTS "ventas_suplente_delete" ON ventas_diarias;

CREATE POLICY "ventas_suplente_select" ON ventas_diarias
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );
CREATE POLICY "ventas_suplente_insert" ON ventas_diarias
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );
CREATE POLICY "ventas_suplente_update" ON ventas_diarias
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );
CREATE POLICY "ventas_suplente_delete" ON ventas_diarias
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 7. metas: suplente SELECT ─────────────────────────────────
DROP POLICY IF EXISTS "metas_suplente_select" ON metas;
CREATE POLICY "metas_suplente_select" ON metas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 8. pollos_taco: suplente acceso completo ──────────────────
DROP POLICY IF EXISTS "taco_suplente_all" ON pollos_taco;
CREATE POLICY "taco_suplente_all" ON pollos_taco
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 9. pollos_taco_minimos: suplente SELECT + UPDATE + INSERT ──
DROP POLICY IF EXISTS "minimos_suplente_select" ON pollos_taco_minimos;
DROP POLICY IF EXISTS "minimos_suplente_update" ON pollos_taco_minimos;
DROP POLICY IF EXISTS "minimos_suplente_insert" ON pollos_taco_minimos;

CREATE POLICY "minimos_suplente_select" ON pollos_taco_minimos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );
CREATE POLICY "minimos_suplente_update" ON pollos_taco_minimos
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );
CREATE POLICY "minimos_suplente_insert" ON pollos_taco_minimos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── 10. supervisor_sucursales: suplente SELECT ────────────────
DROP POLICY IF EXISTS "sup_suc_suplente_select" ON supervisor_sucursales;
CREATE POLICY "sup_suc_suplente_select" ON supervisor_sucursales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
            WHERE u.id = auth.uid() AND r.nombre = 'suplente')
  );

-- ── VERIFICAR resultado ───────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'ventas_diarias' ORDER BY policyname;
