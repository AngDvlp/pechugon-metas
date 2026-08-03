import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, addDays, startOfWeek, startOfMonth } from 'date-fns'
import {
  ChevronRight, TrendingUp, TrendingDown,
  CheckCircle, Clock, Utensils, Search, X, AlertTriangle
} from 'lucide-react'
import styles from './Dashboard.module.css'
import { getCached, setCached } from '../../lib/pageCache'
import PageSkeleton from '../../components/PageSkeleton'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

function calcPace(res) {
  if (!res || !res.meta_mensual) return null
  const meta = res.meta_mensual
  const acumulado = res.venta_acumulada ?? 0
  const hoyD = new Date()
  const diaActual = hoyD.getDate()
  const diasEnMes = new Date(hoyD.getFullYear(), hoyD.getMonth() + 1, 0).getDate()
  const diasRestantes = diasEnMes - diaActual
  const paceEsperadoPct = (diaActual / diasEnMes) * 100
  const avancePct = meta > 0 ? (acumulado / meta) * 100 : 0
  const onTrack = avancePct >= paceEsperadoPct * 0.92
  const falta = Math.max(0, meta - acumulado)
  const necesitaPorDia = diasRestantes > 0 ? falta / diasRestantes : 0
  return { onTrack, necesitaPorDia, diasRestantes }
}

export default function SupervisorDashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [sucursales,    setSucursales]    = useState([])
  const [resumenes,     setResumenes]     = useState({})
  const [ventasHoy,     setVentasHoy]     = useState({})
  const [tacoMap,       setTacoMap]       = useState({})
  const [minimosMap,    setMinimosMap]    = useState({})
  const [rangos,        setRangos]        = useState({})
  const [loadingRangos, setLoadingRangos] = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [filtroTiempo,  setFiltroTiempo]  = useState('periodo')
  const [customDesde,   setCustomDesde]   = useState('')
  const [customHasta,   setCustomHasta]   = useState('')
  const [busqueda,      setBusqueda]      = useState('')
  const [ordenarPor,    setOrdenarPor]    = useState('default')
  const hoy    = format(new Date(), 'yyyy-MM-dd')
  const manana = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  useEffect(() => {
    if (!usuario?.id) return
    const KEY = `sup-dash-${usuario.id}`
    const cached = getCached(KEY)
    if (cached) {
      applyData(cached)
      setLoading(false)
      load(true)
    } else {
      load()
    }
  }, [usuario])

  function applyData(d) {
    setSucursales(d.sucursales)
    setVentasHoy(d.ventasHoy)
    setResumenes(d.resumenes)
    setMinimosMap(d.minimosMap)
    setTacoMap(d.tacoMap)
  }

  useEffect(() => {
    if (filtroTiempo === 'periodo' || !sucursales.length) return
    const hoyD = new Date()
    let desde, hasta
    if (filtroTiempo === 'hoy')   { desde = hasta = format(hoyD, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'semana') { desde = format(startOfWeek(hoyD, { weekStartsOn: 1 }), 'yyyy-MM-dd'); hasta = format(hoyD, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'mes')    { desde = format(startOfMonth(hoyD), 'yyyy-MM-dd'); hasta = format(hoyD, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'custom' && customDesde && customHasta) { desde = customDesde; hasta = customHasta }
    else return
    loadRangos(desde, hasta)
  }, [filtroTiempo, customDesde, customHasta, sucursales.length])

  async function load(bg = false) {
    if (!bg) setLoading(true)
    const rutaId = usuario?.ruta_id
    if (!rutaId) { setSucursales([]); setLoading(false); return }
    const { data: rs } = await supabase
      .from('ruta_sucursales')
      .select('sucursal_id, sucursales(id, nombre)')
      .eq('ruta_id', rutaId)
    const sids = rs?.map(s => s.sucursal_id) ?? []
    const sucs = rs?.map(s => s.sucursales).filter(Boolean) ?? []
    if (sids.length === 0) { setSucursales(sucs); setLoading(false); return }
    const [{ data: hoyData }, { data: tacoLotes }, { data: minimos }, ...resResults] = await Promise.all([
      supabase.from('ventas_diarias').select('*').in('sucursal_id', sids).eq('fecha', hoy),
      supabase.from('pollos_taco').select('*').in('sucursal_id', sids),
      supabase.from('pollos_taco_minimos').select('*').in('sucursal_id', sids),
      ...sids.map(id => supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle())
    ])
    const hoyMap = {}
    hoyData?.forEach(v => { hoyMap[v.sucursal_id] = v })
    const resMap = {}
    sids.forEach((id, i) => { resMap[id] = resResults[i].data ?? null })
    const mMap = {}
    minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })
    const tMap = {}
    sids.forEach(id => {
      const lotes    = tacoLotes?.filter(l => l.sucursal_id === id) ?? []
      const vigentes = lotes.filter(l => l.fecha_caducidad > hoy)
      const stock    = vigentes.reduce((a, l) => a + l.cantidad, 0)
      const minimo   = mMap[id] ?? 0
      tMap[id] = { stock, deficit: minimo > 0 && stock < minimo, expirando: vigentes.some(l => l.fecha_caducidad === manana), minimo }
    })
    const d = { sucursales: sucs, ventasHoy: hoyMap, resumenes: resMap, minimosMap: mMap, tacoMap: tMap }
    applyData(d)
    setCached(`sup-dash-${usuario.id}`, d)
    setLoading(false)
  }

  async function loadRangos(desde, hasta) {
    setLoadingRangos(true)
    const sids = sucursales.map(s => s.id)
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
      const m = map[id]
      m.ticket  = m.pollos > 0 ? m.venta / m.pollos : 0
      m.promDia = m.dias   > 0 ? m.venta / m.dias   : 0
    })
    setRangos(map)
    setLoadingRangos(false)
  }

  const esRango          = filtroTiempo !== 'periodo'
  const fmtDec           = v => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', minimumFractionDigits:2, maximumFractionDigits:2 }).format(v ?? 0)
  const fmtDif           = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v))
  const rangoVentaTotal  = sucursales.reduce((a, s) => a + (rangos[s.id]?.venta  ?? 0), 0)
  const rangoPollosTotal = sucursales.reduce((a, s) => a + (rangos[s.id]?.pollos ?? 0), 0)
  const RANGO_LABELS     = { hoy:'Hoy', semana:'Esta semana', mes:'Este mes', custom:'Personalizado' }

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

  const totalMetaEsperada = sucursales.reduce((a, s) => a + (calcMetaEsperada(resumenes[s.id]) ?? 0), 0)
  const totalDiferencia   = rangoVentaTotal - totalMetaEsperada
  const avancePctRango    = totalMetaEsperada > 0 ? (rangoVentaTotal / totalMetaEsperada) * 100 : null
  const metaMensualTotal  = Object.values(resumenes).reduce((a, r) => a + (r?.meta_mensual ?? 0), 0)
  const acumuladoTotal    = Object.values(resumenes).reduce((a, r) => a + (r?.venta_acumulada ?? 0), 0)
  const ventaHoyTotal     = Object.values(ventasHoy).reduce((a, v) => a + (v?.venta_total ?? 0), 0)
  const metaSemanalTotal  = Object.values(resumenes).reduce((a, r) => a + (r?.meta_venta ?? 0), 0)
  const ventaSemanaTotal  = Object.values(resumenes).reduce((a, r) => a + (r?.venta_semana_actual ?? 0), 0)
  const avanceMes = metaMensualTotal > 0 ? (acumuladoTotal / metaMensualTotal) * 100 : 0
  const avanceSem = metaSemanalTotal > 0 ? (ventaSemanaTotal / metaSemanalTotal) * 100 : 0

  // Filter + sort
  const sucursalesFiltradas = sucursales
    .filter(s => s.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      if (ordenarPor === 'ranking') return (resumenes[b.id]?.avance_porcentaje ?? 0) - (resumenes[a.id]?.avance_porcentaje ?? 0)
      if (ordenarPor === 'riesgo')  return (resumenes[a.id]?.avance_porcentaje ?? 100) - (resumenes[b.id]?.avance_porcentaje ?? 100)
      if (ordenarPor === 'sinreg')  return (ventasHoy[a.id] ? 1 : 0) - (ventasHoy[b.id] ? 1 : 0)
      return 0
    })

  const sinRegistroHoy = sucursales.filter(s => !ventasHoy[s.id]).length
  const enRiesgo       = sucursales.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje < 70).length
  const enCamino       = sucursales.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje >= 70 && resumenes[s.id].avance_porcentaje < 100).length

  if (loading) return <PageSkeleton rows={5} />

  return (
    <div className={styles.page}>
      {/* ── Time filter ── */}
      <div className={styles.timeFilter}>
        {[
          { key: 'periodo', label: 'Periodo' },
          { key: 'hoy',     label: 'Hoy' },
          { key: 'semana',  label: 'Semana' },
          { key: 'mes',     label: 'Mes' },
          { key: 'custom',  label: 'Personalizado' },
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

      {/* ── Range hero card ── */}
      {esRango && (
        <div className={styles.rangoHeroCard}>
          <p className={styles.rangoHeroLabel}>{RANGO_LABELS[filtroTiempo] ?? ''}</p>
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

      {/* ── Periodo hero card ── */}
      {!esRango && (
        <div className={styles.supervisorCard}>
          <div className={styles.supTop}>
            <div>
              <p className={styles.supLabel}>Meta mensual</p>
              <p className={styles.supMeta}>{fmt(metaMensualTotal)}</p>
            </div>
            <div className={styles.supPct}>
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
          <div className={styles.supBottom}>
            <div className={styles.supStat}>
              <span className={styles.supStatLabel}>Acumulado</span>
              <span className={styles.supStatVal}>{fmt(acumuladoTotal)}</span>
            </div>
            <div className={styles.supDivider} />
            <div className={styles.supStat}>
              <span className={styles.supStatLabel}>Esta semana</span>
              <span className={styles.supStatVal}>{fmt(ventaSemanaTotal)}</span>
            </div>
            <div className={styles.supDivider} />
            <div className={styles.supStat}>
              <span className={styles.supStatLabel}>Hoy</span>
              <span className={styles.supStatVal}>{fmt(ventaHoyTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Status chips ── */}
      {!esRango && sucursales.length > 0 && (
        <div className={styles.statusChips}>
          {sinRegistroHoy > 0 && (
            <div className={`${styles.statusChip} ${styles.statusChipDanger}`}>
              <AlertTriangle size={11} strokeWidth={2.5} />
              {sinRegistroHoy} sin registro
            </div>
          )}
          {enRiesgo > 0 && (
            <div className={`${styles.statusChip} ${styles.statusChipWarn}`}>
              <TrendingDown size={11} strokeWidth={2.5} />
              {enRiesgo} por debajo
            </div>
          )}
          {enCamino > 0 && (
            <div className={`${styles.statusChip} ${styles.statusChipInfo}`}>
              <TrendingUp size={11} strokeWidth={2.5} />
              {enCamino} en camino
            </div>
          )}
        </div>
      )}

      {/* ── Search + Sort ── */}
      <div className={styles.controlsWrap}>
        <div className={styles.searchBox}>
          <Search size={14} strokeWidth={2} color="var(--text-muted)" />
          <input
            className={styles.searchInputField}
            type="text"
            placeholder="Buscar sucursal…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button className={styles.searchClear} onClick={() => setBusqueda('')}>
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className={styles.ordenRow}>
          {[
            { key: 'default', label: 'Posición' },
            { key: 'ranking', label: 'Ranking' },
            { key: 'riesgo',  label: 'En riesgo' },
            { key: 'sinreg',  label: 'Sin registro' },
          ].map(o => (
            <button key={o.key}
              className={`${styles.ordenBtn} ${ordenarPor === o.key ? styles.ordenBtnActive : ''}`}
              onClick={() => setOrdenarPor(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.secTitle}>
        {sucursalesFiltradas.length} sucursal{sucursalesFiltradas.length !== 1 ? 'es' : ''}
        {ordenarPor === 'ranking' ? ' — mejor avance primero' : ordenarPor === 'riesgo' ? ' — en riesgo primero' : ordenarPor === 'sinreg' ? ' — sin registro primero' : ''}
      </p>
      {sucursales.length === 0 && <div className={styles.empty}>No tienes sucursales asignadas</div>}

      {esRango && loadingRangos ? (
        <div className={styles.empty}>Cargando datos…</div>
      ) : (
        <div className={styles.cards}>
          {sucursalesFiltradas.map((s, idx) => {
            if (!esRango) {
              const res = resumenes[s.id]
              const hv = ventasHoy[s.id]
              const avanceMesSuc = res?.avance_porcentaje ?? 0
              const avanceSemSuc = res?.avance_semanal ?? 0
              const pace = calcPace(res)
              let barColor = 'var(--text-muted)'
              let statusLabel = 'Sin meta'
              let StatusIcon = Clock
              if (res) {
                if (avanceMesSuc >= 100) { barColor = 'var(--success)'; statusLabel = 'Meta cumplida'; StatusIcon = CheckCircle }
                else if (avanceMesSuc >= 70) { barColor = 'var(--yellow)'; statusLabel = 'En camino'; StatusIcon = TrendingUp }
                else { barColor = 'var(--red)'; statusLabel = 'Por debajo'; StatusIcon = TrendingDown }
              }
              const showRank = ordenarPor === 'ranking'
              return (
                <div key={s.id} className={styles.sucCard} onClick={() => navigate(`/supervisor/sucursal/${s.id}`)}>
                  {showRank && (
                    <div className={styles.rankBadge} style={{
                      color: idx === 0 ? '#F5C400' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'var(--text-muted)',
                      borderColor: idx === 0 ? 'rgba(245,196,0,0.35)' : idx === 1 ? 'rgba(192,192,192,0.25)' : idx === 2 ? 'rgba(205,127,50,0.3)' : 'var(--border)',
                      background: idx === 0 ? 'rgba(245,196,0,0.1)' : idx === 1 ? 'rgba(192,192,192,0.07)' : idx === 2 ? 'rgba(205,127,50,0.08)' : 'transparent',
                    }}>#{idx + 1}</div>
                  )}
                  <div className={styles.sucHeader}>
                    <div>
                      <p className={styles.sucNombre}>{s.nombre}</p>
                      <p className={styles.sucStatus} style={{ color: barColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StatusIcon size={11} strokeWidth={2.5} />
                        {statusLabel}
                      </p>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      {!hv && <span className={styles.sinRegBadge}>Sin reg.</span>}
                      <div className={styles.sucPct}>
                        {!res ? <span className={styles.noMeta}>—</span> : (
                          <>
                            <span className={styles.sucPctNum}>{avanceMesSuc.toFixed(0)}</span>
                            <span className={styles.sucPctSym}>%</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {res && (
                    <>
                      <div className={styles.sucBarRow}>
                        <span className={styles.sucBarLabel}>Mes</span>
                        <div className={styles.sucProgressTrack}>
                          <div className={styles.sucProgressFill} style={{ width: `${Math.min(avanceMesSuc, 100)}%`, background: barColor }} />
                        </div>
                      </div>
                      <div className={styles.sucBarRow}>
                        <span className={styles.sucBarLabel}>Sem</span>
                        <div className={styles.sucProgressTrack}>
                          <div className={styles.sucProgressFill} style={{
                            width: `${Math.min(avanceSemSuc, 100)}%`,
                            background: avanceSemSuc >= 100 ? 'var(--success)' : avanceSemSuc >= 70 ? 'var(--yellow)' : 'var(--red)'
                          }} />
                        </div>
                        <span className={styles.sucBarPct} style={{
                          color: avanceSemSuc >= 100 ? 'var(--success)' : avanceSemSuc >= 70 ? 'var(--yellow)' : 'var(--red)'
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
                        {!hv ? 'Sin registro' : fmt(hv.venta_total)}
                      </span>
                    </div>
                  </div>
                  {pace && (
                    <div className={styles.paceStrip} style={{ color: pace.onTrack ? 'var(--success)' : 'var(--red)' }}>
                      {pace.onTrack
                        ? <><TrendingUp size={11} strokeWidth={2.5} /> En ritmo para la meta</>
                        : <><AlertTriangle size={11} strokeWidth={2.5} /> Necesita {fmt(pace.necesitaPorDia)}/día · {pace.diasRestantes} días restantes</>
                      }
                    </div>
                  )}
                  {tacoMap[s.id] && (
                    <div className={styles.tacoIndicator}>
                      <Utensils size={11} strokeWidth={2} color={tacoMap[s.id].deficit ? 'var(--red)' : tacoMap[s.id].expirando ? 'var(--yellow)' : 'var(--info)'} />
                      <span className={styles.tacoLabel} style={{
                        color: tacoMap[s.id].deficit ? 'var(--red)' : tacoMap[s.id].expirando ? 'var(--yellow)' : 'var(--text-muted)'
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
              <div key={s.id} className={styles.sucCard} onClick={() => navigate(`/supervisor/sucursal/${s.id}`)}>
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
                      <div className={styles.rangoStat}><span className={styles.rangoStatLabel}>Pollos</span><span className={styles.rangoStatVal}>{fmtNum(rango.pollos)}</span></div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}><span className={styles.rangoStatLabel}>Ticket</span><span className={styles.rangoStatVal}>{fmtDec(rango.ticket)}</span></div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}><span className={styles.rangoStatLabel}>Días</span><span className={styles.rangoStatVal}>{rango.dias}</span></div>
                      <div className={styles.rangoStatDiv} />
                      <div className={styles.rangoStat}><span className={styles.rangoStatLabel}>Prom/día</span><span className={styles.rangoStatVal}>{fmt(rango.promDia)}</span></div>
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
