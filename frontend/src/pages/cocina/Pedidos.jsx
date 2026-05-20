import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Package, Brain, CheckCircle, X, AlertTriangle,
  Clock, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import styles from './Pedidos.module.css'

// ─── Modelo ML: suavizado exponencial ponderado por día de semana ───────────
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function entrenarModelo(historial) {
  // historial: [{fecha, pollos_vendidos}] ordenado por fecha asc
  const byDow = Array(7).fill(null).map(() => [])
  historial.forEach((d, i) => {
    const dow = new Date(d.fecha + 'T00:00:00').getDay()
    const weight = Math.pow(1.08, i)
    byDow[dow].push({ value: d.pollos_vendidos || 0, weight })
  })
  const dowAvg = byDow.map(items => {
    if (!items.length) return null
    const { sw, swv } = items.reduce(
      (acc, { value, weight }) => ({ swv: acc.swv + value * weight, sw: acc.sw + weight }),
      { swv: 0, sw: 0 }
    )
    return sw > 0 ? swv / sw : null
  })
  return dowAvg
}

function predecir(dowAvg, daysAhead = 7) {
  const hoy = new Date()
  return Array.from({ length: daysAhead }, (_, i) => {
    const fecha = addDays(hoy, i + 1)
    const dow = fecha.getDay()
    return {
      fecha: format(fecha, 'yyyy-MM-dd'),
      label: DOW_LABELS[dow] + ' ' + format(fecha, 'd/M'),
      prediccion: dowAvg[dow] != null ? Math.round(dowAvg[dow]) : 0,
    }
  })
}
// ────────────────────────────────────────────────────────────────────────────

const ESTADO_CFG = {
  pendiente: { label: 'Pendiente', color: 'var(--yellow)', bg: 'rgba(245,196,0,0.1)',   border: 'rgba(245,196,0,0.3)' },
  aceptado:  { label: 'Aceptado',  color: 'var(--success)', bg: 'rgba(0,211,149,0.1)',  border: 'rgba(0,211,149,0.3)' },
  parcial:   { label: 'Parcial',   color: 'var(--info)',    bg: 'rgba(79,142,247,0.1)', border: 'rgba(79,142,247,0.3)' },
  rechazado: { label: 'Rechazado', color: 'var(--red)',     bg: 'rgba(232,25,44,0.1)',  border: 'rgba(232,25,44,0.3)' },
}

export default function CocinaPedidos() {
  const [pedidos,       setPedidos]       = useState([])
  const [sucMap,        setSucMap]        = useState({})
  const [supMap,        setSupMap]        = useState({})
  const [predicciones,  setPredicciones]  = useState([])
  const [usandoTacos,   setUsandoTacos]   = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [showML,        setShowML]        = useState(true)

  // Modal responder
  const [respondiendo,    setRespondiendo]    = useState(null)
  const [cantidadEnviada, setCantidadEnviada] = useState('')
  const [notasCocina,     setNotasCocina]     = useState('')
  const [saving,          setSaving]          = useState(false)
  const [msgModal,        setMsgModal]        = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const hoy    = format(new Date(), 'yyyy-MM-dd')
    const hace56 = format(subDays(new Date(), 56), 'yyyy-MM-dd')

    const [
      { data: pedsData },
      { data: sucsData },
      { data: ventasData },
    ] = await Promise.all([
      supabase
        .from('pedidos_pollo_taco')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('sucursales').select('id, nombre'),
      supabase
        .from('ventas_diarias')
        .select('fecha, pollos_vendidos, tacos_vendidos')
        .gte('fecha', hace56)
        .lte('fecha', hoy)
        .order('fecha', { ascending: true }),
    ])

    setPedidos(pedsData ?? [])

    const sm = {}
    sucsData?.forEach(s => { sm[s.id] = s.nombre })
    setSucMap(sm)

    // Obtener nombres de supervisores que hicieron pedidos
    const supIds = [...new Set((pedsData ?? []).map(p => p.solicitado_por).filter(Boolean))]
    if (supIds.length) {
      const { data: supData } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', supIds)
      const sm2 = {}
      supData?.forEach(u => { sm2[u.id] = u.nombre })
      setSupMap(sm2)
    }

    // ML: agrupar por fecha
    const porFecha = {}
    ventasData?.forEach(v => {
      if (!porFecha[v.fecha]) porFecha[v.fecha] = { fecha: v.fecha, pollos_vendidos: 0, tacos_vendidos: 0 }
      porFecha[v.fecha].pollos_vendidos += v.pollos_vendidos || 0
      porFecha[v.fecha].tacos_vendidos  += v.tacos_vendidos  || 0
    })
    const historial = Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha))

    if (historial.length >= 7) {
      // Preferir predicción de tacos si hay datos de tacos
      const conTacos = historial.filter(d => d.tacos_vendidos > 0)
      if (conTacos.length >= 7) {
        const histTacos = historial.map(d => ({ ...d, pollos_vendidos: d.tacos_vendidos }))
        const dowAvg = entrenarModelo(histTacos)
        setPredicciones(predecir(dowAvg, 7))
        setUsandoTacos(true)
      } else {
        const dowAvg = entrenarModelo(historial)
        setPredicciones(predecir(dowAvg, 7))
        setUsandoTacos(false)
      }
    }

    setLoading(false)
  }

  function abrirModal(pedido) {
    setRespondiendo(pedido)
    setCantidadEnviada(String(pedido.cantidad_solicitada))
    setNotasCocina('')
    setMsgModal(null)
  }

  async function handleResponder(e) {
    e.preventDefault()
    if (!respondiendo || cantidadEnviada === '') return
    const enviada = parseInt(cantidadEnviada)
    if (isNaN(enviada) || enviada < 0) return
    const solicitada = respondiendo.cantidad_solicitada
    const estado = enviada === 0 ? 'rechazado' : enviada >= solicitada ? 'aceptado' : 'parcial'

    setSaving(true)
    const { error } = await supabase
      .from('pedidos_pollo_taco')
      .update({
        cantidad_enviada: enviada,
        estado,
        notas_cocina: notasCocina || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', respondiendo.id)

    if (error) {
      setMsgModal({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setRespondiendo(null)
      await load()
    }
    setSaving(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const pendientes  = pedidos.filter(p => p.estado === 'pendiente')
  const respondidos = pedidos.filter(p => p.estado !== 'pendiente')

  // Preview del estado según lo que escribe cocina
  const prevEnviada = parseInt(cantidadEnviada)
  let prevEstado = null
  if (respondiendo && !isNaN(prevEnviada)) {
    if (prevEnviada === 0) prevEstado = 'rechazado'
    else if (prevEnviada >= respondiendo.cantidad_solicitada) prevEstado = 'aceptado'
    else prevEstado = 'parcial'
  }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Package size={18} strokeWidth={2} color="var(--info)" />
          <h2 className={styles.pageTitle}>Pedidos</h2>
          {pendientes.length > 0 && (
            <span className={styles.countBadge}>{pendientes.length}</span>
          )}
        </div>
        <p className={styles.pageDate} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* ── ML Predicción ── */}
      <div className={styles.mlCard}>
        <button className={styles.mlHeader} onClick={() => setShowML(v => !v)}>
          <div className={styles.mlTitleRow}>
            <Brain size={15} strokeWidth={2} color="var(--info)" />
            <span className={styles.mlTitle}>Predicción de {usandoTacos ? 'tacos' : 'demanda'}</span>
            <span className={styles.mlAiBadge}>IA</span>
            {usandoTacos && <span className={styles.mlTacosBadge}>Tacos</span>}
          </div>
          {showML
            ? <ChevronUp size={15} strokeWidth={2} color="var(--text-muted)" />
            : <ChevronDown size={15} strokeWidth={2} color="var(--text-muted)" />
          }
        </button>

        {showML && (
          <div className={styles.mlBody}>
            {predicciones.length === 0 ? (
              <p className={styles.mlNoData}>
                Datos insuficientes — se requieren al menos 7 días de historial de ventas
              </p>
            ) : (
              <>
                <p className={styles.mlDesc}>
                  Estimación {usandoTacos ? 'de tacos vendidos' : 'de pollos vendidos'} — últimos 56 días · pesos exponenciales por día de semana
                </p>
                <div className={styles.mlChart}>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={predicciones} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--text-muted)', fontSize: 9.5, fontFamily: 'var(--font-body)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-muted)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontFamily: 'var(--font-body)',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--text-secondary)', fontWeight: 700 }}
                        itemStyle={{ color: 'var(--info)' }}
                        formatter={v => [`${v} ${usandoTacos ? 'tacos' : 'pollos'}`, 'Predicción']}
                      />
                      <Bar dataKey="prediccion" fill="var(--info)" radius={[4, 4, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className={styles.mlPills}>
                  {predicciones.slice(0, 3).map(p => (
                    <div key={p.fecha} className={styles.mlPill}>
                      <span className={styles.mlPillDay}>{p.label.split(' ')[0]}</span>
                      <span className={styles.mlPillVal}>{p.prediccion}</span>
                      <span className={styles.mlPillUnit}>{usandoTacos ? 'tacos' : 'pollos'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Pendientes ── */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>
          <Clock size={12} strokeWidth={2.5} color="var(--yellow)" />
          Pendientes ({pendientes.length})
        </p>
        {pendientes.length === 0 ? (
          <div className={styles.emptySection}>
            <CheckCircle size={26} strokeWidth={1.5} color="var(--success)" style={{ opacity: 0.45 }} />
            <span>Sin pedidos pendientes</span>
          </div>
        ) : (
          pendientes.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              sucNombre={sucMap[p.sucursal_id] ?? '—'}
              supNombre={supMap[p.solicitado_por] ?? '—'}
              onResponder={abrirModal}
            />
          ))
        )}
      </div>

      {/* ── Historial ── */}
      {respondidos.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>
            <CheckCircle size={12} strokeWidth={2.5} color="var(--text-muted)" />
            Historial ({respondidos.length})
          </p>
          {respondidos.slice(0, 15).map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              sucNombre={sucMap[p.sucursal_id] ?? '—'}
              supNombre={supMap[p.solicitado_por] ?? '—'}
              readonly
            />
          ))}
        </div>
      )}

      {/* ── Modal de respuesta ── */}
      {respondiendo && (
        <div className={styles.overlay} onClick={() => setRespondiendo(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>Responder pedido</p>
              <button className={styles.modalClose} onClick={() => setRespondiendo(null)}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div className={styles.modalInfo}>
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Sucursal</span>
                <span className={styles.modalRowVal}>{sucMap[respondiendo.sucursal_id] ?? '—'}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Solicitó</span>
                <span className={styles.modalRowVal}>{supMap[respondiendo.solicitado_por] ?? '—'}</span>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Solicitadas</span>
                <span className={styles.modalRowVal} style={{ color: 'var(--info)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {respondiendo.cantidad_solicitada} bolsas
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                    ≈ {respondiendo.cantidad_solicitada * 80} tacos
                  </span>
                </span>
              </div>
              {respondiendo.notas_supervisor && (
                <div className={styles.modalRow}>
                  <span className={styles.modalRowLabel}>Nota</span>
                  <span className={styles.modalRowVal} style={{ fontStyle: 'italic' }}>
                    "{respondiendo.notas_supervisor}"
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={handleResponder} className={styles.modalForm}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>¿Cuántas bolsas vas a mandar?</label>
                <input
                  className={styles.modalInput}
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cantidadEnviada}
                  onChange={e => setCantidadEnviada(e.target.value)}
                  required
                  autoFocus
                />
                {cantidadEnviada !== '' && !isNaN(parseInt(cantidadEnviada)) && parseInt(cantidadEnviada) > 0 && (
                  <p className={styles.modalHint} style={{ color: 'var(--info)' }}>
                    ≈ {parseInt(cantidadEnviada) * 80} tacos
                  </p>
                )}
                {prevEstado && (
                  <p className={styles.modalHint} style={{ color: ESTADO_CFG[prevEstado].color }}>
                    {prevEstado === 'rechazado' && '→ Se marcará como Rechazado'}
                    {prevEstado === 'aceptado'  && '→ Se marcará como Aceptado (pedido completo)'}
                    {prevEstado === 'parcial'   && `→ Se marcará como Parcial (${prevEnviada}/${respondiendo.cantidad_solicitada} bolsas)`}
                  </p>
                )}
              </div>

              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Notas (opcional)</label>
                <textarea
                  className={styles.modalTextarea}
                  placeholder="Ej: Se envían en el próximo turno…"
                  value={notasCocina}
                  onChange={e => setNotasCocina(e.target.value)}
                  rows={2}
                />
              </div>

              {msgModal && (
                <div className={`${styles.msgBox} ${styles[msgModal.tipo]}`}>
                  <AlertTriangle size={13} strokeWidth={2.5} />
                  {msgModal.texto}
                </div>
              )}

              <button
                className={styles.modalSubmit}
                type="submit"
                disabled={saving || cantidadEnviada === ''}
              >
                <Send size={14} strokeWidth={2} />
                {saving ? 'Guardando…' : 'Confirmar respuesta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PedidoCard({ pedido, sucNombre, supNombre, onResponder, readonly }) {
  const cfg   = ESTADO_CFG[pedido.estado] ?? ESTADO_CFG.pendiente
  const fecha = pedido.created_at
    ? format(parseISO(pedido.created_at), "d MMM, HH:mm", { locale: es })
    : '—'

  return (
    <div className={styles.pedidoCard} style={{ borderColor: cfg.border }}>
      <div className={styles.pedidoTop}>
        <div className={styles.pedidoLeft}>
          <p className={styles.pedidoSuc}>{sucNombre}</p>
          <p className={styles.pedidoMeta}>{supNombre} · {fecha}</p>
        </div>
        <span
          className={styles.estadoBadge}
          style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
        >
          {cfg.label}
        </span>
      </div>

      <div className={styles.pedidoCants}>
        <div className={styles.pedidoCant}>
          <span className={styles.pedidoCantVal}>{pedido.cantidad_solicitada}</span>
          <span className={styles.pedidoCantLabel}>Bolsas solicitadas</span>
          <span className={styles.pedidoCantEq}>≈ {pedido.cantidad_solicitada * 80} tacos</span>
        </div>
        {pedido.cantidad_enviada != null && (
          <div className={styles.pedidoCant}>
            <span className={styles.pedidoCantVal} style={{ color: cfg.color }}>
              {pedido.cantidad_enviada}
            </span>
            <span className={styles.pedidoCantLabel}>Bolsas enviadas</span>
            <span className={styles.pedidoCantEq}>≈ {pedido.cantidad_enviada * 80} tacos</span>
          </div>
        )}
      </div>

      {pedido.notas_supervisor && (
        <p className={styles.pedidoNota}>
          <span style={{ color: 'var(--text-muted)' }}>Sup: </span>
          "{pedido.notas_supervisor}"
        </p>
      )}
      {pedido.notas_cocina && (
        <p className={styles.pedidoNota} style={{ color: 'var(--info)' }}>
          <span>Cocina: </span>"{pedido.notas_cocina}"
        </p>
      )}

      {!readonly && (
        <button className={styles.responderBtn} onClick={() => onResponder(pedido)}>
          <Send size={13} strokeWidth={2} />
          Responder
        </button>
      )}
    </div>
  )
}
