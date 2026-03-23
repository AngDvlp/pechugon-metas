-- ============================================================
-- ACTUALIZACIÓN DE METAS v2
-- Meta semanal con pollos + ticket promedio
-- Las fechas son automáticas (mes en curso)
-- ============================================================

-- 1. Agregar columnas nuevas a tabla metas
ALTER TABLE metas 
  ADD COLUMN IF NOT EXISTS pollos_meta numeric(10,2),
  ADD COLUMN IF NOT EXISTS ticket_promedio_meta numeric(10,2),
  ADD COLUMN IF NOT EXISTS semanas_mes integer;

-- 2. Actualizar meta_venta para que sea SEMANAL (pollos × ticket)
-- meta_venta ahora = meta SEMANAL en pesos
-- La meta mensual = meta_venta × semanas_mes

-- 3. Función auxiliar para calcular semanas naturales de un mes
CREATE OR REPLACE FUNCTION semanas_en_mes(p_fecha date)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT date_trunc('week', gs.d))::integer
  FROM generate_series(
    date_trunc('month', p_fecha)::date,
    (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date,
    '1 day'::interval
  ) gs(d);
$$;

-- 4. Actualizar función resumen_sucursal para incluir meta semanal
CREATE OR REPLACE FUNCTION resumen_sucursal(p_sucursal_id uuid)
RETURNS TABLE (
  sucursal_id uuid,
  meta_id uuid,
  meta_venta numeric,          -- meta SEMANAL en pesos
  meta_mensual numeric,        -- meta MENSUAL = meta_venta × semanas
  pollos_meta numeric,         -- pollos meta por semana
  ticket_promedio_meta numeric, -- ticket promedio meta
  semanas_mes integer,
  fecha_inicio date,
  fecha_fin date,
  -- Acumulado mensual
  venta_acumulada numeric,
  dias_transcurridos integer,
  dias_totales integer,
  ticket_promedio_periodo numeric,
  pollos_totales numeric,
  avance_porcentaje numeric,   -- vs meta mensual
  -- Semana actual
  venta_semana_actual numeric,
  pollos_semana_actual numeric,
  ticket_semana_actual numeric,
  avance_semanal numeric       -- vs meta semanal
) LANGUAGE sql STABLE AS $$
  WITH semana_actual AS (
    SELECT
      coalesce(sum(v.venta_total), 0) as venta_sem,
      coalesce(sum(v.pollos_vendidos), 0) as pollos_sem,
      CASE WHEN coalesce(sum(v.pollos_vendidos), 0) > 0
        THEN round(sum(v.venta_total) / sum(v.pollos_vendidos), 2)
        ELSE 0
      END as ticket_sem
    FROM ventas_diarias v
    WHERE v.sucursal_id = p_sucursal_id
      AND v.fecha >= date_trunc('week', current_date)::date
      AND v.fecha <= (date_trunc('week', current_date) + interval '6 days')::date
  )
  SELECT
    m.sucursal_id,
    m.id as meta_id,
    m.meta_venta,
    (m.meta_venta * m.semanas_mes) as meta_mensual,
    m.pollos_meta,
    m.ticket_promedio_meta,
    m.semanas_mes,
    m.fecha_inicio,
    m.fecha_fin,
    coalesce(sum(v.venta_total), 0) as venta_acumulada,
    (current_date - m.fecha_inicio)::integer as dias_transcurridos,
    (m.fecha_fin - m.fecha_inicio + 1)::integer as dias_totales,
    CASE WHEN coalesce(sum(v.pollos_vendidos), 0) > 0
      THEN round(sum(v.venta_total) / sum(v.pollos_vendidos), 2)
      ELSE 0
    END as ticket_promedio_periodo,
    coalesce(sum(v.pollos_vendidos), 0) as pollos_totales,
    CASE WHEN (m.meta_venta * m.semanas_mes) > 0
      THEN round((coalesce(sum(v.venta_total), 0) / (m.meta_venta * m.semanas_mes)) * 100, 2)
      ELSE 0
    END as avance_porcentaje,
    sa.venta_sem as venta_semana_actual,
    sa.pollos_sem as pollos_semana_actual,
    sa.ticket_sem as ticket_semana_actual,
    CASE WHEN m.meta_venta > 0
      THEN round((sa.venta_sem / m.meta_venta) * 100, 2)
      ELSE 0
    END as avance_semanal
  FROM metas m
  CROSS JOIN semana_actual sa
  LEFT JOIN ventas_diarias v ON v.sucursal_id = m.sucursal_id
    AND v.fecha BETWEEN m.fecha_inicio AND m.fecha_fin
  WHERE m.sucursal_id = p_sucursal_id
    AND current_date BETWEEN m.fecha_inicio AND m.fecha_fin
  GROUP BY m.sucursal_id, m.id, m.meta_venta, m.semanas_mes, m.pollos_meta,
           m.ticket_promedio_meta, m.fecha_inicio, m.fecha_fin, sa.venta_sem, sa.pollos_sem, sa.ticket_sem
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resumen_sucursal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION semanas_en_mes(date) TO anon, authenticated;
