-- ============================================================
-- RECOVERY: restaurar acceso si el login está roto
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Quitar la política suplente sobre usuarios (puede causar conflicto)
DROP POLICY IF EXISTS "usuarios_suplente_select" ON usuarios;

-- Reemplazar con una política ampliada que incluye suplente
-- sin subquery recursivo en usuarios
DROP POLICY IF EXISTS "usuarios_read" ON usuarios;
CREATE POLICY "usuarios_read" ON usuarios
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre IN ('gerente', 'supervisor', 'suplente')
    )
  );
