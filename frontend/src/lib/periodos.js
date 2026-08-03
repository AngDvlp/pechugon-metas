// Periodos de metas — helpers compartidos.
//
// Un "periodo" es el rango fecha_inicio–fecha_fin de un grupo de metas.
// Antes solo se podía consultar el periodo que incluía el día de hoy;
// ahora se puede consultar cualquiera, pasando una fecha de referencia
// a resumen_sucursal / resumen_sucursales.

import { supabase } from './supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/** Clave estable de un periodo, para usar en <select> y como id. */
export const periodoKey = p => `${p.fecha_inicio}|${p.fecha_fin}`

/** Fecha con la que hay que consultar un periodo: hoy si está activo, su cierre si ya terminó. */
export function fechaConsulta(periodo) {
  if (!periodo) return format(new Date(), 'yyyy-MM-dd')
  const hoy = format(new Date(), 'yyyy-MM-dd')
  if (hoy < periodo.fecha_inicio) return periodo.fecha_inicio  // periodo futuro
  if (hoy > periodo.fecha_fin)    return periodo.fecha_fin     // periodo terminado
  return hoy                                                    // periodo activo
}

/** "1 – 31 ago 2026" */
export function periodoLabel(periodo) {
  if (!periodo) return ''
  try {
    const ini = parseISO(periodo.fecha_inicio)
    const fin = parseISO(periodo.fecha_fin)
    const mismoMes = ini.getMonth() === fin.getMonth() && ini.getFullYear() === fin.getFullYear()
    return mismoMes
      ? `${format(ini, 'd', { locale: es })} – ${format(fin, "d MMM yyyy", { locale: es })}`
      : `${format(ini, 'd MMM', { locale: es })} – ${format(fin, "d MMM yyyy", { locale: es })}`
  } catch { return `${periodo.fecha_inicio} – ${periodo.fecha_fin}` }
}

/** Etiqueta corta para chips y selectores: "ago 2026" */
export function periodoCorto(periodo) {
  if (!periodo) return ''
  try { return format(parseISO(periodo.fecha_inicio), 'MMM yyyy', { locale: es }) }
  catch { return periodo.fecha_inicio }
}

/** Estado de un periodo respecto a hoy. */
export function estadoPeriodo(periodo) {
  if (!periodo) return 'ninguno'
  const hoy = format(new Date(), 'yyyy-MM-dd')
  if (hoy < periodo.fecha_inicio) return 'futuro'
  if (hoy > periodo.fecha_fin)    return 'terminado'
  return 'activo'
}

/**
 * Lista los periodos con metas, del más reciente al más antiguo.
 * @param {string[]|null} sucursalIds  null = todas las sucursales
 */
export async function cargarPeriodos(sucursalIds = null) {
  const { data, error } = await supabase.rpc('periodos_metas', {
    p_sucursal_ids: sucursalIds && sucursalIds.length ? sucursalIds : null,
  })
  if (!error) return (data ?? []).map(p => ({ ...p, key: periodoKey(p) }))

  // La migración supabase_periodos_historicos.sql aún no está aplicada:
  // se deducen los periodos leyendo la tabla de metas directamente.
  console.warn('periodos_metas no disponible, usando la tabla metas:', error.message)
  let q = supabase.from('metas').select('fecha_inicio, fecha_fin')
  if (sucursalIds?.length) q = q.in('sucursal_id', sucursalIds)
  const { data: filas } = await q
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const map = new Map()
  filas?.forEach(f => {
    const k = periodoKey(f)
    if (map.has(k)) { map.get(k).metas_count += 1; return }
    map.set(k, {
      key: k,
      fecha_inicio: f.fecha_inicio,
      fecha_fin:    f.fecha_fin,
      metas_count:  1,
      es_activo:    hoy >= f.fecha_inicio && hoy <= f.fecha_fin,
    })
  })
  return [...map.values()].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
}

/** El periodo que debe salir seleccionado al abrir una pantalla: el activo, o el más reciente. */
export function periodoPorDefecto(periodos) {
  if (!periodos?.length) return null
  return periodos.find(p => p.es_activo) ?? periodos[0]
}

/**
 * Resumen de varias sucursales para un periodo.
 * Una sola llamada, en lugar de una por sucursal.
 */
export async function cargarResumenes(sucursalIds, periodo) {
  if (!sucursalIds?.length) return {}
  const { data, error } = await supabase.rpc('resumen_sucursales', {
    p_sucursal_ids: sucursalIds,
    p_fecha:        fechaConsulta(periodo),
  })
  if (!error) {
    const map = {}
    data?.forEach(r => { map[r.sucursal_id] = r })
    return map
  }

  // Sin la migración aplicada solo se puede consultar el periodo activo:
  // se cae a la función vieja, una llamada por sucursal.
  console.warn('resumen_sucursales no disponible, usando resumen_sucursal:', error.message)
  const res = await Promise.all(
    sucursalIds.map(id => supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle())
  )
  const map = {}
  sucursalIds.forEach((id, i) => { if (res[i].data) map[id] = res[i].data })
  return map
}
