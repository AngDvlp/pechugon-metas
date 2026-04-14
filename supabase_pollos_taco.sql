-- ============================================================
-- POLLOS PARA TACO — Migración de Base de Datos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Tabla de lotes de pollo para taco por sucursal
CREATE TABLE IF NOT EXISTS pollos_taco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  fecha_rostizado DATE NOT NULL,
  fecha_caducidad DATE GENERATED ALWAYS AS ((fecha_rostizado + INTERVAL '3 days')::date) STORED,
  registrado_por UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mínimo diario requerido de pollo para taco por sucursal
-- (configurable por supervisor o gerente)
CREATE TABLE IF NOT EXISTS pollos_taco_minimos (
  sucursal_id UUID PRIMARY KEY REFERENCES sucursales(id) ON DELETE CASCADE,
  cantidad_minima INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_minima >= 0),
  updated_by UUID REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pollos_taco_sucursal   ON pollos_taco(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_pollos_taco_rostizado  ON pollos_taco(fecha_rostizado);
CREATE INDEX IF NOT EXISTS idx_pollos_taco_caducidad  ON pollos_taco(fecha_caducidad);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE pollos_taco          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pollos_taco_minimos  ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer lotes
CREATE POLICY "pollos_taco_read" ON pollos_taco
  FOR SELECT USING (auth.role() = 'authenticated');

-- Encargado puede insertar en su propia sucursal
CREATE POLICY "pollos_taco_encargado_insert" ON pollos_taco
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'encargado' AND u.sucursal_id = sucursal_id
    )
  );

-- Encargado puede actualizar lotes de su propia sucursal
CREATE POLICY "pollos_taco_encargado_update" ON pollos_taco
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'encargado' AND u.sucursal_id = sucursal_id
    )
  );

-- Encargado puede eliminar lotes de su propia sucursal
CREATE POLICY "pollos_taco_encargado_delete" ON pollos_taco
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'encargado' AND u.sucursal_id = sucursal_id
    )
  );

-- Supervisor y Gerente pueden insertar, actualizar y eliminar cualquier lote
CREATE POLICY "pollos_taco_sup_ger_write" ON pollos_taco
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre IN ('supervisor', 'gerente')
    )
  );

-- Mínimos: todos los autenticados pueden leer
CREATE POLICY "pollos_taco_min_read" ON pollos_taco_minimos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Mínimos: supervisor y gerente pueden escribir
CREATE POLICY "pollos_taco_min_write" ON pollos_taco_minimos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre IN ('supervisor', 'gerente')
    )
  );

-- ============================================================
-- FUNCIÓN: resumen de pollo para taco por sucursal
-- ============================================================
CREATE OR REPLACE FUNCTION resumen_pollos_taco(p_sucursal_id UUID)
RETURNS TABLE (
  sucursal_id      UUID,
  stock_vigente    INTEGER,
  lotes_vigentes   BIGINT,
  lotes_por_caducar BIGINT,
  stock_caducando  INTEGER,
  minimo_diario    INTEGER,
  tiene_deficit    BOOLEAN
) LANGUAGE SQL STABLE AS $$
  SELECT
    p_sucursal_id,
    COALESCE(SUM(CASE WHEN pt.fecha_caducidad > CURRENT_DATE THEN pt.cantidad ELSE 0 END), 0)::INTEGER
      AS stock_vigente,
    COUNT(CASE WHEN pt.fecha_caducidad > CURRENT_DATE THEN 1 END)
      AS lotes_vigentes,
    COUNT(CASE WHEN pt.fecha_caducidad = CURRENT_DATE + 1 THEN 1 END)
      AS lotes_por_caducar,
    COALESCE(SUM(CASE WHEN pt.fecha_caducidad = CURRENT_DATE + 1 THEN pt.cantidad ELSE 0 END), 0)::INTEGER
      AS stock_caducando,
    COALESCE((SELECT ptm.cantidad_minima FROM pollos_taco_minimos ptm WHERE ptm.sucursal_id = p_sucursal_id), 0)
      AS minimo_diario,
    COALESCE(SUM(CASE WHEN pt.fecha_caducidad > CURRENT_DATE THEN pt.cantidad ELSE 0 END), 0) <
      COALESCE((SELECT ptm.cantidad_minima FROM pollos_taco_minimos ptm WHERE ptm.sucursal_id = p_sucursal_id), 0)
      AS tiene_deficit
  FROM pollos_taco pt
  WHERE pt.sucursal_id = p_sucursal_id;
$$;
