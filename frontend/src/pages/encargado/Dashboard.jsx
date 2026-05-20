import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, addDays, startOfWeek, startOfMonth } from 'date-fns'
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
  const [msg,        setMsg]        = useState(null)
  const [resumen,    setResumen]    = useState(null)
  const [filtroObj,  setFiltroObj]  = useState('hoy')

  // — Pollos Taco —
  const [lotesTaco,      setLotesTaco]      = useState([])
  const [minimoTaco,     setMinimoTaco]     = useState(0)
  const [formTaco,       setFormTaco]       = useState({ cantidad: '', fecha_rostizado: hoyStr })
  const [addingTaco,     setAddingTaco]     = useState(false)
  const [savingTaco,     setSavingTaco]     = useState(false)
  const [msgTaco,        setMsgTaco]        = useState(null)
  const [editingLoteId,  setEditingLoteId]  = useState(null)
  const [editLoteVals,   setEditLoteVals]   = useState({ cantidad: '', fecha_rostizado: '' })

  useEffect(() => {
    if (sucursalId) load()
    else if (usuario) setLoading(false)
  }, [sucursalId, usuario])

  async function load() {
    setLoading(true)
    const inicioMes = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const [{ data: hoyData }, { data: histData }, { data: tacoData }, { data: minData }, { data: resData }] = await Promise.all([
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).eq('fecha', hoyStr).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).gte('fecha', inicioMes).order('fecha', { ascending: false }),
      supabase.from('pollos_taco').select('*').eq('sucursal_id', sucursalId).order('fecha_rostizado', { ascending: false }).limit(30),
      supabase.from('pollos_taco_minimos').select('cantidad_minima').eq('sucursal_id', sucursalId).maybeSingle(),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: sucursalId }).maybeSingle(),
    ])
    setVentaHoy(hoyData)
    setUltimas(histData ?? [])
    if (hoyData) setForm({ venta_total: hoyData.venta_total, pollos_vendidos: hoyData.pollos_vendidos })
    setLotesTaco(tacoData ?? [])
    setMinimoTaco(minData?.cantidad_minima ?? 0)
    setResumen(resData ?? null)
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
      venta_total:     parseFloat(form.venta_total),
      pollos_vendidos: parseFloat(form.pollos_vendidos),
    }
    const { error } = ventaHoy
      ? await supabase.from('ventas_diarias')
          .update({ venta_total: payload.venta_total, pollos_vendidos: payload.pollos_vendidos })
          .eq('id', ventaHoy.id)
      : await supabase.from('ventas_diarias').insert(payload)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Venta registrada correctamente' })
      await load()
      setTimeout(() => setMsg(null), 4000)
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

  // — Cálculos objetivos —
  const _hoy          = new Date()
  const diasEnMes     = new Date(_hoy.getFullYear(), _hoy.getMonth() + 1, 0).getDate()
  const diasTransc    = resumen?.dias_transcurridos ?? _hoy.getDate()
  const metaMensual   = resumen?.meta_mensual ?? 0
  const metaDiaria    = diasEnMes > 0 ? metaMensual / diasEnMes : 0
  const metaSemanal   = resumen?.meta_venta ?? metaDiaria * 7
  const pollosTotMes  = resumen?.pollos_totales ?? 0
  const avgPollosDia  = diasTransc > 0 ? pollosTotMes / diasTransc : 0
  const ticketPromMes = pollosTotMes > 0 ? (resumen?.venta_acumulada ?? 0) / pollosTotMes : 0

  // Ventas de esta semana (desde lunes)
  const inicioSemStr  = format(startOfWeek(_hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const ventasSem     = ultimas.filter(v => v.fecha >= inicioSemStr)
  const ventaSemTotal = ventasSem.reduce((a, v) => a + v.venta_total, 0)
  const pollosSemTotal = ventasSem.reduce((a, v) => a + parseFloat(v.pollos_vendidos ?? 0), 0)
  const ticketSem     = pollosSemTotal > 0 ? ventaSemTotal / pollosSemTotal : 0

  // Ventas del mes
  const ventaMesTotal  = resumen?.venta_acumulada ?? 0
  const ticketMes      = ticketPromMes

  // Actual para hoy
  const ventaHoyVal   = ventaHoy?.venta_total ?? 0
  const pollosHoyVal  = parseFloat(ventaHoy?.pollos_vendidos ?? 0)
  const ticketHoyVal  = pollosHoyVal > 0 ? ventaHoyVal / pollosHoyVal : 0

  const FILTROS_OBJ = [
    {
      key: 'hoy', label: 'Hoy',
      target:  { venta: metaDiaria,    pollos: avgPollosDia,           ticket: ticketPromMes },
      actual:  { venta: ventaHoyVal,   pollos: pollosHoyVal,           ticket: ticketHoyVal },
    },
    {
      key: 'semana', label: 'Semana',
      target:  { venta: metaSemanal,   pollos: avgPollosDia * 7,       ticket: ticketPromMes },
      actual:  { venta: ventaSemTotal, pollos: pollosSemTotal,         ticket: ticketSem },
    },
    {
      key: 'mes', label: 'Mes',
      target:  { venta: metaMensual,   pollos: avgPollosDia * diasEnMes, ticket: ticketPromMes },
      actual:  { venta: ventaMesTotal, pollos: pollosTotMes,           ticket: ticketMes },
    },
  ]
  const objActivo = FILTROS_OBJ.find(f => f.key === filtroObj) ?? FILTROS_OBJ[0]
  const pctVenta  = objActivo.target.venta  > 0 ? Math.min(100, (objActivo.actual.venta  / objActivo.target.venta)  * 100) : 0
  const pctPollos = objActivo.target.pollos > 0 ? Math.min(100, (objActivo.actual.pollos / objActivo.target.pollos) * 100) : 0
  const objColor  = pctVenta >= 100 ? 'var(--success)' : pctVenta >= 70 ? 'var(--yellow)' : 'var(--red)'
  const faltaVenta = Math.max(0, objActivo.target.venta - objActivo.actual.venta)

  if (loading) return <div className={styles.empty}>Cargando…</div>
  if (!sucursalId) return (
    <div className={styles.page}>
      <div className={styles.sucursalHeader}>
        <h2 className={styles.sucursalNombre}>Sin sucursal asignada</h2>
        <p className={styles.sucursalFecha}>Contacta al gerente para que te asigne una sucursal.</p>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* ── Header sucursal ── */}
      <div className={styles.sucursalHeader}>
        <h2 className={styles.sucursalNombre}>{sucursal?.nombre ?? 'Mi Sucursal'}</h2>
        <p className={styles.sucursalFecha} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* ── Objetivos ── */}
      {resumen && metaMensual > 0 && (
        <div className={styles.objetivosCard}>
          <div className={styles.objetivosHeader}>
            <p className={styles.objetivosTitle}>Objetivos</p>
            <div className={styles.objetivosPills}>
              {FILTROS_OBJ.map(f => (
                <button
                  key={f.key}
                  className={`${styles.objPill} ${filtroObj === f.key ? styles.objPillActive : ''}`}
                  onClick={() => setFiltroObj(f.key)}
                >{f.label}</button>
              ))}
            </div>
          </div>

          <div className={styles.objetivosGrid}>
            {/* Venta $ */}
            <div className={styles.objKpi}>
              <span className={styles.objKpiLabel}>Venta $</span>
              <span className={styles.objKpiTarget}>{fmt(objActivo.target.venta)}</span>
              <div className={styles.objBar}>
                <div className={styles.objBarFill} style={{ width: `${pctVenta}%`, background: objColor }} />
              </div>
              <span className={styles.objKpiActual} style={{ color: objActivo.actual.venta > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {objActivo.actual.venta > 0 ? fmt(objActivo.actual.venta) : '—'}
              </span>
            </div>

            <div className={styles.objDivider} />

            {/* Pollos */}
            <div className={styles.objKpi}>
              <span className={styles.objKpiLabel}>Pollos</span>
              <span className={styles.objKpiTarget}>{Math.round(objActivo.target.pollos)}</span>
              <div className={styles.objBar}>
                <div className={styles.objBarFill} style={{ width: `${pctPollos}%`, background: objColor }} />
              </div>
              <span className={styles.objKpiActual} style={{ color: objActivo.actual.pollos > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {objActivo.actual.pollos > 0 ? fmtNum(objActivo.actual.pollos) : '—'}
              </span>
            </div>

            <div className={styles.objDivider} />

            {/* Ticket */}
            <div className={styles.objKpi}>
              <span className={styles.objKpiLabel}>Ticket</span>
              <span className={styles.objKpiTarget}>{fmtDec(objActivo.target.ticket)}</span>
              <div className={styles.objBar}>
                <div className={styles.objBarFill} style={{
                  width: `${objActivo.target.ticket > 0 ? Math.min(100, (objActivo.actual.ticket / objActivo.target.ticket) * 100) : 0}%`,
                  background: objActivo.actual.ticket >= objActivo.target.ticket * 0.95 ? 'var(--success)' : 'var(--yellow)',
                }} />
              </div>
              <span className={styles.objKpiActual} style={{ color: objActivo.actual.ticket > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {objActivo.actual.ticket > 0 ? fmtDec(objActivo.actual.ticket) : '—'}
              </span>
            </div>
          </div>

          {faltaVenta > 0 && (
            <div className={styles.objFaltan}>
              Faltan <strong>{fmt(faltaVenta)}</strong>
              {filtroObj === 'hoy' ? ' para cerrar el día' : filtroObj === 'semana' ? ' para la semana' : ' para completar el mes'}
            </div>
          )}
          {faltaVenta === 0 && objActivo.actual.venta > 0 && (
            <div className={styles.objFaltanOk}>
              {filtroObj === 'hoy' ? '¡Objetivo del día cumplido!' : filtroObj === 'semana' ? '¡Objetivo semanal cumplido!' : '¡Meta del mes cumplida!'}
            </div>
          )}
        </div>
      )}

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
            {ultimas.slice(0, 14).map(v => (
              <div key={v.id} className={`${styles.histRow} ${v.fecha === hoyStr ? styles.histRowHoy : ''}`}>
                <span className={styles.histFecha}>
                  {v.fecha === hoyStr ? 'Hoy' : format(parseISO(v.fecha), 'EEE d MMM', { locale: es })}
                </span>
                <span className={styles.histVenta}>{fmt(v.venta_total)}</span>
                <span className={styles.histPollos}>{fmtNum(v.pollos_vendidos)}</span>
                <span className={styles.histTicket}>{fmtDec(parseFloat(v.pollos_vendidos) > 0 ? v.venta_total / parseFloat(v.pollos_vendidos) : 0)}</span>
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
