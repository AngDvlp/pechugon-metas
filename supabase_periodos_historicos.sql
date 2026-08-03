-- ============================================================
-- PERIODOS HISTÓRICOS
-- Permite consultar cualquier periodo de metas, no solo el activo.
--
-- Problema que resuelve:
--   resumen_sucursal() tenía fija la condición
--     current_date BETWEEN m.fecha_inicio AND m.fecha_fin
--   por lo que al terminar un periodo dejaba de devolver datos
--   y no había forma de consultar cómo cerró cada sucursal.
--
-- Qué cambia:
--   1. resumen_sucursal() ahora recibe una fecha de referencia
--      (por omisión hoy, así que las llamadas existentes siguen
--      funcionando igual).
--   2. Se agrega resumen_sucursales() que resuelve varias
--      sucursales en una sola llamada.
--   3. Se agrega periodos_metas() para listar los periodos
--      disponibles y poder ofrecerlos en un selector.
-- ============================================================

-- Índice para las búsquedas por periodo
CREATE INDEX IF NOT EXISTS idx_metas_periodo ON metas(fecha_inicio, fecha_fin);

-- ------------------------------------------------------------
-- 1. Núcleo: resumen de VARIAS sucursales en una fecha dada
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resumen_sucursales(
  p_sucursal_ids uuid[],
  p_fecha        date DEFAULT current_date
)
RETURNS TABLE (
  sucursal_id             uuid,
  meta_id                 uuid,
  meta_venta              numeric,   -- meta SEMANAL en pesos
  meta_mensual            numeric,   -- meta del PERIODO = meta_venta × semanas
  pollos_meta             numeric,
  ticket_promedio_meta    numeric,
  semanas_mes             integer,
  fecha_inicio            date,
  fecha_fin               date,
  es_periodo_activo       boolean,   -- true si el periodo incluye el día de hoy
  -- Acumulado del periodo (hasta p_fecha, o hasta el cierre si ya terminó)
  venta_acumulada         numeric,
  dias_transcurridos      integer,
  dias_totales            integer,
  ticket_promedio_periodo numeric,
  pollos_totales          numeric,
  avance_porcentaje       numeric,
  -- Semana de referencia (la que contiene p_fecha, recortada al periodo)
  venta_semana_actual     numeric,
  pollos_semana_actual    numeric,
  ticket_semana_actual    numeric,
  avance_semanal          numeric
)
LANGUAGE sql STABLE AS $$
  WITH meta_sel AS (
    -- Una meta por sucursal: la del periodo que contiene p_fecha.
    -- Si hubiera duplicadas en el mismo periodo, gana la más reciente.
    SELECT DISTINCT ON (m.sucursal_id)
           m.id, m.sucursal_id, m.meta_venta, m.pollos_meta,
           m.ticket_promedio_meta, m.semanas_mes, m.fecha_inicio, m.fecha_fin
    FROM metas m
    WHERE m.sucursal_id = ANY (p_sucursal_ids)
      AND p_fecha BETWEEN m.fecha_inicio AND m.fecha_fin
    ORDER BY m.sucursal_id, m.created_at DESC
  ),
  sem AS (
    -- Ventana de la semana de p_fecha, recortada a los límites del periodo
    SELECT ms.sucursal_id,
           GREATEST(date_trunc('week', p_fecha)::date, ms.fecha_inicio)                  AS sem_ini,
           LEAST((date_trunc('week', p_fecha) + interval '6 days')::date, ms.fecha_fin)  AS sem_fin
    FROM meta_sel ms
  ),
  agg_periodo AS (
    SELECT ms.sucursal_id,
           coalesce(sum(v.venta_total), 0)     AS venta,
           coalesce(sum(v.pollos_vendidos), 0) AS pollos
    FROM meta_sel ms
    LEFT JOIN ventas_diarias v
           ON v.sucursal_id = ms.sucursal_id
          AND v.fecha BETWEEN ms.fecha_inicio AND LEAST(p_fecha, ms.fecha_fin)
    GROUP BY ms.sucursal_id
  ),
  agg_semana AS (
    SELECT s.sucursal_id,
           coalesce(sum(v.venta_total), 0)     AS venta,
           coalesce(sum(v.pollos_vendidos), 0) AS pollos
    FROM sem s
    LEFT JOIN ventas_diarias v
           ON v.sucursal_id = s.sucursal_id
          AND v.fecha BETWEEN s.sem_ini AND s.sem_fin
    GROUP BY s.sucursal_id
  )
  SELECT
    ms.sucursal_id,
    ms.id,
    ms.meta_venta,
    (ms.meta_venta * ms.semanas_mes),
    ms.pollos_meta,
    ms.ticket_promedio_meta,
    ms.semanas_mes,
    ms.fecha_inicio,
    ms.fecha_fin,
    (current_date BETWEEN ms.fecha_inicio AND ms.fecha_fin),
    ap.venta,
    (LEAST(p_fecha, ms.fecha_fin) - ms.fecha_inicio)::integer,
    (ms.fecha_fin - ms.fecha_inicio + 1)::integer,
    CASE WHEN ap.pollos > 0 THEN round(ap.venta / ap.pollos, 2) ELSE 0 END,
    ap.pollos,
    CASE WHEN (ms.meta_venta * ms.semanas_mes) > 0
      THEN round((ap.venta / (ms.meta_venta * ms.semanas_mes)) * 100, 2)
      ELSE 0 END,
    asem.venta,
    asem.pollos,
    CASE WHEN asem.pollos > 0 THEN round(asem.venta / asem.pollos, 2) ELSE 0 END,
    CASE WHEN ms.meta_venta > 0
      THEN round((asem.venta / ms.meta_venta) * 100, 2)
      ELSE 0 END
  FROM meta_sel ms
  JOIN agg_periodo ap   ON ap.sucursal_id   = ms.sucursal_id
  JOIN agg_semana  asem ON asem.sucursal_id = ms.sucursal_id;
$$;

-- ------------------------------------------------------------
-- 2. Compatibilidad: una sola sucursal
--    Se elimina la versión de 1 argumento para que las llamadas
--    existentes rpc('resumen_sucursal', { p_sucursal_id })
--    resuelvan sin ambigüedad a esta, usando p_fecha = hoy.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS resumen_sucursal(uuid);

CREATE OR REPLACE FUNCTION resumen_sucursal(
  p_sucursal_id uuid,
  p_fecha       date DEFAULT current_date
)
RETURNS TABLE (
  sucursal_id             uuid,
  meta_id                 uuid,
  meta_venta              numeric,
  meta_mensual            numeric,
  pollos_meta             numeric,
  ticket_promedio_meta    numeric,
  semanas_mes             integer,
  fecha_inicio            date,
  fecha_fin               date,
  es_periodo_activo       boolean,
  venta_acumulada         numeric,
  dias_transcurridos      integer,
  dias_totales            integer,
  ticket_promedio_periodo numeric,
  pollos_totales          numeric,
  avance_porcentaje       numeric,
  venta_semana_actual     numeric,
  pollos_semana_actual    numeric,
  ticket_semana_actual    numeric,
  avance_semanal          numeric
)
LANGUAGE sql STABLE AS $$
  SELECT * FROM resumen_sucursales(ARRAY[p_sucursal_id], p_fecha);
$$;

-- ------------------------------------------------------------
-- 3. Periodos disponibles, para poblar el selector
--    p_sucursal_ids = NULL devuelve los periodos de toda la empresa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION periodos_metas(
  p_sucursal_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  fecha_inicio date,
  fecha_fin    date,
  metas_count  integer,
  es_activo    boolean
)
LANGUAGE sql STABLE AS $$
  SELECT m.fecha_inicio,
         m.fecha_fin,
         count(*)::integer,
         (current_date BETWEEN m.fecha_inicio AND m.fecha_fin)
  FROM metas m
  WHERE p_sucursal_ids IS NULL
     OR m.sucursal_id = ANY (p_sucursal_ids)
  GROUP BY m.fecha_inicio, m.fecha_fin
  ORDER BY m.fecha_inicio DESC;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION resumen_sucursales(uuid[], date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resumen_sucursal(uuid, date)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION periodos_metas(uuid[])           TO anon, authenticated;
