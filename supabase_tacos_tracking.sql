-- Tracking de tacos producidos y vendidos en el cierre diario del encargado
ALTER TABLE ventas_diarias
  ADD COLUMN IF NOT EXISTS tacos_producidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tacos_vendidos   INTEGER NOT NULL DEFAULT 0;
