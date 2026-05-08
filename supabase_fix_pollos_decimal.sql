-- ============================================================
-- FIX: pollos_vendidos decimal + política INSERT usuarios
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. pollos_vendidos → numeric(10,2) ───────────────────────
--    La columna ticket_promedio es GENERADA usando pollos_vendidos,
--    por eso hay que: eliminarla → cambiar tipo → volver a crearla.

ALTER TABLE ventas_diarias DROP COLUMN ticket_promedio;

ALTER TABLE ventas_diarias
  ALTER COLUMN pollos_vendidos TYPE numeric(10,2);

ALTER TABLE ventas_diarias
  ADD COLUMN ticket_promedio numeric(10,2)
  GENERATED ALWAYS AS (venta_total / NULLIF(pollos_vendidos, 0)) STORED;

-- ── 2. Política INSERT para gerente en tabla usuarios ─────────
--    Permite al gerente crear cualquier tipo de usuario
--    (incluyendo suplente) sin error de RLS.

DROP POLICY IF EXISTS "usuarios_insert_gerente" ON usuarios;

CREATE POLICY "usuarios_insert_gerente" ON usuarios
  FOR INSERT WITH CHECK (
    public.get_my_rol() = 'gerente'
  );
