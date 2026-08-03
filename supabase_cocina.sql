-- ============================================================
-- COCINA — Rol + Sistema de Pedidos de Pollo para Taco
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ── 1. Nuevo rol: cocina ──────────────────────────────────────
INSERT INTO roles (nombre) VALUES ('cocina') ON CONFLICT (nombre) DO NOTHING;

-- ── 2. Tabla: pedidos_pollo_taco ─────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos_pollo_taco (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sucursal_id         UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  solicitado_por      UUID NOT NULL REFERENCES usuarios(id),
  cantidad_solicitada INTEGER NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_enviada    INTEGER CHECK (cantidad_enviada >= 0),
  estado              TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'aceptado', 'parcial', 'rechazado')),
  notas_supervisor    TEXT,
  notas_cocina        TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal       ON pedidos_pollo_taco(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_solicitado_por ON pedidos_pollo_taco(solicitado_por);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado         ON pedidos_pollo_taco(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at     ON pedidos_pollo_taco(created_at DESC);

-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE pedidos_pollo_taco ENABLE ROW LEVEL SECURITY;

-- Supervisores / suplentes: crear pedidos propios
CREATE POLICY "pedidos_supervisor_insert" ON pedidos_pollo_taco
  FOR INSERT WITH CHECK (
    solicitado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre IN ('supervisor', 'suplente')
    )
  );

-- Supervisores / suplentes: ver solo sus propios pedidos
CREATE POLICY "pedidos_supervisor_select" ON pedidos_pollo_taco
  FOR SELECT USING (
    solicitado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre IN ('supervisor', 'suplente')
    )
  );

-- Cocina: leer TODOS los pedidos
CREATE POLICY "pedidos_cocina_select" ON pedidos_pollo_taco
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'cocina'
    )
  );

-- Cocina: responder pedidos (actualizar estado + cantidad_enviada)
CREATE POLICY "pedidos_cocina_update" ON pedidos_pollo_taco
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'cocina'
    )
  );

-- Gerente: ver todos los pedidos
CREATE POLICY "pedidos_gerente_select" ON pedidos_pollo_taco
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'gerente'
    )
  );

-- ── 5. Cocina puede leer usuarios (para mostrar nombre del supervisor) ──
CREATE POLICY "usuarios_cocina_read" ON usuarios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = auth.uid() AND r.nombre = 'cocina'
    )
  );
