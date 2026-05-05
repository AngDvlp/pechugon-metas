-- ============================================================
-- FIX: Políticas RLS faltantes — ventas_diarias
-- Ejecutar en el SQL Editor de Supabase
-- Versión 2026-05-05
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Encargado: CORREGIR política de UPDATE
--    Antes: requería encargado_id = auth.uid()
--           → fallaba si el registro fue creado por supervisor (encargado_id = null)
--    Ahora: permite actualizar cualquier registro de su propia sucursal
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 2. Supervisor: insertar ventas en sucursales asignadas
--    (necesario para RegistroAtrasado y edición en Sucursal)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_supervisor_insert" ON ventas_diarias;

CREATE POLICY "ventas_supervisor_insert" ON ventas_diarias
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM supervisor_sucursales ss
      JOIN usuarios u ON u.id = ss.supervisor_id
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre = 'supervisor'
        AND ss.sucursal_id = sucursal_id
    )
  );

-- ────────────────────────────────────────────────────────────
-- 3. Supervisor: actualizar ventas en sucursales asignadas
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_supervisor_update" ON ventas_diarias;

CREATE POLICY "ventas_supervisor_update" ON ventas_diarias
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM supervisor_sucursales ss
      JOIN usuarios u ON u.id = ss.supervisor_id
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre = 'supervisor'
        AND ss.sucursal_id = sucursal_id
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. Gerente: insertar y actualizar cualquier venta
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_gerente_write" ON ventas_diarias;

CREATE POLICY "ventas_gerente_write" ON ventas_diarias
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'gerente'
    )
  );

-- ────────────────────────────────────────────────────────────
-- 5. Supervisor: eliminar ventas en sucursales asignadas
--    (por si se necesita borrar registros incorrectos)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ventas_supervisor_delete" ON ventas_diarias;

CREATE POLICY "ventas_supervisor_delete" ON ventas_diarias
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM supervisor_sucursales ss
      JOIN usuarios u ON u.id = ss.supervisor_id
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre = 'supervisor'
        AND ss.sucursal_id = sucursal_id
    )
  );

-- ────────────────────────────────────────────────────────────
-- Verificar políticas activas (opcional — descomentar para revisar)
-- ────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'ventas_diarias'
-- ORDER BY policyname;
