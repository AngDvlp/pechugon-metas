-- ============================================================
-- Cambiar pollos_vendidos de integer a numeric(10,2)
-- para aceptar valores decimales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE ventas_diarias
  ALTER COLUMN pollos_vendidos TYPE numeric(10,2);
