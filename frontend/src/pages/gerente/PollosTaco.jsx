import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell
} from 'recharts'
import {
  Utensils, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, TrendingDown
} from 'lucide-react'
import styles from './PollosTaco.module.css'

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
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name === 'stock' ? 'Stock' : 'Mínimo'}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function GerentePollosTaco() {
  const hoyStr    = format(new Date(), 'yyyy-MM-dd')
  const mananaStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [sucursales,  setSucursales]  = useState([])
  const [supervisores, setSupervisores] = useState([])
  const [supSucMap,   setSupSucMap]   = useState({})
  const [lotesMap,    setLotesMap]    = useState({})
  const [minimosMap,  setMinimosMap]  = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filtroSup,   setFiltroSup]   = useState('todos')
  const [expandedSuc, setExpandedSuc] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: sucs }, { data: sups }, { data: ss }, { data: lotes }, { data: minimos }] = await Promise.all([
        supabase.from('sucursales').select('*').eq('activa', true).order('nombre'),
        supabase.from('usuarios').select('id, nombre, roles!inner(nombre)').eq('roles.nombre', 'supervisor'),
        supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id'),
        supabase.from('pollos_taco').select('*').order('fecha_rostizado', { ascending: false }),
        supabase.from('pollos_taco_minimos').select('*'),
      ])

      setSucursales(sucs ?? [])
      setSupervisores(sups ?? [])

      const ssMap = {}
      ss?.forEach(r => {
        if (!ssMap[r.supervisor_id]) ssMap[r.supervisor_id] = []
        ssMap[r.supervisor_id].push(r.sucursal_id)
      })
      setSupSucMap(ssMap)

      const lMap = {}
      const mMap = {}
      sucs?.forEach(s => { lMap[s.id] = []; mMap[s.id] = 0 })
      lotes?.forEach(l => { if (lMap[l.sucursal_id]) lMap[l.sucursal_id].push(l) })
      minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })
      setLotesMap(lMap)
      setMinimosMap(mMap)
    } finally {
      setLoading(false)
    }
  }

  const sucursalesFiltradas = sucursales.filter(s =>
    filtroSup === 'todos' || (supSucMap[filtroSup] ?? []).includes(s.id)
  )

  function getStock(sucId) {
    return (lotesMap[sucId] ?? []).filter(l => l.fecha_caducidad > hoyStr).reduce((a, l) => a + l.cantidad, 0)
  }
  function getExpirando(sucId) {
    return (lotesMap[sucId] ?? []).filter(l => l.fecha_caducidad === mananaStr)
  }
  function getDeficit(sucId) {
    const m = minimosMap[sucId] ?? 0
    return m > 0 && getStock(sucId) < m
  }

  // KPIs globales
  const totalStock      = sucursalesFiltradas.reduce((a, s) => a + getStock(s.id), 0)
  const totalDeficit    = sucursalesFiltradas.filter(s => getDeficit(s.id)).length
  const totalExpirando  = sucursalesFiltradas.filter(s => getExpirando(s.id).length > 0).length
  const totalLotes      = sucursalesFiltradas.reduce((a, s) => a + (lotesMap[s.id] ?? []).filter(l => l.fecha_caducidad > hoyStr).length, 0)

  // Data para gráfica
  const chartData = sucursalesFiltradas.map(s => ({
    nombre: s.nombre.length > 10 ? s.nombre.slice(0, 10) + '…' : s.nombre,
    nombreFull: s.nombre,
    stock:  getStock(s.id),
    minimo: minimosMap[s.id] ?? 0,
    deficit: getDeficit(s.id),
  })).sort((a, b) => b.stock - a.stock)

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Utensils size={18} strokeWidth={2} color="var(--info)" />
          <h2 className={styles.pageTitle}>Pollo para Taco</h2>
        </div>
        <p className={styles.pageDate} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* ── Filtro supervisor ── */}
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

      {/* ── KPIs ── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiVal}>{totalStock}</span>
          <span className={styles.kpiLabel}>Stock global</span>
        </div>
        <div className={`${styles.kpiCard} ${totalDeficit > 0 ? styles.kpiDanger : ''}`}>
          <span className={styles.kpiVal} style={{ color: totalDeficit > 0 ? 'var(--red)' : 'var(--success)' }}>
            {totalDeficit}
          </span>
          <span className={styles.kpiLabel}>Con déficit</span>
        </div>
        <div className={`${styles.kpiCard} ${totalExpirando > 0 ? styles.kpiWarn : ''}`}>
          <span className={styles.kpiVal} style={{ color: totalExpirando > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {totalExpirando}
          </span>
          <span className={styles.kpiLabel}>Caducan hoy</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiVal}>{totalLotes}</span>
          <span className={styles.kpiLabel}>Lotes activos</span>
        </div>
      </div>

      {/* ── Alertas ── */}
      {totalDeficit > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertDanger}`}>
          <TrendingDown size={14} strokeWidth={2.5} />
          <span>
            <strong>{totalDeficit}</strong> sucursal{totalDeficit !== 1 ? 'es' : ''} con stock menor al mínimo requerido
          </span>
        </div>
      )}
      {totalExpirando > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertWarn}`}>
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span>
            <strong>{totalExpirando}</strong> sucursal{totalExpirando !== 1 ? 'es' : ''} con lotes en su último día válido
          </span>
        </div>
      )}

      {/* ── Gráfica Stock vs Mínimo ── */}
      {chartData.length > 0 && (
        <div className={styles.chartCard}>
          <p className={styles.chartTitle}>Stock actual vs Mínimo requerido</p>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={220}>
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
                <Legend
                  formatter={(v) => v === 'stock' ? 'Stock' : 'Mínimo'}
                  wrapperStyle={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', paddingTop: 8 }}
                />
                <Bar dataKey="stock" name="stock" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.deficit ? '#E8192C' : entry.stock === 0 ? 'rgba(255,255,255,0.15)' : '#4F8EF7'} />
                  ))}
                </Bar>
                <Bar dataKey="minimo" name="minimo" fill="rgba(245,196,0,0.3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#4F8EF7' }} /> Stock OK</span>
            <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#E8192C' }} /> Con déficit</span>
            <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'rgba(245,196,0,0.6)' }} /> Mínimo</span>
          </div>
        </div>
      )}

      {/* ── Lista detallada por sucursal ── */}
      <p className={styles.secTitle}>
        Detalle por sucursal — {sucursalesFiltradas.length} {sucursalesFiltradas.length !== 1 ? 'sucursales' : 'sucursal'}
      </p>

      <div className={styles.sucList}>
        {sucursalesFiltradas.map(suc => {
          const lotes    = (lotesMap[suc.id] ?? [])
          const minimo   = minimosMap[suc.id] ?? 0
          const vigentes = lotes.filter(l => l.fecha_caducidad > hoyStr)
          const stock    = vigentes.reduce((a, l) => a + l.cantidad, 0)
          const expirando = vigentes.filter(l => l.fecha_caducidad === mananaStr)
          const deficit   = minimo > 0 && stock < minimo
          const isExpanded = expandedSuc[suc.id] ?? false
          const pct = minimo > 0 ? Math.min((stock / minimo) * 100, 100) : 100
          let barColor = 'var(--success)'
          if (deficit) barColor = 'var(--red)'
          else if (expirando.length > 0) barColor = 'var(--yellow)'

          return (
            <div key={suc.id} className={styles.sucRow}>
              <div className={styles.sucRowHeader} onClick={() => setExpandedSuc(m => ({ ...m, [suc.id]: !m[suc.id] }))}>
                <div className={styles.sucRowLeft}>
                  <p className={styles.sucNombre}>{suc.nombre}</p>
                  <div className={styles.sucMeta}>
                    {minimo > 0 && (
                      <span className={styles.sucMinLabel}>Mín: {minimo}</span>
                    )}
                    {expirando.length > 0 && (
                      <span className={styles.warnTag}>
                        <AlertTriangle size={9} strokeWidth={2.5} /> Caduca hoy
                      </span>
                    )}
                    {deficit && (
                      <span className={styles.dangerTag}>
                        <AlertTriangle size={9} strokeWidth={2.5} /> Déficit
                      </span>
                    )}
                    {!deficit && expirando.length === 0 && stock > 0 && (
                      <span className={styles.okTag}>
                        <CheckCircle size={9} strokeWidth={2.5} /> OK
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.sucRowRight}>
                  <div className={styles.stockDisp}>
                    <span className={styles.stockVal} style={{ color: barColor }}>{stock}</span>
                    {minimo > 0 && <span className={styles.stockOf}>/{minimo}</span>}
                  </div>
                  {isExpanded ? <ChevronUp size={14} strokeWidth={2} color="var(--text-muted)" /> : <ChevronDown size={14} strokeWidth={2} color="var(--text-muted)" />}
                </div>
              </div>

              {minimo > 0 && (
                <div className={styles.sucProgressBar}>
                  <div className={styles.sucProgressFill} style={{ width: `${pct}%`, background: barColor }} />
                </div>
              )}

              {isExpanded && vigentes.length > 0 && (
                <div className={styles.sucRowBody}>
                  <p className={styles.lotesDetailLabel}>Lotes vigentes</p>
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
                </div>
              )}
              {isExpanded && vigentes.length === 0 && (
                <div className={styles.sucRowBody}>
                  <p className={styles.noLotes}>Sin lotes vigentes</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
