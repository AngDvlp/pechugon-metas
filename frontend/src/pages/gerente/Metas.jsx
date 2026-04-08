import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, X, Trash2, Bird, DollarSign, Calendar,
  CheckCircle, Clock, AlertCircle, Settings, RefreshCw
} from 'lucide-react'
import styles from './Metas.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

function diasEntreFechas(desde, hasta) {
  const d1 = new Date(desde + 'T12:00:00')
  const d2 = new Date(hasta + 'T12:00:00')
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1
}

function semanasEntreFechas(desde, hasta) {
  return Math.round(diasEntreFechas(desde, hasta) / 7)
}

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [metas, setMetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showPeriodo, setShowPeriodo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPeriodo, setSavingPeriodo] = useState(false)
  const [msg, setMsg] = useState(null)
  const [msgPeriodo, setMsgPeriodo] = useState(null)

  // Periodo activo — se calcula desde las metas existentes o usa default
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]

  const [periodoDesde, setPeriodoDesde] = useState('2026-03-30')
  const [periodoHasta, setPeriodoHasta] = useState('2026-04-26')
  const semanasActuales = semanasEntreFechas(periodoDesde, periodoHasta)
  const diasActuales = diasEntreFechas(periodoDesde, periodoHasta)

  const [form, setForm] = useState({
    sucursal_id: '',
    pollos_meta: '',
    ticket_promedio_meta: '',
  })

  const metaSemanal = form.pollos_meta && form.ticket_promedio_meta
    ? parseFloat(form.pollos_meta) * parseFloat(form.ticket_promedio_meta)
    : null
  const metaMensual = metaSemanal ? metaSemanal * semanasActuales : null

  const mesLabel = periodoDesde
    ? format(new Date(periodoDesde + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    : '—'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: sucs }, { data: metasData }] = await Promise.all([
        supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
        supabase.from('metas').select('*, sucursales(nombre)').order('created_at', { ascending: false }),
      ])
      setSucursales(sucs ?? [])
      setMetas(metasData ?? [])

      // Cargar periodo desde la meta vigente más reciente
      const metaVigente = metasData?.find(m => m.fecha_inicio && m.fecha_fin && m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr)
      if (metaVigente?.fecha_inicio) setPeriodoDesde(metaVigente.fecha_inicio)
      if (metaVigente?.fecha_fin) setPeriodoHasta(metaVigente.fecha_fin)
    } catch (e) {
      console.error('Error loading metas:', e)
    } finally {
      setLoading(false)
    }
  }

  // Actualizar periodo de TODAS las metas vigentes
  async function handleActualizarPeriodo(e) {
    e.preventDefault()
    setSavingPeriodo(true)
    setMsgPeriodo(null)
    const semanas = semanasEntreFechas(periodoDesde, periodoHasta)

    // Actualizar todas las metas del periodo actual
    const { error } = await supabase
      .from('metas')
      .update({
        fecha_inicio: periodoDesde,
        fecha_fin: periodoHasta,
        semanas_mes: semanas,
      })
      .gte('fecha_inicio', '2026-01-01') // todas las metas recientes

    if (error) {
      setMsgPeriodo({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsgPeriodo({ tipo: 'ok', texto: `Periodo actualizado — ${semanas} semanas, ${diasActuales} días` })
      await load()
      setTimeout(() => setMsgPeriodo(null), 3000)
    }
    setSavingPeriodo(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta) return
    setSaving(true)
    setMsg(null)
    const pollos = parseFloat(form.pollos_meta)
    const ticket = parseFloat(form.ticket_promedio_meta)
    const semanas = semanasEntreFechas(periodoDesde, periodoHasta)

    const { error } = await supabase.from('metas').insert({
      sucursal_id: form.sucursal_id,
      meta_venta: pollos * ticket,
      pollos_meta: pollos,
      ticket_promedio_meta: ticket,
      semanas_mes: semanas,
      fecha_inicio: periodoDesde,
      fecha_fin: periodoHasta,
      creado_por: usuario.id,
    })

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Meta creada correctamente` })
      setShowForm(false)
      setForm({ sucursal_id: '', pollos_meta: '', ticket_promedio_meta: '' })
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    await load()
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Metas</h1>
        <div className={styles.headerBtns}>
          <button className={styles.periodoBtn} onClick={() => setShowPeriodo(v => !v)}>
            <Settings size={14} strokeWidth={2.5} />
            Periodo
          </button>
          <button className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
            {showForm ? <><X size={14} strokeWidth={2.5} /> Cancelar</> : <><Plus size={14} strokeWidth={2.5} /> Nueva meta</>}
          </button>
        </div>
      </div>

      {/* CONFIGURAR PERIODO */}
      {showPeriodo && (
        <div className={styles.periodoCard}>
          <div className={styles.periodoCardHeader}>
            <p className={styles.periodoCardTitle}>Configurar periodo</p>
            <p className={styles.periodoCardSub}>Al guardar se actualizan todas las metas existentes</p>
          </div>
          <form onSubmit={handleActualizarPeriodo} className={styles.periodoForm}>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Fecha inicio</label>
                <input className={styles.input2} type="date" value={periodoDesde}
                  onChange={e => setPeriodoDesde(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha fin</label>
                <input className={styles.input2} type="date" value={periodoHasta}
                  min={periodoDesde} onChange={e => setPeriodoHasta(e.target.value)} required />
              </div>
            </div>
            <div className={styles.periodoResumen}>
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Semanas</span>
                <span className={styles.periodoResumenVal}>{semanasActuales}</span>
              </div>
              <div className={styles.periodoResumenDivider} />
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Días totales</span>
                <span className={styles.periodoResumenVal}>{diasActuales}</span>
              </div>
              <div className={styles.periodoResumenDivider} />
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Periodo</span>
                <span className={styles.periodoResumenVal} style={{ textTransform: 'capitalize' }}>
                  {periodoDesde ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) : '—'} — {periodoHasta ? format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
                </span>
              </div>
            </div>
            {msgPeriodo && (
              <div className={`${styles.msg} ${styles[msgPeriodo.tipo]}`}>
                {msgPeriodo.tipo === 'ok' ? <CheckCircle size={15} strokeWidth={2} /> : <AlertCircle size={15} strokeWidth={2} />}
                {msgPeriodo.texto}
              </div>
            )}
            <button className={styles.periodoSaveBtn} type="submit" disabled={savingPeriodo}>
              <RefreshCw size={14} strokeWidth={2.5} />
              {savingPeriodo ? 'Actualizando…' : 'Actualizar periodo en todas las metas'}
            </button>
          </form>
        </div>
      )}

      {/* Info del periodo activo */}
      <div className={styles.mesInfo}>
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Periodo activo</span>
          <span className={styles.mesInfoVal} style={{ textTransform: 'capitalize' }}>{mesLabel}</span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Semanas</span>
          <span className={styles.mesInfoVal}>{semanasActuales}</span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Periodo</span>
          <span className={styles.mesInfoVal}>
            {periodoDesde ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) : '—'} — {periodoHasta ? format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
          </span>
        </div>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok' ? <CheckCircle size={15} strokeWidth={2} /> : <AlertCircle size={15} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

      {/* FORM NUEVA META */}
      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Nueva meta</p>
          <p className={styles.formSub}>
            Periodo: {periodoDesde ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) : '—'} al {periodoHasta ? format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es }) : '—'} ({semanasActuales} semanas)
          </p>
          <form className={styles.form} onSubmit={handleSave} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))} required>
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Pollos / semana</label>
                <div className={styles.inputWrap}>
                  <Bird size={15} strokeWidth={2} color="var(--text-muted)" />
                  <input className={styles.input} type="number" inputMode="decimal"
                    min="0" step="any" placeholder="0"
                    value={form.pollos_meta}
                    onChange={e => setForm(f => ({ ...f, pollos_meta: e.target.value }))} required />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ticket promedio</label>
                <div className={styles.inputWrap}>
                  <DollarSign size={15} strokeWidth={2} color="var(--text-muted)" />
                  <input className={styles.input} type="number" inputMode="decimal"
                    min="0" step="any" placeholder="0.00"
                    value={form.ticket_promedio_meta}
                    onChange={e => setForm(f => ({ ...f, ticket_promedio_meta: e.target.value }))} required />
                </div>
              </div>
            </div>
            {metaSemanal !== null && (
              <div className={styles.preview}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta semanal</span>
                  <span className={styles.previewVal}>{fmt(metaSemanal)}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta total ({semanasActuales} semanas)</span>
                  <span className={styles.previewValBig}>{fmt(metaMensual)}</span>
                </div>
              </div>
            )}
            <button className={styles.saveBtn} type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear Meta'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Cargando…</div>
      ) : metas.length === 0 ? (
        <div className={styles.empty}>No hay metas creadas todavía</div>
      ) : (
        <div className={styles.metasList}>
          {metas.map(m => {
            const vigente = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
            const expirada = m.fecha_fin < hoyStr
            const metaMens = m.meta_venta * (m.semanas_mes ?? 4)
            return (
              <div key={m.id} className={`${styles.metaCard} ${vigente ? styles.vigente : ''}`}>
                <div className={styles.metaTop}>
                  <div>
                    <p className={styles.metaSucursal}>{m.sucursales?.nombre}</p>
                    <div className={styles.metaMontos}>
                      <span className={styles.metaMontoSem}>{fmt(m.meta_venta)} <span className={styles.metaMontoLabel}>/sem</span></span>
                      <span className={styles.metaMontoSep}>·</span>
                      <span className={styles.metaMontoMes}>{fmt(metaMens)} <span className={styles.metaMontoLabel}>/total</span></span>
                    </div>
                  </div>
                  <div className={styles.metaRight}>
                    <span className={`${styles.badge} ${vigente ? styles.badgeOk : expirada ? styles.badgeGray : styles.badgeFuture}`}>
                      {vigente ? <><CheckCircle size={10} strokeWidth={2.5} /> Vigente</> :
                       expirada ? <><Clock size={10} strokeWidth={2.5} /> Expirada</> :
                       <><Calendar size={10} strokeWidth={2.5} /> Futura</>}
                    </span>
                    <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className={styles.metaKpis}>
                  {m.pollos_meta && <span className={styles.metaKpi}>{fmtNum(m.pollos_meta)} pollos/sem</span>}
                  {m.ticket_promedio_meta && <span className={styles.metaKpi}>TP {fmtDec(m.ticket_promedio_meta)}</span>}
                  <span className={styles.metaKpi}>{m.semanas_mes ?? 4} semanas</span>
                </div>
                <p className={styles.metaDates} style={{ textTransform: 'capitalize' }}>
                  {m.fecha_inicio ? format(parseISO(m.fecha_inicio), 'd MMM', { locale: es }) : '—'} — {m.fecha_fin ? format(parseISO(m.fecha_fin), 'd MMM yyyy', { locale: es }) : '—'}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
