import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Package, Plus, X, CheckCircle, AlertTriangle, AlertCircle,
  Clock, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import styles from './PedidosTaco.module.css'

const ESTADO_CFG = {
  pendiente: { label: 'Pendiente', color: 'var(--yellow)', bg: 'rgba(245,196,0,0.1)',   border: 'rgba(245,196,0,0.3)' },
  aceptado:  { label: 'Aceptado',  color: 'var(--success)', bg: 'rgba(0,211,149,0.1)',  border: 'rgba(0,211,149,0.3)' },
  parcial:   { label: 'Parcial',   color: 'var(--info)',    bg: 'rgba(79,142,247,0.1)', border: 'rgba(79,142,247,0.3)' },
  rechazado: { label: 'Rechazado', color: 'var(--red)',     bg: 'rgba(232,25,44,0.1)',  border: 'rgba(232,25,44,0.3)' },
}

export default function SupervisorPedidosTaco() {
  const { usuario, rol } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [pedidos,    setPedidos]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)

  const [sucursalId, setSucursalId] = useState('')
  const [cantidad,   setCantidad]   = useState('')
  const [notas,      setNotas]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)

  useEffect(() => { if (usuario?.id) load() }, [usuario])

  async function load() {
    setLoading(true)
    let sucs = []
    if (rol === 'suplente') {
      const { data } = await supabase
        .from('sucursales')
        .select('id, nombre')
        .eq('activa', true)
        .order('nombre')
      sucs = data ?? []
    } else {
      const { data } = await supabase
        .from('supervisor_sucursales')
        .select('sucursal_id, sucursales(id, nombre)')
        .eq('supervisor_id', usuario.id)
      sucs = data?.map(s => s.sucursales) ?? []
    }
    setSucursales(sucs)
    if (sucs.length > 0 && !sucursalId) setSucursalId(sucs[0].id)

    const { data: peds } = await supabase
      .from('pedidos_pollo_taco')
      .select('*')
      .eq('solicitado_por', usuario.id)
      .order('created_at', { ascending: false })

    setPedidos(peds ?? [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sucursalId || !cantidad) return
    setSaving(true)
    const { error } = await supabase.from('pedidos_pollo_taco').insert({
      sucursal_id:        sucursalId,
      solicitado_por:     usuario.id,
      cantidad_solicitada: parseInt(cantidad),
      notas_supervisor:   notas || null,
      estado:             'pendiente',
    })
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Pedido enviado a cocina' })
      setCantidad('')
      setNotas('')
      setShowForm(false)
      setTimeout(() => setMsg(null), 3500)
      await load()
    }
    setSaving(false)
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  const pendientes = pedidos.filter(p => p.estado === 'pendiente')
  const sucMap     = Object.fromEntries(sucursales.map(s => [s.id, s.nombre]))

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Package size={18} strokeWidth={2} color="var(--info)" />
          <h2 className={styles.pageTitle}>Pedido Taco</h2>
          {pendientes.length > 0 && (
            <span className={styles.countBadge}>{pendientes.length}</span>
          )}
        </div>
        <p className={styles.pageDate} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {msg && !showForm && (
        <div className={`${styles.msgBox} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok'
            ? <CheckCircle size={14} strokeWidth={2} />
            : <AlertCircle size={14} strokeWidth={2.5} />
          }
          {msg.texto}
        </div>
      )}

      {/* ── Formulario nuevo pedido ── */}
      <div className={styles.formCard}>
        {!showForm ? (
          <button className={styles.newBtn} onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={2} />
            Nuevo pedido de pollo a cocina
          </button>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formHeader}>
              <div className={styles.formTitleRow}>
                <Package size={14} strokeWidth={2} color="var(--info)" />
                <p className={styles.formTitle}>Solicitar pollo a cocina</p>
              </div>
              <button type="button" className={styles.formClose} onClick={() => setShowForm(false)}>
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Sucursal</label>
              <select
                className={styles.formSelect}
                value={sucursalId}
                onChange={e => setSucursalId(e.target.value)}
                required
              >
                {sucursales.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Cantidad de bolsas</label>
              <input
                className={styles.formInput}
                type="number"
                min="1"
                placeholder="0"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                required
                autoFocus
              />
              <p className={styles.formHint}>1 bolsa = 2 kg · 80 tacos</p>
              {cantidad && parseInt(cantidad) > 0 && (
                <p className={styles.formCalc}>≈ {parseInt(cantidad) * 80} tacos</p>
              )}
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Notas (opcional)</label>
              <textarea
                className={styles.formTextarea}
                placeholder="Ej: Urgente, para el turno de la tarde…"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={2}
              />
            </div>

            {msg && (
              <div className={`${styles.msgBox} ${styles[msg.tipo]}`}>
                {msg.tipo === 'ok'
                  ? <CheckCircle size={13} strokeWidth={2} />
                  : <AlertCircle size={13} strokeWidth={2.5} />
                }
                {msg.texto}
              </div>
            )}

            <button
              className={styles.submitBtn}
              type="submit"
              disabled={saving || !cantidad}
            >
              <Send size={14} strokeWidth={2} />
              {saving ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}
      </div>

      {/* ── Lista de pedidos ── */}
      {pedidos.length === 0 ? (
        <div className={styles.emptySection}>
          <Package size={32} strokeWidth={1.5} color="var(--text-muted)" style={{ opacity: 0.35 }} />
          <span>Aún no has hecho pedidos</span>
        </div>
      ) : (
        <div className={styles.pedidosList}>
          <p className={styles.sectionLabel}>Mis pedidos</p>
          {pedidos.map(pedido => {
            const cfg   = ESTADO_CFG[pedido.estado] ?? ESTADO_CFG.pendiente
            const fecha = pedido.created_at
              ? format(parseISO(pedido.created_at), "d MMM, HH:mm", { locale: es })
              : '—'
            return (
              <div key={pedido.id} className={styles.pedidoCard} style={{ borderColor: cfg.border }}>
                <div className={styles.pedidoTop}>
                  <div className={styles.pedidoLeft}>
                    <p className={styles.pedidoSuc}>{sucMap[pedido.sucursal_id] ?? '—'}</p>
                    <p className={styles.pedidoFecha}>{fecha}</p>
                  </div>
                  <span
                    className={styles.estadoBadge}
                    style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
                  >
                    {pedido.estado === 'pendiente' && <Clock size={9} strokeWidth={2.5} />}
                    {pedido.estado === 'aceptado'  && <CheckCircle size={9} strokeWidth={2.5} />}
                    {pedido.estado === 'rechazado' && <AlertTriangle size={9} strokeWidth={2.5} />}
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

                {pedido.notas_cocina && (
                  <p className={styles.notaCocina}>
                    <span style={{ color: 'var(--text-muted)' }}>Cocina: </span>
                    "{pedido.notas_cocina}"
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
