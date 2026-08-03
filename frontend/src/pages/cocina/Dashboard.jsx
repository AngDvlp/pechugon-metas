import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Utensils, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import styles from './Dashboard.module.css'
import { getCached, setCached } from '../../lib/pageCache'
import PageSkeleton from '../../components/PageSkeleton'

function diasParaCaducar(fechaCaducidad, hoyStr) {
  const hoy = new Date(hoyStr + 'T00:00:00')
  const cad = new Date(fechaCaducidad + 'T00:00:00')
  return Math.round((cad - hoy) / 86400000)
}

export default function CocinaDashboard() {
  const hoyStr    = format(new Date(), 'yyyy-MM-dd')
  const mananaStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [sucursales, setSucursales] = useState([])
  const [lotesMap,   setLotesMap]   = useState({})
  const [minimosMap, setMinimosMap] = useState({})
  const [tacosMap,   setTacosMap]   = useState({})   // sucursalId → existencia tacos (últimos 3 días)
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState({})

  useEffect(() => {
    const cached = getCached('coc-dash')
    if (cached) {
      applyData(cached)
      setLoading(false)
      load(true)
    } else {
      load()
    }
  }, [])

  function applyData(d) {
    setSucursales(d.sucursales)
    setLotesMap(d.lotesMap)
    setMinimosMap(d.minimosMap)
    setTacosMap(d.tacosMap)
  }

  async function load(bg = false) {
    if (!bg) setLoading(true)
    const { data: sucs } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')

    if (!sucs?.length) { setSucursales([]); setLoading(false); return }
    const sids  = sucs.map(s => s.id)
    const hace3 = format(subDays(new Date(), 2), 'yyyy-MM-dd')

    const [{ data: lotes }, { data: minimos }, { data: ventasTacos }] = await Promise.all([
      supabase.from('pollos_taco').select('*').in('sucursal_id', sids).order('fecha_rostizado', { ascending: false }),
      supabase.from('pollos_taco_minimos').select('*').in('sucursal_id', sids),
      supabase.from('ventas_diarias')
        .select('sucursal_id, tacos_producidos, tacos_vendidos')
        .in('sucursal_id', sids)
        .gte('fecha', hace3),
    ])

    const lMap = {}; const mMap = {}; const tMap = {}
    sids.forEach(id => { lMap[id] = []; mMap[id] = 0; tMap[id] = 0 })
    lotes?.forEach(l => { if (lMap[l.sucursal_id]) lMap[l.sucursal_id].push(l) })
    minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })
    ventasTacos?.forEach(v => {
      if (tMap[v.sucursal_id] !== undefined) {
        tMap[v.sucursal_id] += (v.tacos_producidos || 0) - (v.tacos_vendidos || 0)
      }
    })

    const d = { sucursales: sucs, lotesMap: lMap, minimosMap: mMap, tacosMap: tMap }
    applyData(d)
    setCached('coc-dash', d)
    setLoading(false)
  }

  if (loading) return <PageSkeleton rows={4} />

  const totalExistenciaTacos = sucursales.reduce((a, s) => a + Math.max(0, tacosMap[s.id] ?? 0), 0)
  const sucSinTacos = sucursales.filter(s => (tacosMap[s.id] ?? 0) <= 0)
  const sucCaducando = sucursales.filter(s =>
    lotesMap[s.id]?.some(l => l.fecha_caducidad === mananaStr)
  )

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Utensils size={18} strokeWidth={2} color="var(--info)" />
          <h2 className={styles.pageTitle}>Existencia Pollo</h2>
        </div>
        <p className={styles.pageDate} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiVal} style={{ color: 'var(--info)' }}>{totalExistenciaTacos}</span>
          <span className={styles.kpiLabel}>Existencia tacos</span>
        </div>
        <div className={`${styles.kpiCard} ${sucSinTacos.length > 0 ? styles.kpiDanger : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucSinTacos.length > 0 ? 'var(--red)' : 'var(--success)' }}>
            {sucSinTacos.length}
          </span>
          <span className={styles.kpiLabel}>Sin tacos</span>
        </div>
        <div className={`${styles.kpiCard} ${sucCaducando.length > 0 ? styles.kpiWarn : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucCaducando.length > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {sucCaducando.length}
          </span>
          <span className={styles.kpiLabel}>Pollos caducan</span>
        </div>
      </div>

      {sucSinTacos.length > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertDanger}`}>
          <AlertTriangle size={15} strokeWidth={2.5} />
          <span>
            <strong>Sin tacos:</strong> {sucSinTacos.map(s => s.nombre).join(', ')}
          </span>
        </div>
      )}
      {sucCaducando.length > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertWarn}`}>
          <AlertTriangle size={15} strokeWidth={2.5} />
          <span>
            <strong>Último día válido:</strong> {sucCaducando.map(s => s.nombre).join(', ')}
          </span>
        </div>
      )}

      <div className={styles.cards}>
        {sucursales.map(suc => {
          const lotes           = lotesMap[suc.id] ?? []
          const vigentes        = lotes.filter(l => l.fecha_caducidad > hoyStr)
          const expirando       = vigentes.filter(l => l.fecha_caducidad === mananaStr)
          const existenciaTacos = Math.max(0, tacosMap[suc.id] ?? 0)
          const isExpanded = expanded[suc.id] ?? false
          // El color se resuelve con clases, no concatenando alfa a un var():
          // "var(--success)40" no es CSS válido y el borde no se pintaba.
          let estado = 'ok', statusLabel = 'Con tacos'
          if (existenciaTacos === 0) { estado = 'sin'; statusLabel = 'Sin tacos' }
          else if (expirando.length > 0) { estado = 'caduca'; statusLabel = 'Pollos caducan' }
          const badgeClase = { ok: styles.badgeOk, sin: styles.badgeSin, caduca: styles.badgeCaduca }[estado]

          return (
            <div key={suc.id} className={styles.card}>
              <button
                className={styles.cardHeader}
                onClick={() => setExpanded(m => ({ ...m, [suc.id]: !m[suc.id] }))}
                aria-expanded={isExpanded}
                aria-label={`${suc.nombre}: ${existenciaTacos} tacos, ${statusLabel}. Toca para ver los lotes.`}
              >
                <div className={styles.cardLeft}>
                  <p className={styles.sucNombre}>{suc.nombre}</p>
                  <span className={`${styles.statusBadge} ${badgeClase}`}>
                    {estado === 'ok'
                      ? <CheckCircle size={10} strokeWidth={2.5} />
                      : <AlertTriangle size={10} strokeWidth={2.5} />
                    }
                    {statusLabel}
                  </span>
                </div>
                <div className={styles.cardRight}>
                  <div className={styles.stockBig}>
                    <span className={`${styles.stockNum} ${existenciaTacos > 0 ? styles.stockNumOk : styles.stockNumCero}`}>
                      {existenciaTacos}
                    </span>
                    <span className={styles.stockMin}> tacos</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} strokeWidth={2} color="var(--text-muted)" />
                    : <ChevronDown size={16} strokeWidth={2} color="var(--text-muted)" />
                  }
                </div>
              </button>

              {isExpanded && (
                <div className={styles.cardBody}>
                  {expirando.length > 0 && (
                    <div className={styles.inlineAlert}>
                      <AlertTriangle size={12} strokeWidth={2.5} />
                      <span>
                        {expirando.reduce((a, l) => a + l.cantidad, 0)} pollo(s) — último día válido HOY
                      </span>
                    </div>
                  )}
                  {vigentes.length === 0
                    ? <p className={styles.noLotes}>Sin lotes vigentes</p>
                    : vigentes.map(lote => {
                      const dias = diasParaCaducar(lote.fecha_caducidad, hoyStr)
                      const diasClase = dias === 1 ? styles.diasUrgente
                        : dias === 2 ? styles.diasAviso
                        : styles.diasOk
                      return (
                        <div key={lote.id} className={styles.loteItem}>
                          <span className={styles.loteDate}>
                            {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                          </span>
                          <span className={styles.loteCant}>{lote.cantidad} pollos</span>
                          <span className={`${styles.loteDias} ${diasClase}`}>
                            {dias === 1 ? 'Último día' : `${dias} días`}
                          </span>
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
