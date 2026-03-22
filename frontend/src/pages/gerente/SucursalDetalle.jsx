import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import styles from './SucursalDetalle.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)

export default function SupervisorSucursal() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sucursal, setSucursal] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: suc }, { data: res }, { data: vData }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('id', id).single(),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', id).order('fecha', { ascending: true }).limit(30),
    ])
    setSucursal(suc)
    setResumen(res)
    setVentas(vData ?? [])
    setLoading(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const avance = resumen?.avance_porcentaje ?? 0
  const chartData = ventas.map(v => ({
    fecha: format(parseISO(v.fecha), 'd MMM', { locale: es }),
    venta: v.venta_total,
    pollos: v.pollos_vendidos,
    ticket: parseFloat(v.ticket_promedio ?? 0),
  }))

  // Calcular promedio diario y proyección
  const promDiario = ventas.length > 0
    ? ventas.reduce((a, v) => a + v.venta_total, 0) / ventas.length
    : 0
  const diasRestantes = resumen ? resumen.dias_totales - resumen.dias_transcurridos : 0
  const proyeccion = resumen ? resumen.venta_acumulada + (promDiario * diasRestantes) : 0

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipLabel}>{label}</p>
        <p className={styles.tooltipVal}>{fmt(payload[0]?.value)}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/gerente')}>
        ‹ Volver
      </button>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{sucursal?.nombre}</h1>
      </div>

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
              <span className={styles.metaStatLabel}>Días transcurridos</span>
              <span className={styles.metaStatVal}>{resumen.dias_transcurridos} / {resumen.dias_totales}</span>
            </div>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Ticket promedio</span>
              <span className={styles.metaStatVal}>{fmtDec(resumen.ticket_promedio_periodo)}</span>
            </div>
            <div className={styles.metaStat}>
              <span className={styles.metaStatLabel}>Pollos vendidos</span>
              <span className={styles.metaStatVal}>{resumen.pollos_totales.toLocaleString()}</span>
            </div>
          </div>

          {/* Proyección */}
          <div className={styles.proyeccion}>
            <span className={styles.proyLabel}>Proyección final</span>
            <span
              className={styles.proyVal}
              style={{ color: proyeccion >= resumen.meta_venta ? 'var(--success)' : 'var(--red)' }}
            >
              {fmt(proyeccion)}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.noMeta}>Sin meta activa para esta sucursal</div>
      )}

      {/* Gráfica de ventas */}
      {chartData.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Ventas diarias</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ventaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5C400" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F5C400" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="fecha"
                tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Barlow Condensed' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'DM Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="venta"
                stroke="#F5C400"
                strokeWidth={2}
                fill="url(#ventaGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#F5C400' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla de ventas */}
      {ventas.length > 0 && (
        <div className={styles.section}>
          <p className={styles.secTitle}>Registro diario</p>
          <div className={styles.tabla}>
            <div className={styles.tablaHead}>
              <span>Fecha</span>
              <span>Venta</span>
              <span>Pollos</span>
              <span>TP</span>
            </div>
            {[...ventas].reverse().map(v => (
              <div key={v.id} className={styles.tablaRow}>
                <span className={styles.tdFecha}>
                  {format(parseISO(v.fecha), 'EEE d MMM', { locale: es })}
                </span>
                <span className={styles.tdVenta}>{fmt(v.venta_total)}</span>
                <span className={styles.tdPollos}>{v.pollos_vendidos}</span>
                <span className={styles.tdTicket}>{fmtDec(v.ticket_promedio)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ventas.length === 0 && (
        <div className={styles.noData}>Sin registros de venta aún</div>
      )}
    </div>
  )
}
