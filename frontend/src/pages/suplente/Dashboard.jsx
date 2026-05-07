import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, addDays, startOfWeek, startOfMonth } from 'date-fns'
import {
  ChevronRight, TrendingUp, TrendingDown,
  CheckCircle, Clock, Utensils
} from 'lucide-react'
import styles from './Dashboard.module.css'

const fmt    = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

function calcRangeDates(filtro, customDesde, customHasta) {
  const hoy = new Date()
  if (filtro === 'hoy')   return { desde: format(hoy, 'yyyy-MM-dd'), hasta: format(hoy, 'yyyy-MM-dd') }
  if (filtro === 'semana') return { desde: format(startOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'), hasta: format(hoy, 'yyyy-MM-dd') }
  if (filtro === 'mes')   return { desde: format(startOfMonth(hoy), 'yyyy-MM-dd'), hasta: format(hoy, 'yyyy-MM-dd') }
  if (filtro === 'custom' && customDesde && customHasta) return { desde: customDesde, hasta: customHasta }
  return null
}

export default function SuplenteDashboard() {
  const navigate = useNavigate()
  const hoy    = format(new Date(), 'yyyy-MM-dd')
  const manana = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [sucursales,   setSucursales]   = useState([])
  const [supervisores, setSupervisores] = useState([])
  const [supSucMap,    setSupSucMap]    = useState({})
  const [resumenes,    setResumenes]    = useState({})
  const [ventasHoy,    setVentasHoy]    = useState({})
  const [tacoMap,      setTacoMap]      = useState({})
  const [rangos,       setRangos]       = useState({})
  const [loading,      setLoading]      = useState(true)
  const [loadingRangos, setLoadingRangos] = useState(false)

  const [filtroRuta,    setFiltroRuta]    = useState('todas')
  const [filtroTiempo,  setFiltroTiempo]  = useState('periodo')
  const [customDesde,   setCustomDesde]   = useState('')
  const [customHasta,   setCustomHasta]   = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (filtroTiempo === 'periodo' || !sucursales.length) return
    const dates = calcRangeDates(filtroTiempo, customDesde, customHasta)
    if (dates) loadRangos(dates.desde, dates.hasta)
  }, [filtroTiempo, customDesde, customHasta, sucursales.length])

  async function load() {
    setLoading(true)
    const [
      { data: sucs },
      { data: sups },
      { data: ss },
      { data: hoyData },
      { data: tacoLotes },
      { data: minimos },
    ] = await Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('usuarios').select('id, nombre, roles!inner(nombre)').eq('roles.nombre', 'supervisor'),
      supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id'),
      supabase.from('ventas_diarias').select('*').eq('fecha', hoy),
      supabase.from('pollos_taco').select('*'),
      supabase.from('pollos_taco_minimos').select('*'),
    ])

    setSucursales(sucs ?? [])
    setSupervisores(sups ?? [])

    const supMap = {}
    ss?.forEach(r => {
      if (!supMap[r.supervisor_id]) supMap[r.supervisor_id] = []
      supMap[r.supervisor_id].push(r.sucursal_id)
    })
    setSupSucMap(supMap)

    const hoyMap = {}
    hoyData?.forEach(v => { hoyMap[v.sucursal_id] = v })
    setVentasHoy(hoyMap)

    const sids  = (sucs ?? []).map(s => s.id)
    const mMap  = {}
    minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })
    const tMap  = {}
    sids.forEach(id => {
      const lotes    = tacoLotes?.filter(l => l.sucursal_id === id) ?? []
      const vigentes = lotes.filter(l => l.fecha_caducidad > hoy)
      const stock    = vigentes.reduce((a, l) => a + l.cantidad, 0)
      const minimo   = mMap[id] ?? 0
      tMap[id] = { stock, deficit: minimo > 0 && stock < minimo, expirando: vigentes.some(l => l.fecha_caducidad === manana), minimo }
    })
    setTacoMap(tMap)

    if (sids.length) {
      const results = await Promise.all(
        sids.map(id => supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle())
      )
      const rmap = {}
      sids.forEach((id, i) => { rmap[id] = results[i].data ?? null })
      setResumenes(rmap)
    }
    setLoading(false)
  }

  async function loadRangos(desde, hasta) {
    setLoadingRangos(true)
    const sids = sucursales.map(s => s.id)
    if (!sids.length) { setLoadingRangos(false); return }
    const { data } = await supabase.from('ventas_diarias')
      .select('sucursal_id, venta_total, pollos_vendidos')
      .in('sucursal_id', sids)
      .gte('fecha', desde).lte('fecha', hasta)
    const map = {}
    data?.forEach(r => {
      if (!map[r.sucursal_id]) map[r.sucursal_id] = { venta: 0, pollos: 0, dias: 0 }
      map[r.sucursal_id].venta  += r.venta_total
      map[r.sucursal_id].pollos += r.pollos_vendidos
      map[r.sucursal_id].dias   += 1
    })
    Object.keys(map).forEach(id => {
      const m  = map[id]
      m.ticket = m.pollos > 0 ? m.venta / m.pollos : 0
      m.promDia = m.dias > 0 ? m.venta / m.dias : 0
    })
    setRangos(map)
    setLoadingRangos(false)
  }

  const sucursalesFiltradas = useMemo(() => {
    if (filtroRuta === 'todas') return sucursales
    return sucursales.filter(s => (supSucMap[filtroRuta] ?? []).includes(s.id))
  }, [sucursales, filtroRuta, supSucMap])

  const esRango = filtroTiempo !== 'periodo'

  // Periodo aggregates
  const metaMensualTotal = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_mensual ?? 0), 0)
  const acumuladoTotal   = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_acumulada ?? 0), 0)
  const ventaHoyTotal    = sucursalesFiltradas.reduce((a, s) => a + (ventasHoy[s.id]?.venta_total ?? 0), 0)
  const metaSemTotal     = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_venta ?? 0), 0)
  const ventaSemTotal    = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_semana_actual ?? 0), 0)
  const avanceMes        = metaMensualTotal > 0 ? (acumuladoTotal / metaMensualTotal) * 100 : 0
  const avanceSem        = metaSemTotal > 0 ? (ventaSemTotal / metaSemTotal) * 100 : 0

  // Range aggregates
  const rangoVentaTotal  = sucursalesFiltradas.reduce((a, s) => a + (rangos[s.id]?.venta  ?? 0), 0)
  const rangoPollosTotal = sucursalesFiltradas.reduce((a, s) => a + (rangos[s.id]?.pollos ?? 0), 0)
  const rangoTicket      = rangoPollosTotal > 0 ? rangoVentaTotal / rangoPollosTotal : 0
  const fmtDif = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v))
  function calcMetaEsperada(res) {
    if (!res) return null
    const m = res.meta_mensual ?? 0
    const d = res.dias_totales || 30
    let v
    if (filtroTiempo === 'hoy')    v = d > 0 ? m / d : 0
    else if (filtroTiempo === 'semana') v = res.meta_venta ?? 0
    else if (filtroTiempo === 'mes')    v = m
    else if (filtroTiempo === 'custom' && customDesde && customHasta) {
      const dias = Math.round((new Date(customHasta + 'T00:00:00') - new Date(customDesde + 'T00:00:00')) / 86400000) + 1
      v = d > 0 ? m * (dias / d) : 0
    } else return null
    return v > 0 ? v : null
  }
  const totalMetaEsperada = sucursalesFiltradas.reduce((a, s) => a + (calcMetaEsperada(resumenes[s.id]) ?? 0), 0)
  const totalDiferencia   = rangoVentaTotal - totalMetaEsperada
  const avancePctRango    = totalMetaEsperada > 0 ? (rangoVentaTotal / totalMetaEsperada) * 100 : null

  const RANGO_LABELS = { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', custom: 'Personalizado' }
  const rangoLabel   = RANGO_LABELS[filtroTiempo] ?? ''
  const rutaLabel    = filtroRuta === 'todas' ? '' : (supervisores.find(s => s.id === filtroRuta)?.nombre ?? '')

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>

      {/* ── Ruta filter ── */}
      <div className={styles.filtroSection}>
        <p className={styles.filtroSectionLabel}>Ruta de hoy</p>
        <div className={styles.filtroRow}>
          <button
            className={`${styles.rutaBtn} ${filtroRuta === 'todas' ? styles.rutaBtnActive : ''}`}
            onClick={() => setFiltroRuta('todas')}>
            Todas
          </button>
          {supervisores.map(sup => (
            <button key={sup.id}
              className={`${styles.rutaBtn} ${filtroRuta === sup.id ? styles.rutaBtnActive : ''}`}
              onClick={() => setFiltroRuta(sup.id)}>
              {sup.nombre.replace('Ruta ', '')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Time filter ── */}
      <div className={styles.timeFilter}>
        {[
          { key: 'periodo', label: 'Periodo' },
          { key: 'hoy',    label: 'Hoy' },
          { key: 'semana', label: 'Semana' },
          { key: 'mes',    label: 'Mes' },
          { key: 'custom', label: 'Personalizado' },
        ].map(f => (
          <button key={f.key}
            className={`${styles.timePill} ${filtroTiempo === f.key ? styles.timePillActive : ''}`}
            onClick={() => setFiltroTiempo(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filtroTiempo === 'custom' && (
        <div className={styles.customRango}>
          <input className={styles.rangoDateInput} type="date"
            value={customDesde} onChange={e => setCustomDesde(e.target.value)} />
          <span className={styles.rangoSep}>—</span>
          <input className={styles.rangoDateInput} type="date"
            value={customHasta} min={customDesde} onChange={e => setCustomHasta(e.target.value)} />
        </div>
      )}

      {/* ── Hero card ── */}
      {!esRango ? (
        <div className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.heroLabel}>Meta mensual{rutaLabel ? ` — ${rutaLabel}` : ''}</p>
              <p className={styles.heroMeta}>{fmt(metaMensualTotal)}</p>
            </div>
            <div className={styles.heroPct}>
              <span className={styles.pctNum}>{avanceMes.toFixed(1)}</span>
              <span className={styles.pctSym}>%</span>
            </div>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>Mes</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${Math.min(avanceMes, 100)}%` }} />
            </div>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>Semana</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{
                width: `${Math.min(avanceSem, 100)}%`,
                background: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
              }} />
            </div>
            <span className={styles.barPct} style={{
              color: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
            }}>{avanceSem.toFixed(0)}%</span>
          </div>
          <div className={styles.heroBottom}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Acumulado</span>
              <span className={styles.heroStatVal}>{fmt(acumuladoTotal)}</span>
            </div>
            <div className={styles.heroDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Esta semana</span>
              <span className={styles.heroStatVal}>{fmt(ventaSemTotal)}</span>
            </div>
            <div className={styles.heroDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Hoy</span>
              <span className={styles.heroStatVal}>{fmt(ventaHoyTotal)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.rangoHeroCard}>
          <p className={styles.rangoHeroLabel}>{rangoLabel}{rutaLabel ? ` — ${rutaLabel}` : ''}</p>
          <div className={styles.rangoHeroTopRow}>
            <p className={styles.rangoHeroVenta} style={{ marginBottom: 0 }}>{fmt(rangoVentaTotal)}</p>
            {avancePctRango !== null && (
              <span className={styles.rangoHeroPct} style={{ color: avancePctRango >= 100 ? 'var(--success)' : avancePctRango >= 70 ? 'var(--yellow)' : 'var(--red)' }}>
                {avancePctRango.toFixed(0)}%
              </span>
            )}
          </div>
          {avancePctRango !== null && (
            <div className={styles.rangoBar}>
              <div className={styles.rangoBarFill} style={{
                width: `${Math.min(avancePctRango, 100)}%`,
                background: avancePctRango >= 100 ? 'var(--success)' : avancePctRango >= 70 ? 'var(--yellow)' : 'var(--red)'
              }} />
            </div>
          )}
          <div className={styles.rangoHeroStats}>
            <div className={styles.rangoHeroStat}>
              <span className={styles.rangoHeroStatLabel}>Meta esp.</span>
              <span className={styles.rangoHeroStatVal}>{totalMetaEsperada > 0 ? fmt(totalMetaEsperada) : '—'}</span>
            </div>
            <div className={styles.rangoHeroDivider} />
            <div className={styles.rangoHeroStat}>
              <span className={styles.rangoHeroStatLabel}>Diferencia</span>
              <span className={styles.rangoHeroStatVal} style={{ color: totalDiferencia >= 0 ? 'var(--success)' : 'var(--red)' }}>
                {totalMetaEsperada > 0 ? fmtDif(totalDiferencia) : '—'}
              </span>
            </div>
            <div className={styles.rangoHeroDivider} />
            <div className={styles.rangoHeroStat}>
              <span className={styles.rangoHeroStatLabel}>Pollos</span>
              <span className={styles.rangoHeroStatVal}>{fmtNum(rangoPollosTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <p className={styles.secTitle}>
        {sucursalesFiltradas.length} sucursal{sucursalesFiltradas.length !== 1 ? 'es' : ''}
        {rutaLabel ? ` — ${rutaLabel}` : ''}
      </p>

      {esRango && loadingRangos ? (
        <div className={styles.empty}>Cargando datos…</div>
      ) : (
        <div className={styles.cards}>
          {sucursalesFiltradas.map(s => {
            if (!esRango) {
              const res         = resumenes[s.id]
              const hv          = ventasHoy[s.id]
              const avanceMesSuc = res?.avance_porcentaje ?? 0
              const avanceSemSuc = res?.avance_semanal ?? 0
              let barColor = 'var(--text-muted)'
              let statusLabel = 'Sin meta'
              let StatusIcon = Clock
              if (res) {
                if (avanceMesSuc >= 100)       { barColor = 'var(--success)'; statusLabel = 'Meta cumplida'; StatusIcon = CheckCircle }
                else if (avanceMesSuc >= 70)   { barColor = 'var(--yellow)';  statusLabel = 'En camino';     StatusIcon = TrendingUp }
                else                           { barColor = 'var(--red)';     statusLabel = 'Por debajo';    StatusIcon = TrendingDown }
              }
              return (
                <div key={s.id} className={styles.sucCard} onClick={() => navigate(`/suplente/sucursal/${s.id}`)}>
                  <div className={styles.sucHeader}>
                    <div>
                      <p className={styles.sucNombre}>{s.nombre}</p>
                      <p className={styles.sucStatus} style={{ color: barColor, display:'flex', alignItems:'center', gap:4 }}>
                        <StatusIcon size={11} strokeWidth={2.5} />
                        {statusLabel}
                      </p>
                    </div>
                    <div className={styles.sucPct}>
                      {!res ? <span className={styles.noMeta}>—</span> : (
                        <>
                          <span className={styles.sucPctNum}>{avanceMesSuc.toFixed(0)}</span>
                          <span className={styles.sucPctSym}>%</span>
                        </>
                      )}
                    </div>
                  </div>
                  {res && (
                    <>
                      <div className={styles.sucBarRow}>
                        <span className={styles.sucBarLabel}>Mes</span>
                        <div className={styles.sucProgressTrack}>
                          <div className={styles.sucProgressFill} style={{ width:`${Math.min(avanceMesSuc,100)}%`, background:barColor }} />
                        </div>
                      </div>
                      <div className={styles.sucBarRow}>
                        <span className={styles.sucBarLabel}>Sem</span>
                        <div className={styles.sucProgressTrack}>
                          <div className={styles.sucProgressFill} style={{
                            width:`${Math.min(avanceSemSuc,100)}%`,
                            background: avanceSemSuc>=100?'var(--success)':avanceSemSuc>=70?'var(--yellow)':'var(--red)'
                          }} />
                        </div>
                        <span className={styles.sucBarPct} style={{
                          color: avanceSemSuc>=100?'var(--success)':avanceSemSuc>=70?'var(--yellow)':'var(--red)'
                        }}>{avanceSemSuc.toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                  <div className={styles.sucStats}>
                    <div className={styles.sucStat}>
                      <span className={styles.sucStatLabel}>Acumulado</span>
                      <span className={styles.sucStatVal}>{res ? fmt(res.venta_acumulada) : '—'}</span>
                    </div>
                    <div className={styles.sucStat}>
                      <span className={styles.sucStatLabel}>Meta mes</span>
                      <span className={styles.sucStatVal}>{res ? fmt(res.meta_mensual ?? res.meta_venta) : '—'}</span>
                    </div>
                    <div className={styles.sucStat}>
                      <span className={styles.sucStatLabel}>Hoy</span>
                      <span className={styles.sucStatVal} style={{ color: !hv ? 'var(--red)' : 'var(--success)' }}>
                        {!hv ? 'Sin reg.' : fmt(hv.venta_total)}
                      </span>
                    </div>
                  </div>
                  {tacoMap[s.id] && (
                    <div className={styles.tacoIndicator}>
                      <Utensils size={11} strokeWidth={2} color={tacoMap[s.id].deficit?'var(--red)':tacoMap[s.id].expirando?'var(--yellow)':'var(--info)'} />
                      <span className={styles.tacoLabel} style={{
                        color: tacoMap[s.id].deficit?'var(--red)':tacoMap[s.id].expirando?'var(--yellow)':'var(--text-muted)'
                      }}>
                        Taco: {tacoMap[s.id].stock} pollos
                        {tacoMap[s.id].deficit && ' — Déficit'}
                        {!tacoMap[s.id].deficit && tacoMap[s.id].expirando && ' — Caduca hoy'}
                      </span>
                    </div>
                  )}
                  <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" className={styles.sucArrow} />
                </div>
              )
            }

            // Range mode card
            const rango   = rangos[s.id]
            const hasData = rango && rango.venta > 0
            const metaEsp = calcMetaEsperada(resumenes[s.id])
            const dif     = (metaEsp !== null && hasData) ? rango.venta - metaEsp : null
            const pct     = (metaEsp !== null && metaEsp > 0 && hasData) ? (rango.venta / metaEsp) * 100 : null
            return (
              <div key={s.id} className={styles.sucCard} onClick={() => navigate(`/suplente/sucursal/${s.id}`)}>
                <div className={styles.sucRangoHeader}>
                  <p className={styles.sucNombre}>{s.nombre}</p>
                  <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                    <p className={styles.sucRangoVenta} style={{ color: hasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {hasData ? fmt(rango.venta) : 'Sin datos'}
                    </p>
                    {pct !== null && (
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', fontWeight:600, color: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)' }}>
                        {pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className={styles.rangoBar}>
                    <div className={styles.rangoBarFill} style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)'
                    }} />
                  </div>
                )}
                {hasData && (
                  <>
                    {metaEsp !== null && (
                      <div className={styles.rangoMetaRow}>
                        <span className={styles.rangoMetaLabel}>Meta esp.</span>
                        <span className={styles.rangoMetaVal}>{fmt(metaEsp)}</span>
                        <span className={styles.rangoMetaDif} style={{ color: dif >= 0 ? 'var(--success)' : 'var(--red)' }}>
                          {fmtDif(dif)}
                        </span>
                      </div>
                    )}
                    <div className={styles.rangoStats}>
                      <div className={styles.rangoStat}>
                        <span className={styles.rangoStatLabel}>Pollos</span>
                        <span className={styles.rangoStatVal}>{fmtNum(rango.pollos)}</span>
                      </div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}>
                        <span className={styles.rangoStatLabel}>Ticket</span>
                        <span className={styles.rangoStatVal}>{fmtDec(rango.ticket)}</span>
                      </div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}>
                        <span className={styles.rangoStatLabel}>Días</span>
                        <span className={styles.rangoStatVal}>{rango.dias}</span>
                      </div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}>
                        <span className={styles.rangoStatLabel}>Prom/día</span>
                        <span className={styles.rangoStatVal}>{fmt(rango.promDia)}</span>
                      </div>
                    </div>
                  </>
                )}
                <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" className={styles.sucArrow} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
