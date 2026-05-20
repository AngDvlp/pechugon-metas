import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import styles from './Reporte.module.css'

const fmt    = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0)
const pctColor = p => p == null ? 'var(--text-muted)' : p >= 95 ? 'var(--success)' : p >= 75 ? 'var(--yellow)' : 'var(--red)'
const pctBg   = p => p == null ? 'transparent' : p >= 95 ? 'rgba(0,211,149,0.08)' : p >= 75 ? 'rgba(245,196,0,0.08)' : 'rgba(232,25,44,0.08)'

export default function ReporteAvance() {
  const { usuario, rol } = useAuth()
  const navigate  = useNavigate()
  const basePath  = rol === 'supervisor' ? '/supervisor' : rol === 'suplente' ? '/suplente' : '/gerente'
  const hoyStr    = format(new Date(), 'yyyy-MM-dd')
  const inicioSem = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [sucursales,  setSucursales]  = useState([])
  const [rutas,       setRutas]       = useState([])
  const [rutaSucMap,  setRutaSucMap]  = useState({})
  const [resumenes,   setResumenes]   = useState({})
  const [ventasHoy,   setVentasHoy]   = useState({})
  const [ventasSem,   setVentasSem]   = useState({})
  const [ventasRango, setVentasRango] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [loadingRng,  setLoadingRng]  = useState(false)

  const [filtro,      setFiltro]      = useState('mes')
  const [filtroRuta,  setFiltroRuta]  = useState('todas')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [sortCol,     setSortCol]     = useState('nombre')
  const [sortDir,     setSortDir]     = useState('asc')

  useEffect(() => { load() }, [usuario])

  useEffect(() => {
    if (filtro !== 'custom') return
    if (customDesde && customHasta && customDesde <= customHasta) loadRango(customDesde, customHasta)
  }, [filtro, customDesde, customHasta])

  async function load() {
    if (!usuario) return
    setLoading(true)
    try {
      let sucs = []
      if (rol === 'supervisor') {
        const { data } = await supabase
          .from('supervisor_sucursales')
          .select('sucursal_id, sucursales(id, nombre)')
          .eq('supervisor_id', usuario.id)
        sucs = data?.map(r => r.sucursales).filter(Boolean) ?? []
      } else {
        const { data } = await supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
        sucs = data ?? []
      }
      setSucursales(sucs)

      const [{ data: rutasData }, { data: rs }] = await Promise.all([
        supabase.from('rutas').select('id, nombre').eq('activa', true).order('nombre'),
        supabase.from('ruta_sucursales').select('ruta_id, sucursal_id'),
      ])
      setRutas(rutasData ?? [])
      const rMap = {}
      rs?.forEach(r => { if (!rMap[r.ruta_id]) rMap[r.ruta_id] = []; rMap[r.ruta_id].push(r.sucursal_id) })
      setRutaSucMap(rMap)

      if (!sucs.length) { setLoading(false); return }
      const sids = sucs.map(s => s.id)

      const [results, { data: hoyData }, { data: semData }] = await Promise.all([
        Promise.all(sids.map(id => supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle())),
        supabase.from('ventas_diarias').select('sucursal_id, venta_total, pollos_vendidos').in('sucursal_id', sids).eq('fecha', hoyStr),
        supabase.from('ventas_diarias').select('sucursal_id, venta_total, pollos_vendidos').in('sucursal_id', sids).gte('fecha', inicioSem).lte('fecha', hoyStr),
      ])

      const rmap = {}
      sids.forEach((id, i) => { rmap[id] = results[i].data ?? null })
      setResumenes(rmap)

      const hMap = {}
      hoyData?.forEach(v => { hMap[v.sucursal_id] = v })
      setVentasHoy(hMap)

      const sMap = {}
      semData?.forEach(v => {
        if (!sMap[v.sucursal_id]) sMap[v.sucursal_id] = { venta: 0, pollos: 0 }
        sMap[v.sucursal_id].venta  += v.venta_total ?? 0
        sMap[v.sucursal_id].pollos += parseFloat(v.pollos_vendidos ?? 0)
      })
      setVentasSem(sMap)
    } finally {
      setLoading(false)
    }
  }

  async function loadRango(desde, hasta) {
    setLoadingRng(true)
    const sids = sucursales.map(s => s.id)
    const { data } = await supabase.from('ventas_diarias')
      .select('sucursal_id, venta_total, pollos_vendidos')
      .in('sucursal_id', sids).gte('fecha', desde).lte('fecha', hasta)
    const map = {}
    data?.forEach(v => {
      if (!map[v.sucursal_id]) map[v.sucursal_id] = { venta: 0, pollos: 0 }
      map[v.sucursal_id].venta  += v.venta_total ?? 0
      map[v.sucursal_id].pollos += parseFloat(v.pollos_vendidos ?? 0)
    })
    setVentasRango(map)
    setLoadingRng(false)
  }

  function computeRow(suc) {
    const res = resumenes[suc.id]
    const ticket_prom = res?.ticket_promedio_periodo ?? 0
    const dias_tot    = res?.dias_totales ?? 30
    const meta_mens   = res?.meta_mensual ?? 0

    if (filtro === 'mes') {
      const metaV  = meta_mens
      const realV  = res?.venta_acumulada ?? 0
      const pctV   = metaV > 0 ? (realV / metaV) * 100 : null
      const pollosR = res?.pollos_totales ?? 0
      const pollosE = ticket_prom > 0 ? metaV / ticket_prom : 0
      const pctP   = pollosE > 0 ? (pollosR / pollosE) * 100 : null
      const tReal  = ticket_prom
      return { metaV, realV, pctV, pollosE, pollosR, pctP, tReal }
    }

    if (filtro === 'semana') {
      const metaV  = res?.meta_venta ?? 0
      const realV  = ventasSem[suc.id]?.venta ?? 0
      const pctV   = metaV > 0 ? (realV / metaV) * 100 : null
      const sem    = ventasSem[suc.id]
      const pollosR = sem?.pollos ?? 0
      const pollosE = ticket_prom > 0 ? metaV / ticket_prom : 0
      const pctP   = pollosE > 0 ? (pollosR / pollosE) * 100 : null
      const tReal  = pollosR > 0 ? realV / pollosR : 0
      return { metaV, realV, pctV, pollosE, pollosR, pctP, tReal }
    }

    if (filtro === 'hoy') {
      const metaV  = dias_tot > 0 ? meta_mens / dias_tot : 0
      const hoy    = ventasHoy[suc.id]
      const realV  = hoy?.venta_total ?? 0
      const pctV   = metaV > 0 ? (realV / metaV) * 100 : null
      const pollosR = parseFloat(hoy?.pollos_vendidos ?? 0)
      const pollosE = ticket_prom > 0 ? metaV / ticket_prom : 0
      const pctP   = pollosE > 0 ? (pollosR / pollosE) * 100 : null
      const tReal  = pollosR > 0 ? realV / pollosR : 0
      return { metaV, realV, pctV, pollosE, pollosR, pctP, tReal }
    }

    if (filtro === 'custom') {
      const customDias = customDesde && customHasta
        ? Math.round((new Date(customHasta + 'T00:00:00') - new Date(customDesde + 'T00:00:00')) / 86400000) + 1
        : 0
      const metaV  = dias_tot > 0 ? meta_mens * (customDias / dias_tot) : 0
      const rng    = ventasRango[suc.id]
      const realV  = rng?.venta ?? 0
      const pctV   = metaV > 0 ? (realV / metaV) * 100 : null
      const pollosR = rng?.pollos ?? 0
      const pollosE = ticket_prom > 0 ? metaV / ticket_prom : 0
      const pctP   = pollosE > 0 ? (pollosR / pollosE) * 100 : null
      const tReal  = pollosR > 0 ? realV / pollosR : 0
      return { metaV, realV, pctV, pollosE, pollosR, pctP, tReal }
    }

    return null
  }

  const sucFiltradas = useMemo(() => {
    if (filtroRuta === 'todas') return sucursales
    return sucursales.filter(s => (rutaSucMap[filtroRuta] ?? []).includes(s.id))
  }, [sucursales, filtroRuta, rutaSucMap])

  const rows = useMemo(() => {
    const data = sucFiltradas.map(s => ({ suc: s, row: computeRow(s) }))
    return [...data].sort((a, b) => {
      let va, vb
      if (sortCol === 'nombre') { va = a.suc.nombre; vb = b.suc.nombre }
      else if (sortCol === 'pctV') { va = a.row?.pctV ?? -1; vb = b.row?.pctV ?? -1 }
      else if (sortCol === 'realV') { va = a.row?.realV ?? 0; vb = b.row?.realV ?? 0 }
      else if (sortCol === 'pctP') { va = a.row?.pctP ?? -1; vb = b.row?.pctP ?? -1 }
      else { va = a.suc.nombre; vb = b.suc.nombre }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [sucFiltradas, resumenes, ventasHoy, ventasSem, ventasRango, sortCol, sortDir, filtro])

  const totals = useMemo(() => {
    let metaV = 0, realV = 0, pollosE = 0, pollosR = 0, tRealSum = 0, tCount = 0
    rows.forEach(({ row }) => {
      if (!row) return
      metaV  += row.metaV
      realV  += row.realV
      pollosE += row.pollosE
      pollosR += row.pollosR
      if (row.tReal > 0) { tRealSum += row.tReal; tCount++ }
    })
    return {
      metaV, realV, pctV: metaV > 0 ? (realV / metaV) * 100 : null,
      pollosE, pollosR, pctP: pollosE > 0 ? (pollosR / pollosE) * 100 : null,
      tReal: tCount > 0 ? tRealSum / tCount : 0,
    }
  }, [rows])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} opacity={0.4} />
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const periodoLabel = filtro === 'hoy' ? format(new Date(), "d 'de' MMMM", { locale: es })
    : filtro === 'semana' ? `Semana del ${format(new Date(inicioSem + 'T12:00:00'), "d MMM", { locale: es })}`
    : filtro === 'mes' ? format(new Date(), "MMMM yyyy", { locale: es })
    : customDesde && customHasta ? `${customDesde} — ${customHasta}` : 'Rango personalizado'

  if (loading) return <div className={styles.empty}>Cargando reporte…</div>

  return (
    <div className={styles.page}>

      {/* ── Título ── */}
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Reporte de Avance</h2>
        <p className={styles.periodoLabel} style={{ textTransform: 'capitalize' }}>{periodoLabel}</p>
      </div>

      {/* ── Filtro periodo ── */}
      <div className={styles.filtroRow}>
        {[
          { key: 'hoy',     label: 'Hoy' },
          { key: 'semana',  label: 'Semana' },
          { key: 'mes',     label: 'Mes' },
          { key: 'custom',  label: 'Personalizado' },
        ].map(f => (
          <button key={f.key}
            className={`${styles.filtroPill} ${filtro === f.key ? styles.filtroPillActive : ''}`}
            onClick={() => setFiltro(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filtro === 'custom' && (
        <div className={styles.rangoRow}>
          <input className={styles.rangoInput} type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)} />
          <span className={styles.rangoSep}>—</span>
          <input className={styles.rangoInput} type="date" value={customHasta} min={customDesde} onChange={e => setCustomHasta(e.target.value)} />
        </div>
      )}

      {/* ── Filtro ruta ── */}
      {rutas.length > 0 && (
        <div className={styles.rutaRow}>
          <button className={`${styles.rutaBtn} ${filtroRuta === 'todas' ? styles.rutaBtnActive : ''}`}
            onClick={() => setFiltroRuta('todas')}>Todas</button>
          {rutas.map(r => (
            <button key={r.id}
              className={`${styles.rutaBtn} ${filtroRuta === r.id ? styles.rutaBtnActive : ''}`}
              onClick={() => setFiltroRuta(r.id)}>
              {r.nombre}
            </button>
          ))}
        </div>
      )}

      {/* ── Totales globales ── */}
      <div className={styles.totalesCard}>
        <div className={styles.totalKpi}>
          <span className={styles.totalKpiLabel}>Venta total</span>
          <span className={styles.totalKpiVal}>{fmt(totals.realV)}</span>
          {totals.pctV != null && (
            <span className={styles.totalKpiPct} style={{ color: pctColor(totals.pctV) }}>
              {totals.pctV.toFixed(1)}% de {fmt(totals.metaV)}
            </span>
          )}
        </div>
        <div className={styles.totalDiv} />
        <div className={styles.totalKpi}>
          <span className={styles.totalKpiLabel}>Pollos vendidos</span>
          <span className={styles.totalKpiVal}>{fmtNum(totals.pollosR)}</span>
          {totals.pctP != null && (
            <span className={styles.totalKpiPct} style={{ color: pctColor(totals.pctP) }}>
              {totals.pctP.toFixed(1)}% de {fmtNum(totals.pollosE)}
            </span>
          )}
        </div>
        <div className={styles.totalDiv} />
        <div className={styles.totalKpi}>
          <span className={styles.totalKpiLabel}>Ticket promedio</span>
          <span className={styles.totalKpiVal}>{totals.tReal > 0 ? fmtDec(totals.tReal) : '—'}</span>
          <span className={styles.totalKpiPct} style={{ color: 'var(--text-muted)' }}>red de tiendas</span>
        </div>
      </div>

      {/* ── Tabla ── */}
      {(filtro === 'custom' && loadingRng) ? (
        <div className={styles.empty}>Cargando datos del rango…</div>
      ) : (filtro === 'custom' && !customDesde) ? (
        <div className={styles.empty}>Selecciona un rango de fechas para ver el reporte</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadGroup}>
                <th className={`${styles.th} ${styles.colNombre}`} rowSpan={2}>
                  <button className={styles.sortBtn} onClick={() => toggleSort('nombre')}>
                    Sucursal <SortIcon col="nombre" />
                  </button>
                </th>
                <th className={`${styles.thGroup} ${styles.groupVenta}`} colSpan={3}>Venta Total</th>
                <th className={`${styles.thGroup} ${styles.groupPollos}`} colSpan={3}>Pollos Vendidos</th>
                <th className={`${styles.thGroup} ${styles.groupTicket}`} colSpan={2}>Ticket Promedio</th>
              </tr>
              <tr className={styles.theadSub}>
                <th className={styles.thSub}>Meta</th>
                <th className={styles.thSub}>
                  <button className={styles.sortBtn} onClick={() => toggleSort('realV')}>
                    Real <SortIcon col="realV" />
                  </button>
                </th>
                <th className={styles.thSub}>
                  <button className={styles.sortBtn} onClick={() => toggleSort('pctV')}>
                    % <SortIcon col="pctV" />
                  </button>
                </th>
                <th className={styles.thSub}>Esp.</th>
                <th className={styles.thSub}>
                  Real
                </th>
                <th className={styles.thSub}>
                  <button className={styles.sortBtn} onClick={() => toggleSort('pctP')}>
                    % <SortIcon col="pctP" />
                  </button>
                </th>
                <th className={styles.thSub}>Red</th>
                <th className={styles.thSub}>Tienda</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(({ suc, row }) => {
                if (!row) return (
                  <tr key={suc.id} className={styles.tr}>
                    <td className={`${styles.td} ${styles.colNombre} ${styles.tdNombre} ${styles.tdClickable}`}
                      onClick={() => navigate(`${basePath}/sucursal/${suc.id}`)}>{suc.nombre}</td>
                    <td className={styles.td} colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.75rem' }}>Sin meta</td>
                  </tr>
                )
                return (
                  <tr key={suc.id} className={styles.tr}>
                    <td className={`${styles.td} ${styles.colNombre} ${styles.tdNombre} ${styles.tdClickable}`}
                      onClick={() => navigate(`${basePath}/sucursal/${suc.id}`)}>{suc.nombre}</td>
                    {/* Venta */}
                    <td className={`${styles.td} ${styles.tdMeta}`}>{row.metaV > 0 ? fmt(row.metaV) : '—'}</td>
                    <td className={`${styles.td} ${styles.tdReal}`}>{row.realV > 0 ? fmt(row.realV) : '—'}</td>
                    <td className={`${styles.td} ${styles.tdPct}`} style={{ color: pctColor(row.pctV), background: pctBg(row.pctV) }}>
                      {row.pctV != null ? `${row.pctV.toFixed(1)}%` : '—'}
                    </td>
                    {/* Pollos */}
                    <td className={`${styles.td} ${styles.tdMeta}`}>{row.pollosE > 0 ? fmtNum(row.pollosE) : '—'}</td>
                    <td className={`${styles.td} ${styles.tdReal}`}>{row.pollosR > 0 ? fmtNum(row.pollosR) : '—'}</td>
                    <td className={`${styles.td} ${styles.tdPct}`} style={{ color: pctColor(row.pctP), background: pctBg(row.pctP) }}>
                      {row.pctP != null ? `${row.pctP.toFixed(1)}%` : '—'}
                    </td>
                    {/* Ticket */}
                    <td className={`${styles.td} ${styles.tdMeta}`}>{totals.tReal > 0 ? fmtDec(totals.tReal) : '—'}</td>
                    <td className={`${styles.td} ${styles.tdReal}`} style={{
                      color: row.tReal > 0 && totals.tReal > 0
                        ? row.tReal >= totals.tReal * 0.97 ? 'var(--success)' : row.tReal >= totals.tReal * 0.90 ? 'var(--yellow)' : 'var(--red)'
                        : 'var(--text-muted)'
                    }}>
                      {row.tReal > 0 ? fmtDec(row.tReal) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* ── Fila totales ── */}
            <tfoot>
              <tr className={styles.tfootRow}>
                <td className={`${styles.td} ${styles.colNombre} ${styles.tdTotalLabel}`}>
                  TOTAL ({rows.length})
                </td>
                <td className={`${styles.td} ${styles.tdMeta}`}>{fmt(totals.metaV)}</td>
                <td className={`${styles.td} ${styles.tdReal} ${styles.tdTotalVal}`}>{fmt(totals.realV)}</td>
                <td className={`${styles.td} ${styles.tdPct} ${styles.tdTotalPct}`}
                  style={{ color: pctColor(totals.pctV), background: pctBg(totals.pctV) }}>
                  {totals.pctV != null ? `${totals.pctV.toFixed(1)}%` : '—'}
                </td>
                <td className={`${styles.td} ${styles.tdMeta}`}>{fmtNum(totals.pollosE)}</td>
                <td className={`${styles.td} ${styles.tdReal} ${styles.tdTotalVal}`}>{fmtNum(totals.pollosR)}</td>
                <td className={`${styles.td} ${styles.tdPct} ${styles.tdTotalPct}`}
                  style={{ color: pctColor(totals.pctP), background: pctBg(totals.pctP) }}>
                  {totals.pctP != null ? `${totals.pctP.toFixed(1)}%` : '—'}
                </td>
                <td className={`${styles.td} ${styles.tdMeta}`}>—</td>
                <td className={`${styles.td} ${styles.tdReal} ${styles.tdTotalVal}`}>
                  {totals.tReal > 0 ? fmtDec(totals.tReal) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className={styles.nota}>
        * Pollos esperados = meta de venta del periodo ÷ ticket promedio histórico.
        Columna "Red" = promedio de la red de tiendas. "Tienda" = ticket propio de cada sucursal.
      </p>
    </div>
  )
}
