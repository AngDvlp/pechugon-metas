-- ============================================================
-- Rutas: agrupación de sucursales para supervisores
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Tabla rutas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rutas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT        NOT NULL UNIQUE,
  activa     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Tabla ruta_sucursales ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ruta_sucursales (
  ruta_id     UUID NOT NULL REFERENCES rutas(id)     ON DELETE CASCADE,
  sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  PRIMARY KEY (ruta_id, sucursal_id)
);

-- ── 3. Columna ruta_id en usuarios (para supervisores) ───────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ruta_id UUID REFERENCES rutas(id) ON DELETE SET NULL;

-- ── 4. RLS en rutas ──────────────────────────────────────────
ALTER TABLE rutas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rutas_select"      ON rutas;
DROP POLICY IF EXISTS "rutas_gerente_all" ON rutas;

CREATE POLICY "rutas_select" ON rutas
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "rutas_gerente_all" ON rutas
  FOR ALL USING  (public.get_my_rol() = 'gerente')
  WITH CHECK     (public.get_my_rol() = 'gerente');

-- ── 5. RLS en ruta_sucursales ────────────────────────────────
ALTER TABLE ruta_sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ruta_suc_select"      ON ruta_sucursales;
DROP POLICY IF EXISTS "ruta_suc_gerente_all" ON ruta_sucursales;

CREATE POLICY "ruta_suc_select" ON ruta_sucursales
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ruta_suc_gerente_all" ON ruta_sucursales
  FOR ALL USING  (public.get_my_rol() = 'gerente')
  WITH CHECK     (public.get_my_rol() = 'gerente');

-- ── 6. Migrar supervisor_sucursales → rutas ──────────────────
--    Para cada supervisor con sucursales asignadas:
--    crea una ruta con su nombre, copia las sucursales y la asigna.
DO $$
DECLARE
  sup        RECORD;
  nueva_ruta UUID;
BEGIN
  FOR sup IN
    SELECT DISTINCT u.id, u.nombre
    FROM  usuarios u
    JOIN  roles    r ON r.id = u.rol_id
    WHERE r.nombre = 'supervisor'
      AND EXISTS (SELECT 1 FROM supervisor_sucursales ss WHERE ss.supervisor_id = u.id)
  LOOP
    INSERT INTO rutas (nombre)
    VALUES (sup.nombre)
    ON CONFLICT (nombre) DO NOTHING;

    SELECT id INTO nueva_ruta FROM rutas WHERE nombre = sup.nombre;

    INSERT INTO ruta_sucursales (ruta_id, sucursal_id)
    SELECT nueva_ruta, sucursal_id
    FROM   supervisor_sucursales
    WHERE  supervisor_id = sup.id
    ON CONFLICT DO NOTHING;

    UPDATE usuarios SET ruta_id = nueva_ruta WHERE id = sup.id;
  END LOOP;
END;
$$;
