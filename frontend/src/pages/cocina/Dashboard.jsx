import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Utensils, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import styles from './Dashboard.module.css'

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

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: sucs } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')

    setSucursales(sucs ?? [])

    if (!sucs?.length) { setLoading(false); return }
    const sids  = sucs.map(s => s.id)
    const hace3 = format(subDays(new Date(), 2), 'yyyy-MM-dd')

    const [{ data: lotes }, { data: minimos }, { data: ventasTacos }] = await Promise.all([
      supabase
        .from('pollos_taco')
        .select('*')
        .in('sucursal_id', sids)
        .order('fecha_rostizado', { ascending: false }),
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

    setLotesMap(lMap)
    setMinimosMap(mMap)
    setTacosMap(tMap)
    setLoading(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

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
        <div className={styles.alertBanner} style={{ borderColor: 'rgba(232,25,44,0.3)', background: 'rgba(232,25,44,0.07)' }}>
          <AlertTriangle size={15} strokeWidth={2.5} color="var(--red)" />
          <span style={{ color: 'var(--red)' }}>
            <strong>Sin tacos:</strong> {sucSinTacos.map(s => s.nombre).join(', ')}
          </span>
        </div>
      )}
      {sucCaducando.length > 0 && (
        <div className={styles.alertBanner} style={{ borderColor: 'rgba(245,196,0,0.3)', background: 'rgba(245,196,0,0.07)' }}>
          <AlertTriangle size={15} strokeWidth={2.5} color="var(--yellow)" />
          <span style={{ color: 'var(--yellow)' }}>
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
          let statusColor = 'var(--success)'
          let statusLabel = 'Con tacos'
          if (existenciaTacos === 0) { statusColor = 'var(--red)'; statusLabel = 'Sin tacos' }
          else if (expirando.length > 0) { statusColor = 'var(--yellow)'; statusLabel = 'Pollos caducan' }

          return (
            <div key={suc.id} className={styles.card}>
              <div
                className={styles.cardHeader}
                onClick={() => setExpanded(m => ({ ...m, [suc.id]: !m[suc.id] }))}
              >
                <div className={styles.cardLeft}>
                  <p className={styles.sucNombre}>{suc.nombre}</p>
                  <span
                    className={styles.statusBadge}
                    style={{ color: statusColor, borderColor: statusColor + '40', background: statusColor + '12' }}
                  >
                    {(existenciaTacos === 0 || expirando.length > 0)
                      ? <AlertTriangle size={10} strokeWidth={2.5} />
                      : <CheckCircle size={10} strokeWidth={2.5} />
                    }
                    {statusLabel}
                  </span>
                </div>
                <div className={styles.cardRight}>
                  <div className={styles.stockBig}>
                    <span className={styles.stockNum} style={{ color: existenciaTacos > 0 ? 'var(--info)' : 'var(--red)' }}>
                      {existenciaTacos}
                    </span>
                    <span className={styles.stockMin}> tacos</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} strokeWidth={2} color="var(--text-muted)" />
                    : <ChevronDown size={16} strokeWidth={2} color="var(--text-muted)" />
                  }
                </div>
              </div>

              {isExpanded && (
                <div className={styles.cardBody}>
                  {expirando.length > 0 && (
                    <div className={styles.inlineAlert}>
                      <AlertTriangle size={12} strokeWidth={2.5} color="var(--yellow)" />
                      <span style={{ color: 'var(--yellow)' }}>
                        {expirando.reduce((a, l) => a + l.cantidad, 0)} pollo(s) — último día válido HOY
                      </span>
                    </div>
                  )}
                  {vigentes.length === 0
                    ? <p className={styles.noLotes}>Sin lotes vigentes</p>
                    : vigentes.map(lote => {
                      const dias = diasParaCaducar(lote.fecha_caducidad, hoyStr)
                      let diasColor = 'var(--success)'
                      if (dias === 1) diasColor = 'var(--red)'
                      else if (dias === 2) diasColor = 'var(--yellow)'
                      return (
                        <div key={lote.id} className={styles.loteItem}>
                          <span className={styles.loteDate}>
                            {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                          </span>
                          <span className={styles.loteCant}>{lote.cantidad} pollos</span>
                          <span className={styles.loteDias} style={{ color: diasColor }}>
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
