import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import {
  Utensils, AlertTriangle, CheckCircle, ChevronDown, ChevronUp
} from 'lucide-react'
import styles from './PollosTaco.module.css'
import { getCached, setCached } from '../../lib/pageCache'
import PageSkeleton from '../../components/PageSkeleton'

function diasParaCaducar(fechaCaducidad, hoyStr) {
  const hoy = new Date(hoyStr + 'T00:00:00')
  const cad = new Date(fechaCaducidad + 'T00:00:00')
  return Math.round((cad - hoy) / 86400000)
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0B1220', border: '1px solid #1e2d4a',
      borderRadius: 10, padding: '10px 14px',
      fontFamily: 'var(--font-body)', fontSize: '0.78rem'
    }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#4F8EF7', margin: 0 }}>
        Existencia: <strong>{payload[0]?.value ?? 0} tacos</strong>
      </p>
    </div>
  )
}

export default function GerentePollosTaco() {
  const hoyStr    = format(new Date(), 'yyyy-MM-dd')
  const mananaStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [sucursales,   setSucursales]   = useState([])
  const [supervisores, setSupervisores] = useState([])
  const [supSucMap,    setSupSucMap]    = useState({})
  const [lotesMap,     setLotesMap]     = useState({})
  const [tacosMap,     setTacosMap]     = useState({})  // sucursalId → existencia tacos (últimos 3 días)
  const [loading,      setLoading]      = useState(true)
  const [filtroSup,    setFiltroSup]    = useState('todos')
  const [expandedSuc,  setExpandedSuc]  = useState({})

  useEffect(() => {
    const cached = getCached('ger-pollos')
    if (cached) {
      applyData(cached)
      setLoading(false)
      load(true)
    } else {
      load()
    }
  }, [])

  function applyData(d) {
    setSucursales(d.sucursales)
    setSupervisores(d.supervisores)
    setSupSucMap(d.supSucMap)
    setLotesMap(d.lotesMap)
    setTacosMap(d.tacosMap)
  }

  async function load(bg = false) {
    if (!bg) setLoading(true)
    try {
      const hace3 = format(subDays(new Date(), 2), 'yyyy-MM-dd')
      const [
        { data: sucs },
        { data: sups },
        { data: ss },
        { data: lotes },
        { data: ventasTacos },
      ] = await Promise.all([
        supabase.from('sucursales').select('*').eq('activa', true).order('nombre'),
        supabase.from('usuarios').select('id, nombre, roles!inner(nombre)').eq('roles.nombre', 'supervisor'),
        supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id'),
        supabase.from('pollos_taco').select('*').order('fecha_rostizado', { ascending: false }),
        supabase.from('ventas_diarias')
          .select('sucursal_id, tacos_producidos, tacos_vendidos')
          .gte('fecha', hace3),
      ])

      const ssMap = {}
      ss?.forEach(r => {
        if (!ssMap[r.supervisor_id]) ssMap[r.supervisor_id] = []
        ssMap[r.supervisor_id].push(r.sucursal_id)
      })
      const lMap = {}
      const tMap = {}
      sucs?.forEach(s => { lMap[s.id] = []; tMap[s.id] = 0 })
      lotes?.forEach(l => { if (lMap[l.sucursal_id]) lMap[l.sucursal_id].push(l) })
      ventasTacos?.forEach(v => {
        if (tMap[v.sucursal_id] !== undefined) {
          tMap[v.sucursal_id] += (v.tacos_producidos || 0) - (v.tacos_vendidos || 0)
        }
      })
      const d = { sucursales: sucs ?? [], supervisores: sups ?? [], supSucMap: ssMap, lotesMap: lMap, tacosMap: tMap }
      applyData(d)
      setCached('ger-pollos', d)
    } finally {
      setLoading(false)
    }
  }

  const sucursalesFiltradas = sucursales.filter(s =>
    filtroSup === 'todos' || (supSucMap[filtroSup] ?? []).includes(s.id)
  )

  function getExistencia(sucId) {
    return Math.max(0, tacosMap[sucId] ?? 0)
  }
  function getExpirando(sucId) {
    return (lotesMap[sucId] ?? []).filter(l => l.fecha_caducidad === mananaStr)
  }

  // KPIs globales
  const totalExistencia = sucursalesFiltradas.reduce((a, s) => a + getExistencia(s.id), 0)
  const totalSinTacos   = sucursalesFiltradas.filter(s => getExistencia(s.id) === 0).length
  const totalExpirando  = sucursalesFiltradas.filter(s => getExpirando(s.id).length > 0).length

  // Data para gráfica — ordenada de mayor a menor existencia
  const chartData = sucursalesFiltradas.map(s => ({
    nombre:     s.nombre.length > 10 ? s.nombre.slice(0, 10) + '…' : s.nombre,
    nombreFull: s.nombre,
    existencia: getExistencia(s.id),
    sinTacos:   getExistencia(s.id) === 0,
  })).sort((a, b) => b.existencia - a.existencia)

  if (loading) return <PageSkeleton hasChart rows={4} />

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Utensils size={18} strokeWidth={2} color="var(--info)" />
          <h2 className={styles.pageTitle}>Tacos por Sucursal</h2>
        </div>
        <p className={styles.pageDate} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* ── Filtro supervisor ── */}
      <div className={styles.filtroRow}>
        <button
          className={`${styles.filtroBtn} ${filtroSup === 'todos' ? styles.filtroBtnActive : ''}`}
          onClick={() => setFiltroSup('todos')}
        >
          Todas
        </button>
        {supervisores.map(sup => (
          <button
            key={sup.id}
            className={`${styles.filtroBtn} ${filtroSup === sup.id ? styles.filtroBtnActive : ''}`}
            onClick={() => setFiltroSup(sup.id)}
          >
            {sup.nombre.replace('Ruta ', '')}
          </button>
        ))}
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiVal} style={{ color: 'var(--info)' }}>{totalExistencia}</span>
          <span className={styles.kpiLabel}>Existencia total</span>
        </div>
        <div className={`${styles.kpiCard} ${totalSinTacos > 0 ? styles.kpiDanger : ''}`}>
          <span className={styles.kpiVal} style={{ color: totalSinTacos > 0 ? 'var(--red)' : 'var(--success)' }}>
            {totalSinTacos}
          </span>
          <span className={styles.kpiLabel}>Sin tacos</span>
        </div>
        <div className={`${styles.kpiCard} ${totalExpirando > 0 ? styles.kpiWarn : ''}`}>
          <span className={styles.kpiVal} style={{ color: totalExpirando > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {totalExpirando}
          </span>
          <span className={styles.kpiLabel}>Pollos caducan</span>
        </div>
      </div>

      {/* ── Alertas ── */}
      {totalSinTacos > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertDanger}`}>
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span>
            <strong>{totalSinTacos}</strong> sucursal{totalSinTacos !== 1 ? 'es' : ''} sin existencia de tacos
          </span>
        </div>
      )}
      {totalExpirando > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertWarn}`}>
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span>
            <strong>{totalExpirando}</strong> sucursal{totalExpirando !== 1 ? 'es' : ''} con pollos en su último día válido
          </span>
        </div>
      )}

      {/* ── Gráfica existencia tacos ── */}
      {chartData.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Existencia de tacos por sucursal</p>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="nombre"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'var(--font-body)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="existencia" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.sinTacos ? '#E8192C' : '#4F8EF7'}
                      opacity={entry.existencia === 0 ? 0.4 : 0.9}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#4F8EF7' }} /> Con existencia</span>
            <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#E8192C' }} /> Sin tacos</span>
          </div>
        </div>
      )}

      {/* ── Detalle por sucursal ── */}
      <p className={styles.secTitle}>
        Detalle por sucursal — {sucursalesFiltradas.length} {sucursalesFiltradas.length !== 1 ? 'sucursales' : 'sucursal'}
      </p>

      <div className={styles.sucList}>
        {sucursalesFiltradas.map(suc => {
          const existencia = getExistencia(suc.id)
          const lotes      = (lotesMap[suc.id] ?? [])
          const vigentes   = lotes.filter(l => l.fecha_caducidad > hoyStr)
          const expirando  = getExpirando(suc.id)
          const isExpanded = expandedSuc[suc.id] ?? false

          let tagColor = 'var(--success)'
          let statusTag = null
          if (existencia === 0) {
            tagColor = 'var(--red)'
            statusTag = <span className={styles.dangerTag}><AlertTriangle size={9} strokeWidth={2.5} /> Sin tacos</span>
          } else if (expirando.length > 0) {
            tagColor = 'var(--yellow)'
            statusTag = <span className={styles.warnTag}><AlertTriangle size={9} strokeWidth={2.5} /> Pollos caducan</span>
          } else {
            statusTag = <span className={styles.okTag}><CheckCircle size={9} strokeWidth={2.5} /> OK</span>
          }

          return (
            <div key={suc.id} className={styles.sucRow}>
              <div
                className={styles.sucRowHeader}
                onClick={() => setExpandedSuc(m => ({ ...m, [suc.id]: !m[suc.id] }))}
              >
                <div className={styles.sucRowLeft}>
                  <p className={styles.sucNombre}>{suc.nombre}</p>
                  <div className={styles.sucMeta}>{statusTag}</div>
                </div>
                <div className={styles.sucRowRight}>
                  <div className={styles.stockDisp}>
                    <span className={styles.stockVal} style={{ color: tagColor }}>{existencia}</span>
                    <span className={styles.stockOf}> tacos</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} strokeWidth={2} color="var(--text-muted)" />
                    : <ChevronDown size={14} strokeWidth={2} color="var(--text-muted)" />
                  }
                </div>
              </div>

              {/* Expandable: lotes de pollos (para gestión de caducidad) */}
              {isExpanded && (
                <div className={styles.sucRowBody}>
                  {vigentes.length > 0 ? (
                    <>
                      <p className={styles.lotesDetailLabel}>Lotes de pollos vigentes</p>
                      {vigentes.map(lote => {
                        const dias = diasParaCaducar(lote.fecha_caducidad, hoyStr)
                        let dColor = 'var(--success)'
                        if (dias === 1) dColor = 'var(--red)'
                        else if (dias === 2) dColor = 'var(--yellow)'
                        return (
                          <div key={lote.id} className={styles.loteDetailRow}>
                            <span className={styles.loteDetailDate}>
                              Rostizado {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                            </span>
                            <span className={styles.loteDetailCant}>{lote.cantidad} pollos</span>
                            <span className={styles.loteDetailDias} style={{ color: dColor }}>
                              {dias === 1 ? 'Último día' : `${dias} días`}
                            </span>
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <p className={styles.noLotes}>Sin pollos rostizados vigentes</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
