import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  DollarSign, Bird, TrendingUp, CheckCircle, AlertCircle, Lock,
  Plus, Pencil, X, AlertTriangle, Utensils, Trash2, Flame
} from 'lucide-react'
import styles from './Dashboard.module.css'

const fmt    = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

function diasParaCaducar(fechaCaducidad, hoyStr) {
  const hoy = new Date(hoyStr + 'T00:00:00')
  const cad = new Date(fechaCaducidad + 'T00:00:00')
  return Math.round((cad - hoy) / 86400000)
}

export default function EncargadoDashboard() {
  const { usuario } = useAuth()
  const sucursal   = usuario?.sucursales
  const sucursalId = sucursal?.id
  const hoyStr     = format(new Date(), 'yyyy-MM-dd')
  const mananaStr  = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  // — Ventas —
  const [ventaHoy, setVentaHoy] = useState(null)
  const [ultimas,  setUltimas]  = useState([])
  const [form,     setForm]     = useState({ venta_total: '', pollos_vendidos: '' })
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState(null)

  // — Pollos Taco —
  const [lotesTaco,      setLotesTaco]      = useState([])
  const [minimoTaco,     setMinimoTaco]     = useState(0)
  const [formTaco,       setFormTaco]       = useState({ cantidad: '', fecha_rostizado: hoyStr })
  const [addingTaco,     setAddingTaco]     = useState(false)
  const [savingTaco,     setSavingTaco]     = useState(false)
  const [msgTaco,        setMsgTaco]        = useState(null)
  const [editingLoteId,  setEditingLoteId]  = useState(null)
  const [editLoteVals,   setEditLoteVals]   = useState({ cantidad: '', fecha_rostizado: '' })

  useEffect(() => { if (sucursalId) load() }, [sucursalId])

  async function load() {
    setLoading(true)
    const [{ data: hoyData }, { data: histData }, { data: tacoData }, { data: minData }] = await Promise.all([
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).eq('fecha', hoyStr).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).order('fecha', { ascending: false }).limit(14),
      supabase.from('pollos_taco').select('*').eq('sucursal_id', sucursalId).order('fecha_rostizado', { ascending: false }).limit(30),
      supabase.from('pollos_taco_minimos').select('cantidad_minima').eq('sucursal_id', sucursalId).maybeSingle(),
    ])
    setVentaHoy(hoyData)
    setUltimas(histData ?? [])
    if (hoyData) setForm({ venta_total: hoyData.venta_total, pollos_vendidos: hoyData.pollos_vendidos })
    setLotesTaco(tacoData ?? [])
    setMinimoTaco(minData?.cantidad_minima ?? 0)
    setLoading(false)
  }

  // — Guardar venta —
  async function handleSave(e) {
    e.preventDefault()
    if (!form.venta_total || !form.pollos_vendidos) return
    setSaving(true)
    setMsg(null)
    const payload = {
      sucursal_id:    sucursalId,
      encargado_id:   usuario.id,
      fecha:          hoyStr,
      venta_total:    parseFloat(form.venta_total),
      pollos_vendidos: parseFloat(form.pollos_vendidos),
    }
    const { error } = ventaHoy
      ? await supabase.from('ventas_diarias').update({ venta_total: payload.venta_total, pollos_vendidos: payload.pollos_vendidos }).eq('id', ventaHoy.id)
      : await supabase.from('ventas_diarias').insert(payload)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Venta registrada correctamente' })
      await load()
    }
    setSaving(false)
  }

  // — Agregar lote taco —
  async function handleAddLote(e) {
    e.preventDefault()
    if (!formTaco.cantidad || !formTaco.fecha_rostizado) return
    setSavingTaco(true)
    setMsgTaco(null)
    const { error } = await supabase.from('pollos_taco').insert({
      sucursal_id:     sucursalId,
      cantidad:        parseInt(formTaco.cantidad),
      fecha_rostizado: formTaco.fecha_rostizado,
      registrado_por:  usuario.id,
    })
    if (error) {
      setMsgTaco({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsgTaco({ tipo: 'ok', texto: 'Lote registrado' })
      setFormTaco({ cantidad: '', fecha_rostizado: hoyStr })
      setAddingTaco(false)
      await load()
    }
    setSavingTaco(false)
  }

  // — Editar lote taco —
  function startEditLote(lote) {
    setEditingLoteId(lote.id)
    setEditLoteVals({ cantidad: lote.cantidad, fecha_rostizado: lote.fecha_rostizado })
  }

  async function handleUpdateLote(loteId) {
    if (!editLoteVals.cantidad) return
    setSavingTaco(true)
    const { error } = await supabase.from('pollos_taco').update({
      cantidad:        parseInt(editLoteVals.cantidad),
      fecha_rostizado: editLoteVals.fecha_rostizado,
      updated_at:      new Date().toISOString(),
    }).eq('id', loteId)
    if (!error) {
      setEditingLoteId(null)
      await load()
    }
    setSavingTaco(false)
  }

  // — Eliminar lote taco —
  async function handleDeleteLote(loteId) {
    const { error } = await supabase.from('pollos_taco').delete().eq('id', loteId)
    if (!error) await load()
  }

  // — Cálculos taco —
  const lotesVigentes   = lotesTaco.filter(l => l.fecha_caducidad > hoyStr)
  const lotesExpirados  = lotesTaco.filter(l => l.fecha_caducidad <= hoyStr).slice(0, 5)
  const stockVigente    = lotesVigentes.reduce((a, l) => a + l.cantidad, 0)
  const lotesExpirando  = lotesVigentes.filter(l => l.fecha_caducidad === mananaStr)
  const hayDeficit      = minimoTaco > 0 && stockVigente < minimoTaco

  const ticketCalculado = form.venta_total && form.pollos_vendidos && parseFloat(form.pollos_vendidos) > 0
    ? parseFloat(form.venta_total) / parseFloat(form.pollos_vendidos)
    : null

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* ── Header sucursal ── */}
      <div className={styles.sucursalHeader}>
        <h2 className={styles.sucursalNombre}>{sucursal?.nombre ?? 'Mi Sucursal'}</h2>
        <p className={styles.sucursalFecha} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* ── Formulario ventas ── */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>{ventaHoy ? 'Actualizar cierre de hoy' : 'Registrar cierre de hoy'}</p>
        <form className={styles.form} onSubmit={handleSave} noValidate>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Venta Total</label>
            <div className={styles.inputWrapper}>
              <DollarSign size={16} strokeWidth={2} color="var(--text-muted)" className={styles.inputIcon} />
              <input className={styles.input} type="number" inputMode="decimal"
                min="0" step="any" placeholder="0.00"
                value={form.venta_total}
                onChange={e => setForm(f => ({ ...f, venta_total: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Pollos Vendidos</label>
            <div className={styles.inputWrapper}>
              <Bird size={16} strokeWidth={2} color="var(--text-muted)" className={styles.inputIcon} />
              <input className={styles.input} type="number" inputMode="decimal"
                min="0" step="any" placeholder="0"
                value={form.pollos_vendidos}
                onChange={e => setForm(f => ({ ...f, pollos_vendidos: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.ticketPreview}>
            <div className={styles.ticketLeft}>
              <TrendingUp size={15} strokeWidth={2} color="var(--yellow)" />
              <span className={styles.ticketLabel}>Ticket Promedio</span>
            </div>
            <span className={styles.ticketValue}>{ticketCalculado ? fmtDec(ticketCalculado) : '—'}</span>
          </div>
          {msg && (
            <div className={`${styles.msg} ${styles[msg.tipo]}`}>
              {msg.tipo === 'ok' ? <CheckCircle size={15} strokeWidth={2} /> : <AlertCircle size={15} strokeWidth={2} />}
              {msg.texto}
            </div>
          )}
          <button className={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Guardando…' : ventaHoy ? 'Actualizar' : 'Registrar Venta'}
          </button>
        </form>
      </div>

      {/* ── Historial ventas ── */}
      {ultimas.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Historial reciente</p>
          <div className={styles.historial}>
            <div className={styles.histHead}>
              <span>Fecha</span><span>Venta</span><span>Pollos</span><span>T.P.</span>
            </div>
            {ultimas.map(v => (
              <div key={v.id} className={`${styles.histRow} ${v.fecha === hoyStr ? styles.histRowHoy : ''}`}>
                <span className={styles.histFecha}>
                  {v.fecha === hoyStr ? 'Hoy' : format(parseISO(v.fecha), 'EEE d MMM', { locale: es })}
                </span>
                <span className={styles.histVenta}>{fmt(v.venta_total)}</span>
                <span className={styles.histPollos}>{fmtNum(v.pollos_vendidos)}</span>
                <span className={styles.histTicket}>{fmtDec(v.ticket_promedio)}</span>
              </div>
            ))}
          </div>
          <div className={styles.histNota}>
            <Lock size={11} strokeWidth={2} />
            Para modificar días anteriores, contacta a tu supervisor
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SECCIÓN: POLLO PARA TACO
      ══════════════════════════════════════ */}
      <div className={styles.tacoSection}>

        {/* Header sección */}
        <div className={styles.tacoSectionHeader}>
          <div className={styles.tacoTitleRow}>
            <Utensils size={16} strokeWidth={2} color="var(--info)" />
            <p className={styles.tacoSectionTitle}>Pollo para Taco</p>
          </div>
          <button
            className={styles.tacoAddBtn}
            onClick={() => { setAddingTaco(v => !v); setMsgTaco(null) }}
          >
            {addingTaco ? <X size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
            {addingTaco ? 'Cancelar' : 'Agregar'}
          </button>
        </div>

        {/* Resumen stock */}
        <div className={`${styles.tacoStockCard} ${hayDeficit ? styles.tacoStockDeficit : lotesExpirando.length > 0 ? styles.tacoStockWarn : styles.tacoStockOk}`}>
          <div className={styles.tacoStockLeft}>
            <span className={styles.tacoStockNum}>{stockVigente}</span>
            <span className={styles.tacoStockLabel}>pollos vigentes</span>
          </div>
          {minimoTaco > 0 && (
            <div className={styles.tacoStockRight}>
              <span className={styles.tacoMinLabel}>Mín. requerido</span>
              <span className={styles.tacoMinVal}>{minimoTaco}</span>
              {hayDeficit
                ? <span className={styles.tacoDeficitBadge}><AlertTriangle size={10} strokeWidth={2.5} /> Déficit</span>
                : <span className={styles.tacoBadgeOk}><CheckCircle size={10} strokeWidth={2.5} /> Suficiente</span>
              }
            </div>
          )}
        </div>

        {/* Alerta caducidad */}
        {lotesExpirando.length > 0 && (
          <div className={styles.tacoAlert}>
            <AlertTriangle size={14} strokeWidth={2.5} color="var(--yellow)" />
            <span>
              <strong>Último día válido:</strong> {lotesExpirando.reduce((a, l) => a + l.cantidad, 0)} pollo(s) caducan mañana
            </span>
          </div>
        )}

        {/* Formulario agregar lote */}
        {addingTaco && (
          <form className={styles.tacoForm} onSubmit={handleAddLote} noValidate>
            <p className={styles.tacoFormTitle}>
              <Flame size={13} strokeWidth={2} color="var(--yellow)" />
              Nuevo lote rostizado
            </p>
            <div className={styles.tacoFormRow}>
              <div className={styles.tacoInputGroup}>
                <label className={styles.tacoInputLabel}>Cantidad</label>
                <input
                  className={styles.tacoInput}
                  type="number" inputMode="numeric" min="1" placeholder="0"
                  value={formTaco.cantidad}
                  onChange={e => setFormTaco(f => ({ ...f, cantidad: e.target.value }))}
                  required
                />
              </div>
              <div className={styles.tacoInputGroup}>
                <label className={styles.tacoInputLabel}>Fecha rostizado</label>
                <input
                  className={styles.tacoInput}
                  type="date"
                  max={hoyStr}
                  value={formTaco.fecha_rostizado}
                  onChange={e => setFormTaco(f => ({ ...f, fecha_rostizado: e.target.value }))}
                  required
                />
              </div>
            </div>
            {formTaco.fecha_rostizado && (
              <p className={styles.tacoCadInfo}>
                Caduca el {format(addDays(new Date(formTaco.fecha_rostizado + 'T00:00:00'), 3), "d 'de' MMMM", { locale: es })}
              </p>
            )}
            {msgTaco && (
              <div className={`${styles.msg} ${styles[msgTaco.tipo]}`}>
                {msgTaco.tipo === 'ok' ? <CheckCircle size={14} strokeWidth={2} /> : <AlertCircle size={14} strokeWidth={2} />}
                {msgTaco.texto}
              </div>
            )}
            <button className={styles.tacoSaveBtn} type="submit" disabled={savingTaco}>
              {savingTaco ? 'Guardando…' : 'Guardar lote'}
            </button>
          </form>
        )}

        {/* Lista lotes vigentes */}
        {lotesVigentes.length > 0 && (
          <div className={styles.lotesSection}>
            <p className={styles.lotesSectionLabel}>Lotes vigentes</p>
            <div className={styles.lotesTable}>
              <div className={styles.lotesHead}>
                <span>Rostizado</span>
                <span>Cantidad</span>
                <span>Caduca</span>
                <span></span>
              </div>
              {lotesVigentes.map(lote => {
                const dias = diasParaCaducar(lote.fecha_caducidad, hoyStr)
                const isEditing = editingLoteId === lote.id
                let diasColor = 'var(--success)'
                if (dias === 1) diasColor = 'var(--red)'
                else if (dias === 2) diasColor = 'var(--yellow)'
                return (
                  <div key={lote.id} className={styles.loteRow}>
                    {isEditing ? (
                      <>
                        <input
                          className={styles.tacoInputInline}
                          type="date" max={hoyStr}
                          value={editLoteVals.fecha_rostizado}
                          onChange={e => setEditLoteVals(v => ({ ...v, fecha_rostizado: e.target.value }))}
                        />
                        <input
                          className={styles.tacoInputInline}
                          type="number" min="0"
                          value={editLoteVals.cantidad}
                          onChange={e => setEditLoteVals(v => ({ ...v, cantidad: e.target.value }))}
                        />
                        <span />
                        <div className={styles.loteActions}>
                          <button className={styles.loteActionOk} onClick={() => handleUpdateLote(lote.id)} disabled={savingTaco}>
                            <CheckCircle size={14} strokeWidth={2} />
                          </button>
                          <button className={styles.loteActionCancel} onClick={() => setEditingLoteId(null)}>
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={styles.loteDate}>
                          {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                        </span>
                        <span className={styles.loteCantidad}>{lote.cantidad}</span>
                        <span className={styles.loteDias} style={{ color: diasColor }}>
                          {dias === 1 ? 'Hoy último' : `${dias} días`}
                        </span>
                        <div className={styles.loteActions}>
                          <button className={styles.loteActionEdit} onClick={() => startEditLote(lote)}>
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
          </div>
        )}

        {/* Lotes caducados recientes */}
        {lotesExpirados.length > 0 && (
          <div className={styles.lotesSection}>
            <p className={styles.lotesSectionLabelMuted}>Caducados recientes</p>
            <div className={styles.lotesTable}>
              {lotesExpirados.map(lote => (
                <div key={lote.id} className={`${styles.loteRow} ${styles.loteRowExpired}`}>
                  <span className={styles.loteDate}>
                    {format(parseISO(lote.fecha_rostizado), "d MMM", { locale: es })}
                  </span>
                  <span className={styles.loteCantidad}>{lote.cantidad}</span>
                  <span className={styles.loteDiasExpired}>Caducado</span>
                  <div className={styles.loteActions}>
                    <button className={styles.loteActionDel} onClick={() => handleDeleteLote(lote.id)}>
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lotesVigentes.length === 0 && !addingTaco && (
          <div className={styles.tacoEmpty}>
            Sin pollos para taco registrados
          </div>
        )}
      </div>
    </div>
  )
}
