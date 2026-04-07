import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, parseISO, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import styles from './Sucursal.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)
const hoyStr = format(new Date(), 'yyyy-MM-dd')

export default function SucursalDetalle({ backPath }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sucursal, setSucursal] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [ventas, setVentas] = useState([])
  const [semanaActual, setSemanaActual] = useState([])
  const [semanaAnterior, setSemanaAnterior] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabActiva, setTabActiva] = useState('venta')

  // Edición
  const [editFecha, setEditFecha] = useState(null)
  const [editForm, setEditForm] = useState({ venta_total: '', pollos_vendidos: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState(null)

  // Descarga
  const [showDescarga, setShowDescarga] = useState(false)
  const [descargaFiltro, setDescargaFiltro] = useState('semana') // semana | mes | rango
  const [descargaDesde, setDescargaDesde] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [descargaHasta, setDescargaHasta] = useState(hoyStr)
  const [descargando, setDescargando] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const hoy = new Date()
    const inicioSem = startOfWeek(hoy, { weekStartsOn: 1 })
    const finSem = endOfWeek(hoy, { weekStartsOn: 1 })
    const inicioSemAnt = startOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 })
    const finSemAnt = endOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 })

    const [{ data: suc }, { data: res }, { data: vData }, { data: semAct }, { data: semAnt }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('id', id).single(),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id).order('fecha', { ascending: true }).limit(60),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id)
        .gte('fecha', format(inicioSem, 'yyyy-MM-dd')).lte('fecha', format(finSem, 'yyyy-MM-dd')),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id)
        .gte('fecha', format(inicioSemAnt, 'yyyy-MM-dd')).lte('fecha', format(finSemAnt, 'yyyy-MM-dd')),
    ])

    setSucursal(suc)
    setResumen(res)
    setVentas(vData ?? [])

    const diasSem = eachDayOfInterval({ start: inicioSem, end: finSem })
    const buildSem = (datos, dias) => dias.map(dia => {
      const fechaStr = format(dia, 'yyyy-MM-dd')
      const v = datos?.find(x => x.fecha === fechaStr)
      return {
        dia: format(dia, 'EEE', { locale: es }),
        fecha: fechaStr,
        venta_total: v?.venta_total ?? null,
        pollos_vendidos: v?.pollos_vendidos ?? null,
        ticket_promedio: v ? parseFloat(v.ticket_promedio ?? 0) : null,
        registrado: !!v,
        id: v?.id ?? null,
      }
    })
    setSemanaActual(buildSem(semAct, diasSem))
    setSemanaAnterior(buildSem(semAnt, diasSem))
    setLoading(false)
  }

  // Abrir edición de una fecha
  function abrirEdicion(fecha, ventaExistente) {
    setEditFecha(fecha)
    setEditMsg(null)
    if (ventaExistente) {
      setEditForm({ venta_total: ventaExistente.venta_total, pollos_vendidos: ventaExistente.pollos_vendidos })
    } else {
      setEditForm({ venta_total: '', pollos_vendidos: '' })
    }
  }

  async function handleEditSave(e) {
    e.preventDefault()
    if (!editForm.venta_total || !editForm.pollos_vendidos) return
    setEditSaving(true)
    setEditMsg(null)

    const ventaExistente = ventas.find(v => v.fecha === editFecha)
    const payload = {
      sucursal_id: id,
      fecha: editFecha,
      venta_total: parseFloat(editForm.venta_total),
      pollos_vendidos: parseFloat(editForm.pollos_vendidos),
    }

    const { error } = ventaExistente
      ? await supabase.from('ventas_diarias').update({ venta_total: payload.venta_total, pollos_vendidos: payload.pollos_vendidos }).eq('id', ventaExistente.id)
      : await supabase.from('ventas_diarias').insert({ ...payload, encargado_id: null })

    if (error) {
      setEditMsg({ tipo: 'error', texto: error.message })
    } else {
      setEditMsg({ tipo: 'ok', texto: 'Guardado correctamente' })
      await load()
      setTimeout(() => { setEditFecha(null); setEditMsg(null) }, 1200)
    }
    setEditSaving(false)
  }

  // Descarga Excel
  async function handleDescarga() {
    setDescargando(true)
    let desde = descargaDesde
    let hasta = descargaHasta

    if (descargaFiltro === 'semana') {
      desde = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      hasta = hoyStr
    } else if (descargaFiltro === 'mes') {
      desde = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      hasta = format(endOfMonth(new Date()), 'yyyy-MM-dd')
    }

    const { data } = await supabase
      .from('ventas_diarias')
      .select('fecha, venta_total, pollos_vendidos, ticket_promedio')
      .eq('sucursal_id', id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })

    if (!data?.length) { setDescargando(false); return }

    // Construir CSV como base para Excel (compatible)
    const totalVenta = data.reduce((a, r) => a + r.venta_total, 0)
    const totalPollos = data.reduce((a, r) => a + parseFloat(r.pollos_vendidos), 0)
    const ticketProm = totalPollos > 0 ? totalVenta / totalPollos : 0

    const filas = [
      ['REPORTE DE VENTAS — ' + sucursal?.nombre?.toUpperCase()],
      ['Periodo:', `${desde} al ${hasta}`],
      [],
      ['Fecha', 'Venta Total', 'Pollos Vendidos', 'Ticket Promedio'],
      ...data.map(r => [
        format(parseISO(r.fecha), 'dd/MM/yyyy'),
        r.venta_total,
        parseFloat(r.pollos_vendidos),
        parseFloat(r.ticket_promedio ?? 0),
      ]),
      [],
      ['RESUMEN'],
      ['Total Ventas', totalVenta, '', ''],
      ['Total Pollos', '', totalPollos, ''],
      ['Ticket Promedio General', '', '', ticketProm.toFixed(2)],
      ['Días registrados', data.length, '', ''],
    ]

    // Generar CSV con BOM para Excel (abre correctamente con acentos)
    const csvContent = '\uFEFF' + filas.map(row =>
      row.map(cell => `"${cell}"`).join(',')
    ).join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ventas_${sucursal?.nombre?.replace(/\s+/g, '_')}_${desde}_${hasta}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setDescargando(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const avance = resumen?.avance_porcentaje ?? 0
  const avanceSem = resumen?.avance_semanal ?? 0
  const promDiario = ventas.length > 0 ? ventas.reduce((a, v) => a + v.venta_total, 0) / ventas.length : 0
  const diasRestantes = resumen ? resumen.dias_totales - resumen.dias_transcurridos : 0
  const proyeccion = resumen ? resumen.venta_acumulada + (promDiario * diasRestantes) : 0

  const ventasSem = semanaActual.filter(d => d.registrado)
  const totalVentaSem = ventasSem.reduce((a, d) => a + (d.venta_total ?? 0), 0)
  const totalPollosSem = ventasSem.reduce((a, d) => a + parseFloat(d.pollos_vendidos ?? 0), 0)
  const ticketSem = totalPollosSem > 0 ? totalVentaSem / totalPollosSem : 0

  const ventasSemAnt = semanaAnterior.filter(d => d.registrado)
  const totalVentaSemAnt = ventasSemAnt.reduce((a, d) => a + (d.venta_total ?? 0), 0)
  const totalPollosSemAnt = ventasSemAnt.reduce((a, d) => a + parseFloat(d.pollos_vendidos ?? 0), 0)
  const ticketSemAnt = totalPollosSemAnt > 0 ? totalVentaSemAnt / totalPollosSemAnt : 0

  const maxVenta = Math.max(...semanaActual.map(d => d.venta_total ?? 0), 1)
  const maxPollos = Math.max(...semanaActual.map(d => parseFloat(d.pollos_vendidos ?? 0)), 1)
  const maxTicket = Math.max(...semanaActual.map(d => d.ticket_promedio ?? 0), 1)

  const chartKey = tabActiva === 'venta' ? 'venta_total' : tabActiva === 'pollos' ? 'pollos_vendidos' : 'ticket_promedio'
  const chartColor = tabActiva === 'venta' ? '#F5C400' : tabActiva === 'pollos' ? '#4F8EF7' : '#00D395'

  const DiffBadge = ({ actual, anterior }) => {
    if (!anterior) return null
    const pct = (actual - anterior) / anterior * 100
    const pos = pct >= 0
    return (
      <span className={`${styles.diffBadge} ${pos ? styles.diffPos : styles.diffNeg}`}>
        {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
    )
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(backPath ?? -1)}>‹ Volver</button>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{sucursal?.nombre}</h1>
        <button className={styles.descargaBtn} onClick={() => setShowDescarga(v => !v)}>
          ⬇ Exportar
        </button>
      </div>

      {/* Panel de descarga */}
      {showDescarga && (
        <div className={styles.descargaPanel}>
          <p className={styles.descargaTitle}>Exportar datos a Excel</p>
          <div className={styles.filtroTabs}>
            {[
              { key: 'semana', label: 'Esta semana' },
              { key: 'mes', label: 'Este mes' },
              { key: 'rango', label: 'Rango libre' },
            ].map(f => (
              <button key={f.key}
                className={`${styles.filtroTab} ${descargaFiltro === f.key ? styles.filtroTabActive : ''}`}
                onClick={() => setDescargaFiltro(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          {descargaFiltro === 'rango' && (
            <div className={styles.rangoRow}>
              <input className={styles.rangoInput} type="date" value={descargaDesde}
                onChange={e => setDescargaDesde(e.target.value)} />
              <span className={styles.rangoSep}>—</span>
              <input className={styles.rangoInput} type="date" value={descargaHasta}
                onChange={e => setDescargaHasta(e.target.value)} />
            </div>
          )}
          <button className={styles.descargaExcelBtn} onClick={handleDescarga} disabled={descargando}>
            {descargando ? 'Generando…' : '⬇ Descargar Excel (.csv)'}
          </button>
        </div>
      )}

      {/* Meta card */}
      {resumen ? (
        <div className={styles.metaCard}>
          <div className={styles.metaTop}>
            <div>
              <p className={styles.metaLabel}>Meta mensual</p>
              <p className={styles.metaMonto}>{fmt(resumen.meta_mensual ?? resumen.meta_venta)}</p>
              <p className={styles.metaFechas} style={{ textTransform: 'capitalize' }}>
                {format(parseISO(resumen.fecha_inicio), 'd MMM', { locale: es })} — {format(parseISO(resumen.fecha_fin), 'd MMM yyyy', { locale: es })}
              </p>
            </div>
            <div className={styles.pctBlock}>
              <span className={styles.pctNum}>{avance.toFixed(1)}</span>
              <span className={styles.pctSym}>%</span>
            </div>
          </div>
          <div className={styles.trackRow}>
            <span className={styles.trackLabel}>Mes</span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${Math.min(avance, 100)}%`, background: avance >= 100 ? 'var(--success)' : avance >= 70 ? 'var(--yellow)' : 'var(--red)' }} />
            </div>
          </div>
          <div className={styles.trackRow}>
            <span className={styles.trackLabel}>Sem</span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${Math.min(avanceSem, 100)}%`, background: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)' }} />
            </div>
            <span className={styles.trackPct} style={{ color: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)' }}>{avanceSem.toFixed(0)}%</span>
          </div>
          <div className={styles.metaGrid}>
            <div className={styles.metaStat}><span className={styles.metaStatLabel}>Acumulado</span><span className={styles.metaStatVal}>{fmt(resumen.venta_acumulada)}</span></div>
            <div className={styles.metaStat}><span className={styles.metaStatLabel}>Días</span><span className={styles.metaStatVal}>{resumen.dias_transcurridos}/{resumen.dias_totales}</span></div>
            <div className={styles.metaStat}><span className={styles.metaStatLabel}>Ticket prom.</span><span className={styles.metaStatVal}>{fmtDec(resumen.ticket_promedio_periodo)}</span></div>
            <div className={styles.metaStat}><span className={styles.metaStatLabel}>Pollos</span><span className={styles.metaStatVal}>{fmtNum(resumen.pollos_totales)}</span></div>
          </div>
          <div className={styles.proyeccion}>
            <span className={styles.proyLabel}>Proyección final</span>
            <span className={styles.proyVal} style={{ color: proyeccion >= (resumen.meta_mensual ?? resumen.meta_venta) ? 'var(--success)' : 'var(--red)' }}>{fmt(proyeccion)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.noMeta}>Sin meta activa para esta sucursal</div>
      )}

      {/* Semana actual */}
      <div className={styles.semanaCard}>
        <div className={styles.semanaHeader}>
          <p className={styles.semanaTitle}>Esta semana</p>
          <p className={styles.semanaSub}>{ventasSem.length} días registrados</p>
        </div>
        <div className={styles.semanaKpis}>
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Venta</span>
            <span className={styles.kpiVal}>{fmt(totalVentaSem)}</span>
            <DiffBadge actual={totalVentaSem} anterior={totalVentaSemAnt} />
          </div>
          <div className={styles.semanaDivider} />
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Pollos</span>
            <span className={styles.kpiVal}>{fmtNum(totalPollosSem)}</span>
            <DiffBadge actual={totalPollosSem} anterior={totalPollosSemAnt} />
          </div>
          <div className={styles.semanaDivider} />
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Ticket</span>
            <span className={styles.kpiVal}>{fmtDec(ticketSem)}</span>
            <DiffBadge actual={ticketSem} anterior={ticketSemAnt} />
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {[{ key: 'venta', label: 'Venta $' }, { key: 'pollos', label: 'Pollos' }, { key: 'ticket', label: 'Ticket' }].map(t => (
            <button key={t.key}
              className={`${styles.tab} ${tabActiva === t.key ? styles.tabActive : ''}`}
              onClick={() => setTabActiva(t.key)}
              style={tabActiva === t.key ? { borderColor: chartColor, color: chartColor } : {}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Barras por día — CLICKEABLES para editar */}
        <div className={styles.diasGrid}>
          {semanaActual.map((d, i) => {
            const val = chartKey === 'pollos_vendidos' ? parseFloat(d.pollos_vendidos ?? 0) : (d[chartKey] ?? 0)
            const max = chartKey === 'venta_total' ? maxVenta : chartKey === 'pollos_vendidos' ? maxPollos : maxTicket
            const pct = max > 0 ? (val / max) * 100 : 0
            const esFutura = d.fecha > hoyStr
            return (
              <div key={i} className={`${styles.diaCol} ${!esFutura ? styles.diaColClickable : ''}`}
                onClick={() => !esFutura && abrirEdicion(d.fecha, ventas.find(v => v.fecha === d.fecha))}>
                <span className={styles.diaVal}>
                  {esFutura ? '' : !d.registrado ? '—' :
                    chartKey === 'venta_total' ? `$${(val / 1000).toFixed(1)}k` :
                    chartKey === 'pollos_vendidos' ? fmtNum(val) : `$${val.toFixed(0)}`}
                </span>
                <div className={styles.diaBarWrap}>
                  <div className={styles.diaBar} style={{
                    height: `${d.registrado && !esFutura ? Math.max(pct, 4) : 0}%`,
                    background: d.registrado ? chartColor : 'transparent'
                  }} />
                </div>
                <span className={styles.diaNombre}>{d.dia}</span>
                {!esFutura && <span className={styles.diaEdit}>{d.registrado ? '✏' : '+'}</span>}
              </div>
            )
          })}
        </div>

        {/* Tabla semanal */}
        <div className={styles.semanaTabla}>
          <div className={styles.semanaTablaHead}><span>Día</span><span>Venta</span><span>Pollos</span><span>Ticket</span></div>
          {semanaActual.map((d, i) => {
            const esFutura = d.fecha > hoyStr
            return (
              <div key={i}
                className={`${styles.semanaTablaRow} ${!d.registrado ? styles.sinRegistro : ''} ${!esFutura ? styles.tablaRowEditable : ''}`}
                onClick={() => !esFutura && abrirEdicion(d.fecha, ventas.find(v => v.fecha === d.fecha))}>
                <span className={styles.tdDia}>{d.dia}</span>
                <span className={styles.tdV}>{d.registrado ? fmt(d.venta_total) : esFutura ? '' : '—'}</span>
                <span className={styles.tdP}>{d.registrado ? fmtNum(d.pollos_vendidos) : esFutura ? '' : '—'}</span>
                <span className={styles.tdT}>{d.registrado ? fmtDec(d.ticket_promedio) : esFutura ? '' : '—'}</span>
              </div>
            )
          })}
          <div className={styles.semanaTablaTotal}>
            <span>Total</span><span>{fmt(totalVentaSem)}</span><span>{fmtNum(totalPollosSem)}</span><span>{fmtDec(ticketSem)}</span>
          </div>
        </div>
      </div>

      {/* Modal de edición */}
      {editFecha && (
        <div className={styles.modalOverlay} onClick={() => setEditFecha(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>
                {ventas.find(v => v.fecha === editFecha) ? 'Editar' : 'Registrar'} —{' '}
                <span style={{ textTransform: 'capitalize' }}>
                  {format(parseISO(editFecha), "EEE d 'de' MMM", { locale: es })}
                </span>
              </p>
              <button className={styles.modalClose} onClick={() => setEditFecha(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSave} className={styles.modalForm}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Venta Total</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputPrefix}>$</span>
                  <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                    value={editForm.venta_total} onChange={e => setEditForm(f => ({ ...f, venta_total: e.target.value }))} required autoFocus />
                </div>
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Pollos Vendidos</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputPrefix}>🐔</span>
                  <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.5" placeholder="0"
                    value={editForm.pollos_vendidos} onChange={e => setEditForm(f => ({ ...f, pollos_vendidos: e.target.value }))} required />
                </div>
              </div>
              {editForm.venta_total && editForm.pollos_vendidos && parseFloat(editForm.pollos_vendidos) > 0 && (
                <div className={styles.ticketPreviewModal}>
                  <span>Ticket promedio</span>
                  <span>{fmtDec(parseFloat(editForm.venta_total) / parseFloat(editForm.pollos_vendidos))}</span>
                </div>
              )}
              {editMsg && <div className={`${styles.msg} ${styles[editMsg.tipo]}`}>{editMsg.texto}</div>}
              <button className={styles.saveBtn} type="submit" disabled={editSaving}>
                {editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Gráfica histórica */}
      {ventas.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Historial de ventas</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={ventas.map(v => ({ fecha: format(parseISO(v.fecha), 'd MMM', { locale: es }), venta: v.venta_total }))}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C400" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F5C400" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="fecha" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div className={styles.tooltip}><p className={styles.tooltipLabel}>{label}</p><p className={styles.tooltipVal}>{fmt(payload[0]?.value)}</p></div>
              ) : null} />
              <Area type="monotone" dataKey="venta" stroke="#F5C400" strokeWidth={2} fill="url(#vg)" dot={false} activeDot={{ r: 4, fill: '#F5C400' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {ventas.length === 0 && <div className={styles.noData}>Sin registros de venta aún</div>}
    </div>
  )
}
