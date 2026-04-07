import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  format, parseISO, startOfWeek, endOfWeek, subWeeks,
  eachDayOfInterval, subDays, addDays
} from 'date-fns'
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
  const [loading, setLoading] = useState(true)

  // Semana navegable
  const [semanaRef, setSemanaRef] = useState(new Date())
  const [semanaData, setSemanaData] = useState([])

  // Edición modal
  const [editFecha, setEditFecha] = useState(null)
  const [editForm, setEditForm] = useState({ venta_total: '', pollos_vendidos: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState(null)

  // Tab semana
  const [tabActiva, setTabActiva] = useState('venta')

  useEffect(() => { load() }, [id])
  useEffect(() => { if (ventas.length >= 0) buildSemana() }, [semanaRef, ventas])

  async function load() {
    setLoading(true)
    const [{ data: suc }, { data: res }, { data: vData }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('id', id).single(),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id)
        .order('fecha', { ascending: true }),
    ])
    setSucursal(suc)
    setResumen(res)
    setVentas(vData ?? [])
    setLoading(false)
  }

  function buildSemana() {
    const inicioSem = startOfWeek(semanaRef, { weekStartsOn: 1 })
    const finSem = endOfWeek(semanaRef, { weekStartsOn: 1 })
    const dias = eachDayOfInterval({ start: inicioSem, end: finSem })
    setSemanaData(dias.map(dia => {
      const fechaStr = format(dia, 'yyyy-MM-dd')
      const v = ventas.find(x => x.fecha === fechaStr)
      return {
        dia: format(dia, 'EEE', { locale: es }),
        diaCorto: format(dia, 'd', { locale: es }),
        fecha: fechaStr,
        venta_total: v?.venta_total ?? null,
        pollos_vendidos: v?.pollos_vendidos ?? null,
        ticket_promedio: v ? parseFloat(v.ticket_promedio ?? 0) : null,
        registrado: !!v,
        esFutura: fechaStr > hoyStr,
        ventaObj: v ?? null,
      }
    }))
  }

  function semanaAnteriorData() {
    const inicioAnt = startOfWeek(subWeeks(semanaRef, 1), { weekStartsOn: 1 })
    const finAnt = endOfWeek(subWeeks(semanaRef, 1), { weekStartsOn: 1 })
    return ventas.filter(v => v.fecha >= format(inicioAnt, 'yyyy-MM-dd') && v.fecha <= format(finAnt, 'yyyy-MM-dd'))
  }

  function abrirEdicion(fecha, ventaExistente) {
    setEditFecha(fecha)
    setEditMsg(null)
    setEditForm(ventaExistente
      ? { venta_total: ventaExistente.venta_total, pollos_vendidos: ventaExistente.pollos_vendidos }
      : { venta_total: '', pollos_vendidos: '' }
    )
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
      setEditMsg({ tipo: 'ok', texto: 'Guardado ✓' })
      await load()
      setTimeout(() => { setEditFecha(null); setEditMsg(null) }, 1000)
    }
    setEditSaving(false)
  }

  // Ir a buscar cualquier fecha con input
  const [buscarFecha, setBuscarFecha] = useState('')

  function irAFecha(fecha) {
    if (!fecha) return
    const d = new Date(fecha + 'T12:00:00')
    setSemanaRef(d)
    setBuscarFecha('')
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const avance = resumen?.avance_porcentaje ?? 0
  const avanceSem = resumen?.avance_semanal ?? 0
  const promDiario = ventas.length > 0 ? ventas.reduce((a, v) => a + v.venta_total, 0) / ventas.length : 0
  const diasRestantes = resumen ? resumen.dias_totales - resumen.dias_transcurridos : 0
  const proyeccion = resumen ? resumen.venta_acumulada + (promDiario * diasRestantes) : 0

  const ventasSem = semanaData.filter(d => d.registrado)
  const totalVentaSem = ventasSem.reduce((a, d) => a + (d.venta_total ?? 0), 0)
  const totalPollosSem = ventasSem.reduce((a, d) => a + parseFloat(d.pollos_vendidos ?? 0), 0)
  const ticketSem = totalPollosSem > 0 ? totalVentaSem / totalPollosSem : 0

  const semAntData = semanaAnteriorData()
  const totalVentaSemAnt = semAntData.reduce((a, v) => a + v.venta_total, 0)
  const totalPollosSemAnt = semAntData.reduce((a, v) => a + parseFloat(v.pollos_vendidos), 0)
  const ticketSemAnt = totalPollosSemAnt > 0 ? totalVentaSemAnt / totalPollosSemAnt : 0

  const maxVenta = Math.max(...semanaData.map(d => d.venta_total ?? 0), 1)
  const maxPollos = Math.max(...semanaData.map(d => parseFloat(d.pollos_vendidos ?? 0)), 1)
  const maxTicket = Math.max(...semanaData.map(d => d.ticket_promedio ?? 0), 1)
  const chartColor = tabActiva === 'venta' ? '#F5C400' : tabActiva === 'pollos' ? '#4F8EF7' : '#00D395'

  const inicioSemLabel = format(startOfWeek(semanaRef, { weekStartsOn: 1 }), 'd MMM', { locale: es })
  const finSemLabel = format(endOfWeek(semanaRef, { weekStartsOn: 1 }), 'd MMM', { locale: es })
  const esSemanActual = format(semanaRef, 'yyyy-WW') === format(new Date(), 'yyyy-WW')

  const DiffBadge = ({ actual, anterior }) => {
    if (!anterior) return null
    const pct = (actual - anterior) / anterior * 100
    const pos = pct >= 0
    return <span className={`${styles.diffBadge} ${pos ? styles.diffPos : styles.diffNeg}`}>{pos ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(backPath ?? -1)}>‹ Volver</button>
      <h1 className={styles.title}>{sucursal?.nombre}</h1>

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
            <span className={styles.trackPct}>{avance.toFixed(0)}%</span>
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

      {/* SEMANA NAVEGABLE */}
      <div className={styles.semanaCard}>
        {/* Navegación de semana */}
        <div className={styles.semanaNav}>
          <button className={styles.navBtn} onClick={() => setSemanaRef(d => subWeeks(d, 1))}>‹</button>
          <div className={styles.semanaNavCenter}>
            <p className={styles.semanaLabel} style={{ textTransform: 'capitalize' }}>{inicioSemLabel} — {finSemLabel}</p>
            {esSemanActual && <span className={styles.semanaActualBadge}>Esta semana</span>}
          </div>
          <button className={styles.navBtn}
            onClick={() => setSemanaRef(d => {
              const next = addDays(endOfWeek(d, { weekStartsOn: 1 }), 1)
              return next > new Date() ? d : next
            })}
            disabled={esSemanActual}>›</button>
        </div>

        {/* Buscar fecha específica */}
        <div className={styles.buscarFechaRow}>
          <span className={styles.buscarLabel}>Ir a fecha:</span>
          <input className={styles.buscarInput} type="date" value={buscarFecha}
            onChange={e => setBuscarFecha(e.target.value)}
            onBlur={() => buscarFecha && irAFecha(buscarFecha)} />
          <button className={styles.buscarBtn} onClick={() => irAFecha(buscarFecha)} disabled={!buscarFecha}>Ir</button>
        </div>

        {/* KPIs semanales */}
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
            <button key={t.key} className={`${styles.tab} ${tabActiva === t.key ? styles.tabActive : ''}`}
              onClick={() => setTabActiva(t.key)}
              style={tabActiva === t.key ? { borderColor: chartColor, color: chartColor } : {}}>{t.label}</button>
          ))}
        </div>

        {/* Barras por día */}
        <div className={styles.diasGrid}>
          {semanaData.map((d, i) => {
            const val = tabActiva === 'pollos' ? parseFloat(d.pollos_vendidos ?? 0) : tabActiva === 'ticket' ? (d.ticket_promedio ?? 0) : (d.venta_total ?? 0)
            const max = tabActiva === 'venta' ? maxVenta : tabActiva === 'pollos' ? maxPollos : maxTicket
            const pct = max > 0 ? (val / max) * 100 : 0
            return (
              <div key={i} className={`${styles.diaCol} ${!d.esFutura ? styles.diaColClickable : ''}`}
                onClick={() => !d.esFutura && abrirEdicion(d.fecha, d.ventaObj)}>
                <span className={styles.diaVal}>
                  {d.esFutura ? '' : !d.registrado ? '+' :
                    tabActiva === 'venta' ? `$${(val/1000).toFixed(1)}k` :
                    tabActiva === 'pollos' ? fmtNum(val) : `$${val.toFixed(0)}`}
                </span>
                <div className={styles.diaBarWrap}>
                  <div className={styles.diaBar} style={{ height: `${d.registrado && !d.esFutura ? Math.max(pct, 4) : 0}%`, background: d.registrado ? chartColor : 'transparent' }} />
                </div>
                <span className={styles.diaNombre}>{d.dia}</span>
                <span className={styles.diaDia}>{d.diaCorto}</span>
              </div>
            )
          })}
        </div>

        {/* Tabla semanal */}
        <div className={styles.semanaTabla}>
          <div className={styles.semanaTablaHead}><span>Día</span><span>Venta</span><span>Pollos</span><span>Ticket</span></div>
          {semanaData.map((d, i) => (
            <div key={i}
              className={`${styles.semanaTablaRow} ${!d.registrado ? styles.sinRegistro : ''} ${!d.esFutura ? styles.tablaRowEditable : ''}`}
              onClick={() => !d.esFutura && abrirEdicion(d.fecha, d.ventaObj)}>
              <span className={styles.tdDia} style={{ textTransform: 'capitalize' }}>
                {d.dia} {d.diaCorto}
                {!d.registrado && !d.esFutura && <span className={styles.editHint}> +</span>}
              </span>
              <span className={styles.tdV}>{d.registrado ? fmt(d.venta_total) : d.esFutura ? '' : '—'}</span>
              <span className={styles.tdP}>{d.registrado ? fmtNum(d.pollos_vendidos) : d.esFutura ? '' : '—'}</span>
              <span className={styles.tdT}>{d.registrado ? fmtDec(d.ticket_promedio) : d.esFutura ? '' : '—'}</span>
            </div>
          ))}
          <div className={styles.semanaTablaTotal}>
            <span>Total</span><span>{fmt(totalVentaSem)}</span><span>{fmtNum(totalPollosSem)}</span><span>{fmtDec(ticketSem)}</span>
          </div>
        </div>
      </div>

      {/* Gráfica histórica */}
      {ventas.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Historial completo</p>
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
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div className={styles.tooltip}><p className={styles.tooltipLabel}>{label}</p><p className={styles.tooltipVal}>{fmt(payload[0]?.value)}</p></div>
              ) : null} />
              <Area type="monotone" dataKey="venta" stroke="#F5C400" strokeWidth={2} fill="url(#vg)" dot={false} activeDot={{ r: 4, fill: '#F5C400' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* MODAL DE EDICIÓN */}
      {editFecha && (
        <div className={styles.modalOverlay} onClick={() => setEditFecha(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>
                {ventas.find(v => v.fecha === editFecha) ? '✏️ Editar' : '+ Registrar'}{' '}
                <span style={{ textTransform: 'capitalize', color: 'var(--yellow)' }}>
                  {format(parseISO(editFecha), "EEE d 'de' MMM yyyy", { locale: es })}
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
    </div>
  )
}
