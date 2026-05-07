import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import {
  Target, Store, Users, TrendingUp, TrendingDown,
  Search, X, ChevronRight, AlertTriangle, CheckCircle, Clock
} from 'lucide-react'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function GerenteDashboard() {
  const navigate = useNavigate()
  const [sucursales,    setSucursales]    = useState([])
  const [resumenes,     setResumenes]     = useState({})
  const [supervisores,  setSupervisores]  = useState([])
  const [supSucMap,     setSupSucMap]     = useState({})
  const [rangos,        setRangos]        = useState({})
  const [loadingRangos, setLoadingRangos] = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [busqueda,      setBusqueda]      = useState('')
  const [filtroSup,     setFiltroSup]     = useState('todos')
  const [filtroTiempo,  setFiltroTiempo]  = useState('periodo')
  const [customDesde,   setCustomDesde]   = useState('')
  const [customHasta,   setCustomHasta]   = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (filtroTiempo === 'periodo' || !sucursales.length) return
    const hoy = new Date()
    let desde, hasta
    if (filtroTiempo === 'hoy')   { desde = hasta = format(hoy, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'semana') { desde = format(startOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'); hasta = format(hoy, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'mes')    { desde = format(startOfMonth(hoy), 'yyyy-MM-dd'); hasta = format(hoy, 'yyyy-MM-dd') }
    else if (filtroTiempo === 'custom' && customDesde && customHasta) { desde = customDesde; hasta = customHasta }
    else return
    loadRangos(desde, hasta)
  }, [filtroTiempo, customDesde, customHasta, sucursales.length])

  async function load() {
    setLoading(true)
    try {
      const [{ data: sucs }, { data: sups }, { data: ss }] = await Promise.all([
        supabase.from('sucursales').select('*').eq('activa', true).order('nombre'),
        supabase.from('usuarios').select('id, nombre, roles!inner(nombre)').eq('roles.nombre', 'supervisor'),
        supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id'),
      ])
      setSucursales(sucs ?? [])
      setSupervisores(sups ?? [])
      const map = {}
      ss?.forEach(r => {
        if (!map[r.supervisor_id]) map[r.supervisor_id] = []
        map[r.supervisor_id].push(r.sucursal_id)
      })
      setSupSucMap(map)
      if (sucs?.length) {
        const results = await Promise.all(
          sucs.map(s => supabase.rpc('resumen_sucursal', { p_sucursal_id: s.id }).maybeSingle())
        )
        const rmap = {}
        sucs.forEach((s, i) => { rmap[s.id] = results[i].data ?? null })
        setResumenes(rmap)
      }
    } catch (e) {
      console.error('Error loading gerente dashboard:', e)
    } finally {
      setLoading(false)
    }
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

  const esRango = filtroTiempo !== 'periodo'
  const fmtDec  = v => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', minimumFractionDigits:2, maximumFractionDigits:2 }).format(v ?? 0)
  const RANGO_LABELS = { hoy:'Hoy', semana:'Esta semana', mes:'Este mes', custom:'Personalizado' }

  const sucursalesFiltradas = sucursales.filter(s => {
    const matchBusqueda = s.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchSup = filtroSup === 'todos' || (supSucMap[filtroSup] ?? []).includes(s.id)
    return matchBusqueda && matchSup
  })

  const totalMeta = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_mensual ?? 0), 0)
  const totalAcumulado = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_acumulada ?? 0), 0)
  const totalPollos = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.pollos_totales ?? 0), 0)
  const avanceGlobal = totalMeta > 0 ? (totalAcumulado / totalMeta) * 100 : 0
  const encaminadas = sucursalesFiltradas.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje >= 70).length
  const metaSemanalGrupo = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_venta ?? 0), 0)
  const ventaSemanaGrupo = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_semana_actual ?? 0), 0)
  const avanceSemanalGrupo = metaSemanalGrupo > 0 ? (ventaSemanaGrupo / metaSemanalGrupo) * 100 : 0
  const supSeleccionado = supervisores.find(s => s.id === filtroSup)

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

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* ── Periodo KPI card ── */}
      {!esRango && <div className={styles.globalCard}>
        <div className={styles.globalTop}>
          <div>
            <p className={styles.globalLabel}>
              {filtroSup === 'todos' ? 'Meta mensual global' : supSeleccionado?.nombre ?? 'Meta'}
            </p>
            <p className={styles.globalMeta}>{fmt(totalMeta)}</p>
          </div>
          <div className={styles.globalPct}>
            <span className={styles.pctNum}>{avanceGlobal.toFixed(1)}</span>
            <span className={styles.pctSym}>%</span>
          </div>
        </div>
        <div className={styles.globalTrack}>
          <div className={styles.globalFill} style={{ width: `${Math.min(avanceGlobal, 100)}%` }} />
        </div>
        <div className={styles.semRow}>
          <span className={styles.semLabel}>Semana actual</span>
          <div className={styles.semTrack}>
            <div className={styles.semFill} style={{
              width: `${Math.min(avanceSemanalGrupo, 100)}%`,
              background: avanceSemanalGrupo >= 100 ? 'var(--success)' : avanceSemanalGrupo >= 70 ? 'var(--yellow)' : 'var(--red)'
            }} />
          </div>
          <span className={styles.semPct} style={{
            color: avanceSemanalGrupo >= 100 ? 'var(--success)' : avanceSemanalGrupo >= 70 ? 'var(--yellow)' : 'var(--red)'
          }}>{avanceSemanalGrupo.toFixed(0)}%</span>
        </div>
        <div className={styles.kpiRow}>
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmt(totalAcumulado)}</span>
            <span className={styles.kpiLabel}>Acumulado</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmt(ventaSemanaGrupo)}</span>
            <span className={styles.kpiLabel}>Esta semana</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal} style={{ color: 'var(--success)' }}>{encaminadas}</span>
            <span className={styles.kpiLabel}>Encaminadas</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmtNum(totalPollos)}</span>
            <span className={styles.kpiLabel}>Pollos</span>
          </div>
        </div>
      </div>}

      {/* ── Range KPI card ── */}
      {esRango && (
        <div className={styles.rangoGlobalCard}>
          <p className={styles.rangoGlobalLabel}>{RANGO_LABELS[filtroTiempo] ?? ''}{supSeleccionado ? ` — ${supSeleccionado.nombre}` : ''}</p>
          <div className={styles.rangoHeroTopRow}>
            <p className={styles.rangoGlobalVenta} style={{ marginBottom: 0 }}>{fmt(rangoVentaTotal)}</p>
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
          <div className={styles.rangoKpiRow}>
            <div className={styles.rangoKpi}>
              <span className={styles.rangoKpiLabel}>Meta esp.</span>
              <span className={styles.rangoKpiVal}>{totalMetaEsperada > 0 ? fmt(totalMetaEsperada) : '—'}</span>
            </div>
            <div className={styles.rangoKpiDivider} />
            <div className={styles.rangoKpi}>
              <span className={styles.rangoKpiLabel}>Diferencia</span>
              <span className={styles.rangoKpiVal} style={{ color: totalDiferencia >= 0 ? 'var(--success)' : 'var(--red)' }}>
                {totalMetaEsperada > 0 ? fmtDif(totalDiferencia) : '—'}
              </span>
            </div>
            <div className={styles.rangoKpiDivider} />
            <div className={styles.rangoKpi}>
              <span className={styles.rangoKpiLabel}>Pollos</span>
              <span className={styles.rangoKpiVal}>{fmtNum(rangoPollosTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className={styles.acciones}>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/metas')}>
          <Target size={20} strokeWidth={1.75} />
          <span>Metas</span>
        </button>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/sucursales')}>
          <Store size={20} strokeWidth={1.75} />
          <span>Sucursales</span>
        </button>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/usuarios')}>
          <Users size={20} strokeWidth={1.75} />
          <span>Usuarios</span>
        </button>
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

      {/* Filtro supervisor */}
      <div className={styles.filtroRow}>
        <button className={`${styles.filtroBtn} ${filtroSup === 'todos' ? styles.filtroBtnActive : ''}`}
          onClick={() => setFiltroSup('todos')}>Todas</button>
        {supervisores.map(sup => (
          <button key={sup.id}
            className={`${styles.filtroBtn} ${filtroSup === sup.id ? styles.filtroBtnActive : ''}`}
            onClick={() => setFiltroSup(sup.id)}>
            {sup.nombre.replace('Ruta ', '')}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className={styles.searchWrap}>
        <Search size={15} strokeWidth={2} color="var(--text-muted)" />
        <input className={styles.searchInput} type="text" placeholder="Buscar sucursal…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {busqueda && (
          <button className={styles.clearBtn} onClick={() => setBusqueda('')}>
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <p className={styles.secTitle}>
        {sucursalesFiltradas.length} sucursal{sucursalesFiltradas.length !== 1 ? 'es' : ''}
        {filtroSup !== 'todos' && supSeleccionado ? ` — ${supSeleccionado.nombre}` : ''}
      </p>

      {/* Lista sucursales */}
      {esRango && loadingRangos ? (
        <div className={styles.empty}>Cargando datos…</div>
      ) : (
        <div className={styles.sucList}>
          {sucursalesFiltradas.length === 0 && (
            <div className={styles.noResults}>Sin resultados</div>
          )}
          {sucursalesFiltradas.map(s => {
            if (!esRango) {
              const r = resumenes[s.id]
              const avanceMes = r?.avance_porcentaje ?? 0
              const avanceSem = r?.avance_semanal ?? 0
              let barColor = 'var(--text-muted)'
              let StatusIcon = Clock
              let statusTag = 'Sin meta'
              let tagClass = styles.tagNeutral
              if (r) {
                if (avanceMes >= 100) { barColor = 'var(--success)'; statusTag = 'Cumplida'; tagClass = styles.tagOk; StatusIcon = CheckCircle }
                else if (avanceMes >= 70) { barColor = 'var(--yellow)'; statusTag = 'En camino'; tagClass = styles.tagWarn; StatusIcon = TrendingUp }
                else { barColor = 'var(--red)'; statusTag = 'En riesgo'; tagClass = styles.tagDanger; StatusIcon = AlertTriangle }
              }
              return (
                <div key={s.id} className={styles.sucRow} onClick={() => navigate(`/gerente/sucursal/${s.id}`)}>
                  <div className={styles.sucInfo}>
                    <div className={styles.sucNombreRow}>
                      <p className={styles.sucNombre}>{s.nombre}</p>
                      <div className={styles.sucNombreRight}>
                        <span className={`${styles.tag} ${tagClass}`}>
                          <StatusIcon size={10} strokeWidth={2.5} />
                          {statusTag}
                        </span>
                        <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" />
                      </div>
                    </div>
                    {r && (
                      <>
                        <div className={styles.sucTrackWrap}>
                          <span className={styles.sucTrackLabel}>Mes</span>
                          <div className={styles.sucTrack}>
                            <div className={styles.sucFill} style={{ width: `${Math.min(avanceMes, 100)}%`, background: barColor }} />
                          </div>
                          <span className={styles.sucPct} style={{ color: barColor }}>{avanceMes.toFixed(0)}%</span>
                        </div>
                        <div className={styles.sucTrackWrap}>
                          <span className={styles.sucTrackLabel}>Sem</span>
                          <div className={styles.sucTrack}>
                            <div className={styles.sucFill} style={{
                              width: `${Math.min(avanceSem, 100)}%`,
                              background: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
                            }} />
                          </div>
                          <span className={styles.sucPct} style={{
                            color: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
                          }}>{avanceSem.toFixed(0)}%</span>
                        </div>
                      </>
                    )}
                    <div className={styles.sucNums}>
                      <span>{r ? fmt(r.venta_acumulada) : '—'}</span>
                      <span className={styles.de}>de</span>
                      <span>{r ? fmt(r.meta_mensual ?? r.meta_venta) : '—'}</span>
                    </div>
                  </div>
                </div>
              )
            }

            // Range mode row
            const rango   = rangos[s.id]
            const hasData = rango && rango.venta > 0
            const metaEsp = calcMetaEsperada(resumenes[s.id])
            const dif     = (metaEsp !== null && hasData) ? rango.venta - metaEsp : null
            const pct     = (metaEsp !== null && metaEsp > 0 && hasData) ? (rango.venta / metaEsp) * 100 : null
            return (
              <div key={s.id} className={styles.sucRow} onClick={() => navigate(`/gerente/sucursal/${s.id}`)}>
                <div className={styles.sucInfo}>
                  <div className={styles.sucRangoRow}>
                    <p className={styles.sucNombre}>{s.nombre}</p>
                    <div style={{ display:'flex', alignItems:'baseline', gap:5, flexShrink:0 }}>
                      <p className={styles.sucRangoVenta} style={{ color: hasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {hasData ? fmt(rango.venta) : 'Sin datos'}
                      </p>
                      {pct !== null && (
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', fontWeight:600, color: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)' }}>
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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
                      <div className={styles.rangoMiniStats}>
                        <div className={styles.rangoMiniStat}>
                          <span className={styles.rangoMiniLabel}>Pollos</span>
                          <span className={styles.rangoMiniVal}>{fmtNum(rango.pollos)}</span>
                        </div>
                        <div className={styles.rangoMiniStat}>
                          <span className={styles.rangoMiniLabel}>Ticket</span>
                          <span className={styles.rangoMiniVal}>{fmtDec(rango.ticket)}</span>
                        </div>
                        <div className={styles.rangoMiniStat}>
                          <span className={styles.rangoMiniLabel}>Días</span>
                          <span className={styles.rangoMiniVal}>{rango.dias}</span>
                        </div>
                        <div className={styles.rangoMiniStat}>
                          <span className={styles.rangoMiniLabel}>Prom/día</span>
                          <span className={styles.rangoMiniVal}>{fmt(rango.promDia)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
