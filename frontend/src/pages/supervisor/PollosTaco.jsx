import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Utensils, AlertTriangle, CheckCircle, AlertCircle, Plus, X,
  Pencil, Trash2, Flame, Settings, ChevronDown, ChevronUp
} from 'lucide-react'
import styles from './PollosTaco.module.css'

function diasParaCaducar(fechaCaducidad, hoyStr) {
  const hoy = new Date(hoyStr + 'T00:00:00')
  const cad = new Date(fechaCaducidad + 'T00:00:00')
  return Math.round((cad - hoy) / 86400000)
}

export default function SupervisorPollosTaco() {
  const { usuario, rol } = useAuth()
  const hoyStr    = format(new Date(), 'yyyy-MM-dd')
  const mananaStr = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  const [sucursales,   setSucursales]   = useState([])
  const [lotesMap,     setLotesMap]     = useState({})   // sucursalId → lotes[]
  const [minimosMap,   setMinimosMap]   = useState({})   // sucursalId → cantidad_minima
  const [tacosMap,     setTacosMap]     = useState({})   // sucursalId → existencia tacos (últimos 3 días)
  const [loading,      setLoading]      = useState(true)

  // UI state
  const [expandedSuc, setExpandedSuc]     = useState({})  // sucursalId → bool
  const [addingMap,   setAddingMap]       = useState({})  // sucursalId → bool
  const [formMap,     setFormMap]         = useState({})  // sucursalId → {cantidad, fecha_rostizado}
  const [editingLote, setEditingLote]     = useState(null) // { id, cantidad, fecha_rostizado }
  const [editMinSuc,  setEditMinSuc]      = useState(null) // sucursalId being edited
  const [editMinVal,  setEditMinVal]      = useState('')
  const [saving,      setSaving]          = useState(false)
  const [msgs,        setMsgs]            = useState({})  // sucursalId → msg obj

  useEffect(() => { if (usuario?.id) load() }, [usuario])

  async function load() {
    setLoading(true)
    let sucs = []
    if (rol === 'suplente') {
      const { data } = await supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      sucs = data ?? []
    } else {
      const { data: supSuc } = await supabase
        .from('supervisor_sucursales')
        .select('sucursal_id, sucursales(id, nombre)')
        .eq('supervisor_id', usuario.id)
      sucs = supSuc?.map(s => s.sucursales) ?? []
    }
    setSucursales(sucs)

    if (!sucs.length) { setLoading(false); return }

    const sids    = sucs.map(s => s.id)
    const hace3   = format(subDays(new Date(), 2), 'yyyy-MM-dd')

    const [{ data: lotes }, { data: minimos }, { data: ventasTacos }] = await Promise.all([
      supabase.from('pollos_taco').select('*').in('sucursal_id', sids).order('fecha_rostizado', { ascending: false }),
      supabase.from('pollos_taco_minimos').select('*').in('sucursal_id', sids),
      supabase.from('ventas_diarias')
        .select('sucursal_id, tacos_producidos, tacos_vendidos')
        .in('sucursal_id', sids)
        .gte('fecha', hace3),
    ])

    const lMap = {}
    const mMap = {}
    const tMap = {}
    sids.forEach(id => { lMap[id] = []; mMap[id] = 0; tMap[id] = 0 })
    lotes?.forEach(l => { if (lMap[l.sucursal_id]) lMap[l.sucursal_id].push(l) })
    minimos?.forEach(m => { mMap[m.sucursal_id] = m.cantidad_minima })
    ventasTacos?.forEach(v => {
      if (tMap[v.sucursal_id] !== undefined) {
        tMap[v.sucursal_id] += (v.tacos_producidos || 0) - (v.tacos_vendidos || 0)
      }
    })

    setLotesMap(lMap)
    setMinimosMap(mMap)
    setTacosMap(tMap)

    // Init form defaults
    const fMap = {}
    sids.forEach(id => { fMap[id] = { cantidad: '', fecha_rostizado: hoyStr } })
    setFormMap(fMap)

    setLoading(false)
  }

  function toggleExpand(sucId) {
    setExpandedSuc(m => ({ ...m, [sucId]: !m[sucId] }))
  }

  function toggleAdding(sucId) {
    setAddingMap(m => ({ ...m, [sucId]: !m[sucId] }))
    setMsgs(m => ({ ...m, [sucId]: null }))
  }

  function setMsg(sucId, msg) {
    setMsgs(m => ({ ...m, [sucId]: msg }))
    if (msg?.tipo === 'ok') setTimeout(() => setMsgs(m => ({ ...m, [sucId]: null })), 3000)
  }

  async function handleAddLote(e, sucId) {
    e.preventDefault()
    const f = formMap[sucId]
    if (!f?.cantidad || !f?.fecha_rostizado) return
    setSaving(true)
    const { error } = await supabase.from('pollos_taco').insert({
      sucursal_id:     sucId,
      cantidad:        parseInt(f.cantidad),
      fecha_rostizado: f.fecha_rostizado,
      registrado_por:  usuario.id,
    })
    if (error) {
      setMsg(sucId, { tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg(sucId, { tipo: 'ok', texto: 'Lote agregado' })
      setFormMap(m => ({ ...m, [sucId]: { cantidad: '', fecha_rostizado: hoyStr } }))
      setAddingMap(m => ({ ...m, [sucId]: false }))
      await load()
    }
    setSaving(false)
  }

  async function handleUpdateLote() {
    if (!editingLote?.cantidad) return
    setSaving(true)
    const { error } = await supabase.from('pollos_taco').update({
      cantidad:        parseInt(editingLote.cantidad),
      fecha_rostizado: editingLote.fecha_rostizado,
      updated_at:      new Date().toISOString(),
    }).eq('id', editingLote.id)
    if (!error) { setEditingLote(null); await load() }
    setSaving(false)
  }

  async function handleDeleteLote(loteId) {
    const { error } = await supabase.from('pollos_taco').delete().eq('id', loteId)
    if (!error) await load()
  }

  async function handleSaveMinimo(sucId) {
    if (editMinVal === '') return
    setSaving(true)
    const { error } = await supabase.from('pollos_taco_minimos').upsert({
      sucursal_id:     sucId,
      cantidad_minima: parseInt(editMinVal),
      updated_by:      usuario.id,
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'sucursal_id' })
    if (!error) {
      setEditMinSuc(null)
      await load()
    }
    setSaving(false)
  }

  // — Cálculos globales —
  const totalExistenciaTacos = sucursales.reduce((a, s) => a + Math.max(0, tacosMap[s.id] ?? 0), 0)
  const sucSinTacos          = sucursales.filter(s => (tacosMap[s.id] ?? 0) <= 0)
  const sucConExpirando      = sucursales.filter(s =>
    lotesMap[s.id]?.some(l => l.fecha_caducidad === mananaStr)
  )

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
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* ── KPIs globales ── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiVal} style={{ color: 'var(--info)' }}>{totalExistenciaTacos}</span>
          <span className={styles.kpiLabel}>Existencia tacos</span>
        </div>
        <div className={`${styles.kpiCard} ${sucSinTacos.length > 0 ? styles.kpiCardDanger : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucSinTacos.length > 0 ? 'var(--red)' : 'var(--success)' }}>
            {sucSinTacos.length}
          </span>
          <span className={styles.kpiLabel}>Sin tacos</span>
        </div>
        <div className={`${styles.kpiCard} ${sucConExpirando.length > 0 ? styles.kpiCardWarn : ''}`}>
          <span className={styles.kpiVal} style={{ color: sucConExpirando.length > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
            {sucConExpirando.length}
          </span>
          <span className={styles.kpiLabel}>Pollos caducan</span>
        </div>
      </div>

      {/* ── Alertas críticas ── */}
      {sucSinTacos.length > 0 && (
        <div className={styles.alertBanner} style={{ borderColor: 'rgba(232,25,44,0.3)', background: 'rgba(232,25,44,0.07)' }}>
          <AlertTriangle size={15} strokeWidth={2.5} color="var(--red)" />
          <span style={{ color: 'var(--red)' }}>
            <strong>Sin tacos:</strong> {sucSinTacos.map(s => s.nombre).join(', ')}
          </span>
        </div>
      )}
      {sucConExpirando.length > 0 && (
        <div className={styles.alertBanner} style={{ borderColor: 'rgba(245,196,0,0.3)', background: 'rgba(245,196,0,0.07)' }}>
          <AlertTriangle size={15} strokeWidth={2.5} color="var(--yellow)" />
          <span style={{ color: 'var(--yellow)' }}>
            <strong>Último día válido:</strong> {sucConExpirando.map(s => s.nombre).join(', ')}
          </span>
        </div>
      )}

      {/* ── Tarjetas por sucursal ── */}
      <div className={styles.sucCards}>
        {sucursales.map(suc => {
          const lotes            = lotesMap[suc.id] ?? []
          const minimo           = minimosMap[suc.id] ?? 0
          const existenciaTacos  = Math.max(0, tacosMap[suc.id] ?? 0)
          const vigentes         = lotes.filter(l => l.fecha_caducidad > hoyStr)
          const expirados        = lotes.filter(l => l.fecha_caducidad <= hoyStr)
          const expirando        = vigentes.filter(l => l.fecha_caducidad === mananaStr)
          const isExpanded       = expandedSuc[suc.id] ?? false
          const isAdding         = addingMap[suc.id] ?? false
          const form             = formMap[suc.id] ?? { cantidad: '', fecha_rostizado: hoyStr }
          const msg              = msgs[suc.id]
          const isEditingMin     = editMinSuc === suc.id

          let statusColor = 'var(--success)'
          let statusLabel = 'Con tacos'
          if (existenciaTacos === 0) { statusColor = 'var(--red)'; statusLabel = 'Sin tacos' }
          else if (expirando.length > 0) { statusColor = 'var(--yellow)'; statusLabel = 'Pollos caducan' }

          return (
            <div key={suc.id} className={styles.sucCard}>

              {/* Card header */}
              <div className={styles.sucCardHeader} onClick={() => toggleExpand(suc.id)}>
                <div className={styles.sucCardLeft}>
                  <p className={styles.sucNombre}>{suc.nombre}</p>
                  <span className={styles.sucStatusBadge} style={{ color: statusColor, borderColor: statusColor + '40', background: statusColor + '12' }}>
                    {existenciaTacos === 0 && <AlertTriangle size={10} strokeWidth={2.5} />}
                    {existenciaTacos > 0 && expirando.length > 0 && <AlertTriangle size={10} strokeWidth={2.5} />}
                    {existenciaTacos > 0 && expirando.length === 0 && <CheckCircle size={10} strokeWidth={2.5} />}
                    {statusLabel}
                  </span>
                </div>
                <div className={styles.sucCardRight}>
                  <div className={styles.sucCardRightInner}>
                    <div className={styles.stockBig}>
                      <span className={styles.stockNum} style={{ color: existenciaTacos > 0 ? 'var(--info)' : 'var(--red)' }}>
                        {existenciaTacos}
                      </span>
                      <span className={styles.stockMin}> tacos</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} strokeWidth={2} color="var(--text-muted)" /> : <ChevronDown size={16} strokeWidth={2} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Expandable content */}
              {isExpanded && (
                <div className={styles.sucCardBody}>

                  {/* Alertas */}
                  {expirando.length > 0 && (
                    <div className={styles.inlineAlert} style={{ borderColor: 'rgba(245,196,0,0.3)', color: 'var(--yellow)' }}>
                      <AlertTriangle size={12} strokeWidth={2.5} />
                      {expirando.reduce((a, l) => a + l.cantidad, 0)} pollo(s) — último día válido HOY
                    </div>
                  )}

                  {/* Editar mínimo */}
                  <div className={styles.minimoRow}>
                    <div className={styles.minimoInfo}>
                      <Settings size={13} strokeWidth={2} color="var(--text-muted)" />
                      <span className={styles.minimoLabel}>Mínimo diario requerido:</span>
                      {!isEditingMin && (
                        <span className={styles.minimoVal}>{minimo} pollos</span>
                      )}
                    </div>
                    {isEditingMin ? (
                      <div className={styles.minimoEdit}>
                        <input
                          className={styles.minimoInput}
                          type="number" min="0" placeholder="0"
                          value={editMinVal}
                          onChange={e => setEditMinVal(e.target.value)}
                        />
                        <button className={styles.minimoSaveBtn} onClick={() => handleSaveMinimo(suc.id)} disabled={saving}>
                          <CheckCircle size={13} strokeWidth={2} /> Guardar
                        </button>
                        <button className={styles.minimoCancelBtn} onClick={() => setEditMinSuc(null)}>
                          <X size={13} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <button className={styles.minimoEditBtn} onClick={() => { setEditMinSuc(suc.id); setEditMinVal(minimo) }}>
                        <Pencil size={12} strokeWidth={2} /> Editar
                      </button>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className={styles.actionRow}>
                    <button className={styles.addLoteBtn} onClick={() => toggleAdding(suc.id)}>
                      {isAdding ? <X size={13} strokeWidth={2} /> : <Plus size={13} strokeWidth={2} />}
                      {isAdding ? 'Cancelar' : 'Agregar lote'}
                    </button>
                  </div>

                  {/* Formulario agregar */}
                  {isAdding && (
                    <form className={styles.addForm} onSubmit={e => handleAddLote(e, suc.id)} noValidate>
                      <p className={styles.addFormTitle}>
                        <Flame size={12} strokeWidth={2} color="var(--yellow)" />
                        Nuevo lote
                      </p>
                      <div className={styles.addFormRow}>
                        <div className={styles.addInputGroup}>
                          <label className={styles.addInputLabel}>Cantidad</label>
                          <input
                            className={styles.addInput}
                            type="number" min="1" placeholder="0"
                            value={form.cantidad}
                            onChange={e => setFormMap(m => ({ ...m, [suc.id]: { ...form, cantidad: e.target.value } }))}
                            required
                          />
                        </div>
                        <div className={styles.addInputGroup}>
                          <label className={styles.addInputLabel}>Fecha rostizado</label>
                          <input
                            className={styles.addInput}
                            type="date"
                            value={form.fecha_rostizado}
                            onChange={e => setFormMap(m => ({ ...m, [suc.id]: { ...form, fecha_rostizado: e.target.value } }))}
                            required
                          />
                        </div>
                      </div>
                      {form.fecha_rostizado && (
                        <p className={styles.cadInfo}>
                          Caduca el {format(addDays(new Date(form.fecha_rostizado + 'T00:00:00'), 3), "d 'de' MMMM", { locale: es })}
                        </p>
                      )}
                      {msg && (
                        <div className={`${styles.addMsg} ${styles[msg.tipo]}`}>
                          {msg.tipo === 'ok' ? <CheckCircle size={13} strokeWidth={2} /> : <AlertCircle size={13} strokeWidth={2} />}
                          {msg.texto}
                        </div>
                      )}
                      <button className={styles.addSaveBtn} type="submit" disabled={saving}>
                        {saving ? 'Guardando…' : 'Guardar lote'}
                      </button>
                    </form>
                  )}

                  {/* Lotes vigentes */}
                  {vigentes.length > 0 && (
                    <div className={styles.lotesBlock}>
                      <p className={styles.lotesLabel}>Lotes vigentes</p>
                      {vigentes.map(lote => {
                        const dias = diasParaCaducar(lote.fecha_caducidad, hoyStr)
                        const isEditingThis = editingLote?.id === lote.id
                        let diasColor = 'var(--success)'
                        if (dias === 1) diasColor = 'var(--red)'
                        else if (dias === 2) diasColor = 'var(--yellow)'
                        return (
                          <div key={lote.id} className={styles.loteItem}>
                            {isEditingThis ? (
                              <>
                                <input
                                  className={styles.loteInputInline}
                                  type="date"
                                  value={editingLote.fecha_rostizado}
                                  onChange={e => setEditingLote(v => ({ ...v, fecha_rostizado: e.target.value }))}
                                />
                                <input
                                  className={styles.loteInputInline}
                                  type="number" min="0"
                                  value={editingLote.cantidad}
                                  onChange={e => setEditingLote(v => ({ ...v, cantidad: e.target.value }))}
                                />
                                <span />
                                <div className={styles.loteItemActions}>
                                  <button className={styles.loteActionOk} onClick={handleUpdateLote} disabled={saving}>
                                    <CheckCircle size={13} strokeWidth={2} />
                                  </button>
                                  <button className={styles.loteActionCancel} onClick={() => setEditingLote(null)}>
                                    <X size={13} strokeWidth={2} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className={styles.loteItemDate}>
                                  {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                                </span>
                                <span className={styles.loteItemCant}>{lote.cantidad} pollos</span>
                                <span className={styles.loteItemDias} style={{ color: diasColor }}>
                                  {dias === 1 ? 'Último día' : `${dias} días`}
                                </span>
                                <div className={styles.loteItemActions}>
                                  <button className={styles.loteActionEdit}
                                    onClick={() => setEditingLote({ id: lote.id, cantidad: lote.cantidad, fecha_rostizado: lote.fecha_rostizado })}>
                                    <Pencil size={12} strokeWidth={2} />
                                  </button>
                                  <button className={styles.loteActionDel} onClick={() => handleDeleteLote(lote.id)}>
                                    <Trash2 size={12} strokeWidth={2} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Lotes caducados */}
                  {expirados.length > 0 && (
                    <div className={styles.lotesBlock}>
                      <p className={styles.lotesLabelMuted}>Caducados recientes</p>
                      {expirados.slice(0, 3).map(lote => (
                        <div key={lote.id} className={`${styles.loteItem} ${styles.loteExpired}`}>
                          <span className={styles.loteItemDate}>
                            {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                          </span>
                          <span className={styles.loteItemCant}>{lote.cantidad} pollos</span>
                          <span className={styles.loteItemExpiredTag}>Caducado</span>
                          <div className={styles.loteItemActions}>
                            <button className={styles.loteActionDel} onClick={() => handleDeleteLote(lote.id)}>
                              <Trash2 size={12} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {vigentes.length === 0 && (
                    <p className={styles.noLotes}>Sin lotes vigentes</p>
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
