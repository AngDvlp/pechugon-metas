import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line, Legend
} from 'recharts'
import styles from './Sucursal.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function SupervisorSucursal() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sucursal, setSucursal] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [ventas, setVentas] = useState([])
  const [semanaActual, setSemanaActual] = useState([])
  const [semanaAnterior, setSemanaAnterior] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabActiva, setTabActiva] = useState('venta') // 'venta' | 'pollos' | 'ticket'
  const [faltaTab, setFaltaTab] = useState('semana') // 'semana' | 'mes'

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const hoy = new Date()
    const inicioSemana = startOfWeek(hoy, { weekStartsOn: 1 })
    const finSemana = endOfWeek(hoy, { weekStartsOn: 1 })
    const inicioSemAnt = startOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 })
    const finSemAnt = endOfWeek(subWeeks(hoy, 1), { weekStartsOn: 1 })

    const [{ data: suc }, { data: res }, { data: vData }, { data: semAct }, { data: semAnt }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('id', id).single(),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id).order('fecha', { ascending: true }).limit(60),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id)
        .gte('fecha', format(inicioSemana, 'yyyy-MM-dd'))
        .lte('fecha', format(finSemana, 'yyyy-MM-dd'))
        .order('fecha', { ascending: true }),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id)
        .gte('fecha', format(inicioSemAnt, 'yyyy-MM-dd'))
        .lte('fecha', format(finSemAnt, 'yyyy-MM-dd'))
        .order('fecha', { ascending: true }),
    ])

    setSucursal(suc)
    setResumen(res)
    setVentas(vData ?? [])

    // Construir semana con todos los días lun-dom
    const diasSemana = eachDayOfInterval({ start: inicioSemana, end: finSemana })
    const buildSemana = (datos, dias) => dias.map(dia => {
      const fechaStr = format(dia, 'yyyy-MM-dd')
      const venta = datos?.find(v => v.fecha === fechaStr)
      return {
        dia: format(dia, 'EEE', { locale: es }),
        fecha: fechaStr,
        venta_total: venta?.venta_total ?? null,
        pollos_vendidos: venta?.pollos_vendidos ?? null,
        ticket_promedio: venta ? parseFloat(venta.ticket_promedio ?? 0) : null,
        registrado: !!venta,
      }
    })

    setSemanaActual(buildSemana(semAct, diasSemana))
    setSemanaAnterior(buildSemana(semAnt, diasSemana))
    setLoading(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const avance = resumen?.avance_porcentaje ?? 0
  const promDiario = ventas.length > 0 ? ventas.reduce((a, v) => a + v.venta_total, 0) / ventas.length : 0
  const diasRestantes = resumen ? resumen.dias_totales - resumen.dias_transcurridos : 0
  const proyeccion = resumen ? resumen.venta_acumulada + (promDiario * diasRestantes) : 0

  // Estadísticas semanales
  const ventasSemana = semanaActual.filter(d => d.registrado)
  const totalVentaSemana = ventasSemana.reduce((a, d) => a + (d.venta_total ?? 0), 0)
  const totalPollosSemana = ventasSemana.reduce((a, d) => a + (d.pollos_vendidos ?? 0), 0)
  const ticketPromedioSemana = totalPollosSemana > 0 ? totalVentaSemana / totalPollosSemana : 0

  const ventasSemAnt = semanaAnterior.filter(d => d.registrado)
  const totalVentaSemAnt = ventasSemAnt.reduce((a, d) => a + (d.venta_total ?? 0), 0)
  const totalPollosSemAnt = ventasSemAnt.reduce((a, d) => a + (d.pollos_vendidos ?? 0), 0)
  const ticketSemAnt = totalPollosSemAnt > 0 ? totalVentaSemAnt / totalPollosSemAnt : 0

  const maxVenta = Math.max(...semanaActual.map(d => d.venta_total ?? 0), 1)
  const maxPollos = Math.max(...semanaActual.map(d => d.pollos_vendidos ?? 0), 1)
  const maxTicket = Math.max(...semanaActual.map(d => d.ticket_promedio ?? 0), 1)

  // Falta para la meta
  const faltaSem = Math.max(0, (resumen?.meta_venta ?? 0) - totalVentaSemana)
  const faltaPollosSem = Math.max(0, (resumen?.pollos_meta ?? 0) - totalPollosSemana)
  const faltaMes = Math.max(0, (resumen?.meta_mensual ?? resumen?.meta_venta ?? 0) - (resumen?.venta_acumulada ?? 0))

  const pctVsAnt = (actual, anterior) => {
    if (!anterior) return null
    return ((actual - anterior) / anterior * 100)
  }

  const DiffBadge = ({ actual, anterior, isCurrency }) => {
    const pct = pctVsAnt(actual, anterior)
    if (pct === null) return null
    const pos = pct >= 0
    return (
      <span className={`${styles.diffBadge} ${pos ? styles.diffPos : styles.diffNeg}`}>
        {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
    )
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipLabel}>{label}</p>
        <p className={styles.tooltipVal}>
          {tabActiva === 'venta' ? fmt(d.value) : tabActiva === 'ticket' ? fmtDec(d.value) : `${fmtNum(d.value)} pollos`}
        </p>
      </div>
    )
  }

  const chartKey = tabActiva === 'venta' ? 'venta_total' : tabActiva === 'pollos' ? 'pollos_vendidos' : 'ticket_promedio'
  const chartColor = tabActiva === 'venta' ? '#F5C400' : tabActiva === 'pollos' ? '#4F8EF7' : '#00D395'

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>‹ Volver</button>
      <h1 className={styles.title}>{sucursal?.nombre}</h1>

      {/* Meta card */}
      {resumen ? (
        <div className={styles.metaCard}>
          <div className={styles.metaTop}>
            <div>
              <p className={styles.metaLabel}>Meta del periodo</p>
              <p className={styles.metaMonto}>{fmt(resumen.meta_venta)}</p>
              <p className={styles.metaFechas}>
                {format(parseISO(resumen.fecha_inicio), 'd MMM', { locale: es })} —{' '}
                {format(parseISO(resumen.fecha_fin), 'd MMM yyyy', { locale: es })}
              </p>
            </div>
            <div className={styles.pctBlock}>
              <span className={styles.pctNum}>{avance.toFixed(1)}</span>
              <span className={styles.pctSym}>%</span>
            </div>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{
              width: `${Math.min(avance, 100)}%`,
              background: avance >= 100 ? 'var(--success)' : avance >= 70 ? 'var(--yellow)' : 'var(--red)'
            }} />
          </div>
          <div className={styles.metaGrid}>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Acumulado</span>
              <span className={styles.metaStatVal}>{fmt(resumen.venta_acumulada)}</span>
            </div>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Días</span>
              <span className={styles.metaStatVal}>{resumen.dias_transcurridos} / {resumen.dias_totales}</span>
            </div>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Ticket promedio</span>
              <span className={styles.metaStatVal}>{fmtDec(resumen.ticket_promedio_periodo)}</span>
            </div>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Pollos totales</span>
              <span className={styles.metaStatVal}>{fmtNum(resumen.pollos_totales)}</span>
            </div>
          </div>
          <div className={styles.proyeccion}>
            <span className={styles.proyLabel}>Proyección final</span>
            <span className={styles.proyVal} style={{ color: proyeccion >= resumen.meta_venta ? 'var(--success)' : 'var(--red)' }}>
              {fmt(proyeccion)}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.noMeta}>Sin meta activa para esta sucursal</div>
      )}

      {/* Falta para la meta */}
      {resumen && (
        <div className={styles.faltaCard}>
          <div className={styles.faltaHead}>
            <span className={styles.faltaTitle}>Falta para la meta</span>
            <div className={styles.faltaTabs}>
              <button className={`${styles.faltaTab} ${faltaTab==='semana' ? styles.faltaTabOn : ''}`} onClick={() => setFaltaTab('semana')}>Semana</button>
              <button className={`${styles.faltaTab} ${faltaTab==='mes' ? styles.faltaTabOn : ''}`} onClick={() => setFaltaTab('mes')}>Mes</button>
            </div>
          </div>
          {faltaTab === 'semana' ? (
            faltaSem <= 0 ? (
              <p className={styles.faltaCumplida}>¡Meta semanal alcanzada!</p>
            ) : (
              <div className={styles.faltaRow}>
                <div className={styles.faltaItem}>
                  <span className={styles.faltaVal}>{fmt(faltaSem)}</span>
                  <span className={styles.faltaLbl}>en ventas</span>
                </div>
                {(resumen.pollos_meta ?? 0) > 0 && (
                  <>
                    <div className={styles.faltaDivider} />
                    <div className={styles.faltaItem}>
                      <span className={styles.faltaVal}>{fmtNum(faltaPollosSem)}</span>
                      <span className={styles.faltaLbl}>pollos</span>
                    </div>
                  </>
                )}
              </div>
            )
          ) : (
            faltaMes <= 0 ? (
              <p className={styles.faltaCumplida}>¡Meta del periodo alcanzada!</p>
            ) : (
              <div className={styles.faltaRow}>
                <div className={styles.faltaItem}>
                  <span className={styles.faltaVal}>{fmt(faltaMes)}</span>
                  <span className={styles.faltaLbl}>en ventas</span>
                </div>
                <div className={styles.faltaDivider} />
                <div className={styles.faltaItem}>
                  <span className={styles.faltaVal}>{diasRestantes}</span>
                  <span className={styles.faltaLbl}>días restantes</span>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* SEMANA ACTUAL */}
      <div className={styles.semanaCard}>
        <div className={styles.semanaHeader}>
          <p className={styles.semanaTitle}>Esta semana</p>
          <p className={styles.semanaSub}>{ventasSemana.length} días registrados</p>
        </div>

        {/* KPIs semanales */}
        <div className={styles.semanaKpis}>
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Venta total</span>
            <span className={styles.kpiVal}>{fmt(totalVentaSemana)}</span>
            <DiffBadge actual={totalVentaSemana} anterior={totalVentaSemAnt} />
          </div>
          <div className={styles.semanaDivider} />
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Pollos</span>
            <span className={styles.kpiVal}>{fmtNum(totalPollosSemana)}</span>
            <DiffBadge actual={totalPollosSemana} anterior={totalPollosSemAnt} />
          </div>
          <div className={styles.semanaDivider} />
          <div className={styles.semanaKpi}>
            <span className={styles.kpiLabel}>Ticket prom.</span>
            <span className={styles.kpiVal}>{fmtDec(ticketPromedioSemana)}</span>
            <DiffBadge actual={ticketPromedioSemana} anterior={ticketSemAnt} />
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {[
            { key: 'venta', label: 'Venta $' },
            { key: 'pollos', label: 'Pollos' },
            { key: 'ticket', label: 'Ticket' },
          ].map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${tabActiva === t.key ? styles.tabActive : ''}`}
              onClick={() => setTabActiva(t.key)}
              style={tabActiva === t.key ? { borderColor: chartColor, color: chartColor } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Barras por día */}
        <div className={styles.diasGrid}>
          {semanaActual.map((d, i) => {
            const val = d[chartKey] ?? 0
            const max = tabActiva === 'venta' ? maxVenta : tabActiva === 'pollos' ? maxPollos : maxTicket
            const pct = max > 0 ? (val / max) * 100 : 0
            return (
              <div key={i} className={styles.diaCol}>
                <span className={styles.diaVal}>
                  {!d.registrado ? '—' :
                    tabActiva === 'venta' ? `$${(val/1000).toFixed(1)}k` :
                    tabActiva === 'pollos' ? fmtNum(val) :
                    `$${val.toFixed(0)}`
                  }
                </span>
                <div className={styles.diaBarWrap}>
                  <div
                    className={styles.diaBar}
                    style={{
                      height: `${d.registrado ? Math.max(pct, 4) : 0}%`,
                      background: d.registrado ? chartColor : 'transparent'
                    }}
                  />
                </div>
                <span className={styles.diaNombre}>{d.dia}</span>
              </div>
            )
          })}
        </div>

        {/* Tabla detalle diario */}
        <div className={styles.semanaTabla}>
          <div className={styles.semanaTablaHead}>
            <span>Día</span>
            <span>Venta</span>
            <span>Pollos</span>
            <span>Ticket</span>
          </div>
          {semanaActual.map((d, i) => (
            <div key={i} className={`${styles.semanaTablaRow} ${!d.registrado ? styles.sinRegistro : ''}`}>
              <span className={styles.tdDia}>{d.dia}</span>
              <span className={styles.tdV}>{d.registrado ? fmt(d.venta_total) : '—'}</span>
              <span className={styles.tdP}>{d.registrado ? fmtNum(d.pollos_vendidos) : '—'}</span>
              <span className={styles.tdT}>{d.registrado ? fmtDec(d.ticket_promedio) : '—'}</span>
            </div>
          ))}
          {/* Totales */}
          <div className={styles.semanaTablaTotal}>
            <span>Total</span>
            <span>{fmt(totalVentaSemana)}</span>
            <span>{fmtNum(totalPollosSemana)}</span>
            <span>{fmtDec(ticketPromedioSemana)}</span>
          </div>
        </div>
      </div>

      {/* Gráfica histórica */}
      {ventas.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Ventas diarias — historial</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={ventas.map(v => ({
              fecha: format(parseISO(v.fecha), 'd MMM', { locale: es }),
              venta: v.venta_total,
            }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ventaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C400" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F5C400" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="fecha" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Barlow Condensed' }}
                axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'DM Mono' }}
                axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div className={styles.tooltip}>
                  <p className={styles.tooltipLabel}>{label}</p>
                  <p className={styles.tooltipVal}>{fmt(payload[0]?.value)}</p>
                </div>
              ) : null} />
              <Area type="monotone" dataKey="venta" stroke="#F5C400" strokeWidth={2}
                fill="url(#ventaGrad)" dot={false} activeDot={{ r: 4, fill: '#F5C400' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {ventas.length === 0 && <div className={styles.noData}>Sin registros de venta aún</div>}
    </div>
  )
}
