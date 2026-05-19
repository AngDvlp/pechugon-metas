-- ============================================================
-- FIX: Reemplazar políticas recursivas en tabla usuarios
-- El problema: usuarios_cocina_read crea recursión infinita
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Eliminar la política que causa el error 500
DROP POLICY IF EXISTS "usuarios_cocina_read" ON usuarios;

-- 2. Ampliar la política existente para incluir cocina y suplente
--    (unificamos en una sola para evitar doble recursión)
DROP POLICY IF EXISTS "usuarios_read" ON usuarios;

CREATE POLICY "usuarios_read" ON usuarios
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid()
        AND r.nombre IN ('gerente', 'supervisor', 'suplente', 'cocina')
    )
  );
