import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, addDays, parseISO } from 'date-fns'
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
    const sids = sucs.map(s => s.id)

    const [{ data: lotes }, { data: minimos }] = await Promise.all([
      supabase
        .from('pollos_taco')
        .select('*')
        .in('sucursal_id', sids)
        .order('fecha_rostizado', { ascending: false }),
      supabase.from('pollos_taco_minimos').select('*').in('sucursal_id', sids),
    ])

    const lMap = {}; const mMap = {}
    sids.forEach(id => { lMap[id] = []; mMap[id] = 0 })
    lotes?.forEach(l => { if (lMap[l.sucursal_id]) lMap[l.sucursal_id].push(l) })
    minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })

    setLotesMap(lMap)
    setMinimosMap(mMap)
    setLoading(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const totalStock = sucursales.reduce((a, s) =>
    a + (lotesMap[s.id]?.filter(l => l.fecha_caducidad > hoyStr).reduce((x, l) => x + l.cantidad, 0) ?? 0), 0)
  const sucConDeficit = sucursales.filter(s => {
    const stock = lotesMap[s.id]?.filter(l => l.fecha_caducidad > hoyStr).reduce((x, l) => x + l.cantidad, 0) ?? 0
    return minimosMap[s.id] > 0 && stock < minimosMap[s.id]
  })
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
          <span className={styles.kpiVal}>{totalStock}</span>
          <span className={styles.kpiLabel}>Stock total</span>
        </div>
        <div className={`${styles.kpiCard} ${sucConDeficit.length > 0 ? styles.kpiDanger : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucConDeficit.length > 0 ? 'var(--red)' : 'var(--success)' }}>
            {sucConDeficit.length}
          </span>
          <span className={styles.kpiLabel}>Con déficit</span>
        </div>
        <div className={`${styles.kpiCard} ${sucCaducando.length > 0 ? styles.kpiWarn : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucCaducando.length > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {sucCaducando.length}
          </span>
          <span className={styles.kpiLabel}>Caducan hoy</span>
        </div>
      </div>

      {sucConDeficit.length > 0 && (
        <div className={styles.alertBanner} style={{ borderColor: 'rgba(232,25,44,0.3)', background: 'rgba(232,25,44,0.07)' }}>
          <AlertTriangle size={15} strokeWidth={2.5} color="var(--red)" />
          <span style={{ color: 'var(--red)' }}>
            <strong>Déficit:</strong> {sucConDeficit.map(s => s.nombre).join(', ')}
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
          const lotes    = lotesMap[suc.id] ?? []
          const minimo   = minimosMap[suc.id] ?? 0
          const vigentes = lotes.filter(l => l.fecha_caducidad > hoyStr)
          const stock    = vigentes.reduce((a, l) => a + l.cantidad, 0)
          const hayDeficit  = minimo > 0 && stock < minimo
          const expirando   = vigentes.filter(l => l.fecha_caducidad === mananaStr)
          const pct = minimo > 0 ? Math.min((stock / minimo) * 100, 100) : 100
          let statusColor = 'var(--success)'
          let statusLabel = 'OK'
          if (hayDeficit) { statusColor = 'var(--red)'; statusLabel = 'Déficit' }
          else if (expirando.length > 0) { statusColor = 'var(--yellow)'; statusLabel = 'Caduca hoy' }
          const isExpanded = expanded[suc.id] ?? false
          const diasCob = minimo > 0 ? Math.floor(stock / minimo) : null
          const cobColor = diasCob === null ? 'var(--text-muted)' : diasCob >= 2 ? 'var(--success)' : diasCob === 1 ? 'var(--yellow)' : 'var(--red)'

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
                    {(hayDeficit || expirando.length > 0)
                      ? <AlertTriangle size={10} strokeWidth={2.5} />
                      : <CheckCircle size={10} strokeWidth={2.5} />
                    }
                    {statusLabel}
                  </span>
                </div>
                <div className={styles.cardRight}>
                  {diasCob !== null && (
                    <span className={styles.cobBadge} style={{
                      color: cobColor,
                      borderColor: cobColor + '50',
                      background: cobColor + '12',
                    }}>
                      {diasCob === 0 ? '<1d' : `${diasCob}d`}
                    </span>
                  )}
                  <div className={styles.stockBig}>
                    <span className={styles.stockNum}>{stock}</span>
                    {minimo > 0 && <span className={styles.stockMin}>/{minimo}</span>}
                  </div>
                  {isExpanded
                    ? <ChevronUp size={16} strokeWidth={2} color="var(--text-muted)" />
                    : <ChevronDown size={16} strokeWidth={2} color="var(--text-muted)" />
                  }
                </div>
              </div>

              {minimo > 0 && (
                <div className={styles.bar}>
                  <div className={styles.barFill} style={{ width: `${pct}%`, background: statusColor }} />
                </div>
              )}

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
