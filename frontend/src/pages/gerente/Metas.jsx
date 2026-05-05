import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus, X, Trash2, Bird, DollarSign, Calendar,
  CheckCircle, Clock, AlertCircle, Settings, AlertTriangle
} from 'lucide-react'
import styles from './Metas.module.css'

const fmt    = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
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

function defaultPeriod() {
  const hoy = new Date()
  return {
    desde: format(startOfMonth(hoy), 'yyyy-MM-dd'),
    hasta: format(endOfMonth(hoy), 'yyyy-MM-dd'),
  }
}

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [metas,      setMetas]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [showPeriodo, setShowPeriodo] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)

  const hoy    = new Date()
  const hoyStr = format(hoy, 'yyyy-MM-dd')

  const dp = defaultPeriod()
  const [periodoDesde, setPeriodoDesde] = useState(dp.desde)
  const [periodoHasta, setPeriodoHasta] = useState(dp.hasta)
  const semanasActuales = semanasEntreFechas(periodoDesde, periodoHasta)
  const diasActuales    = diasEntreFechas(periodoDesde, periodoHasta)

  const [form, setForm] = useState({ sucursal_id: '', pollos_meta: '', ticket_promedio_meta: '' })

  const metaSemanal = form.pollos_meta && form.ticket_promedio_meta
    ? parseFloat(form.pollos_meta) * parseFloat(form.ticket_promedio_meta) : null
  const metaMensual = metaSemanal ? metaSemanal * semanasActuales : null

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: sucs }, { data: metasData }] = await Promise.all([
        supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
        supabase.from('metas').select('*, sucursales(nombre)').order('fecha_inicio', { ascending: false }),
      ])
      setSucursales(sucs ?? [])
      setMetas(metasData ?? [])

      // Sugerir el próximo periodo: mes siguiente al de la meta más reciente
      if (metasData?.length) {
        const sorted = [...metasData].sort((a, b) => b.fecha_fin.localeCompare(a.fecha_fin))
        const masReciente = sorted[0]
        const finReciente  = parseISO(masReciente.fecha_fin)
        const nextStart    = startOfMonth(addMonths(finReciente, 1))
        const todayStart   = startOfMonth(hoy)
        const useStart     = nextStart >= todayStart ? nextStart : todayStart
        setPeriodoDesde(format(useStart, 'yyyy-MM-dd'))
        setPeriodoHasta(format(endOfMonth(useStart), 'yyyy-MM-dd'))
      }
    } catch (e) {
      console.error('Error cargando metas:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta) return

    const metaActivaExistente = metas.find(m =>
      m.sucursal_id === form.sucursal_id &&
      m.fecha_inicio <= hoyStr &&
      m.fecha_fin >= hoyStr
    )
    if (metaActivaExistente) {
      const sucNombre = sucursales.find(s => s.id === form.sucursal_id)?.nombre ?? 'esta sucursal'
      const ok = window.confirm(
        `"${sucNombre}" ya tiene una meta activa en este periodo.\n\n` +
        `¿Crear una nueva de todas formas? La anterior seguirá vigente hasta que expire y pasará al historial automáticamente.`
      )
      if (!ok) return
    }

    setSaving(true)
    setMsg(null)
    const pollos  = parseFloat(form.pollos_meta)
    const ticket  = parseFloat(form.ticket_promedio_meta)
    const semanas = semanasEntreFechas(periodoDesde, periodoHasta)

    const { error } = await supabase.from('metas').insert({
      sucursal_id:          form.sucursal_id,
      meta_venta:           pollos * ticket,
      pollos_meta:          pollos,
      ticket_promedio_meta: ticket,
      semanas_mes:          semanas,
      fecha_inicio:         periodoDesde,
      fecha_fin:            periodoHasta,
      creado_por:           usuario.id,
    })

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Meta creada correctamente' })
      setShowForm(false)
      setForm({ sucursal_id: '', pollos_meta: '', ticket_promedio_meta: '' })
      await load()
      setTimeout(() => setMsg(null), 4000)
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta meta? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from('metas').delete().eq('id', id)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message })
    } else {
      await load()
    }
  }

  // Clasificar metas
  const metasVigentes  = metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr)
  const metasFuturas   = metas.filter(m => m.fecha_inicio > hoyStr)
  const metasExpiradas = metas.filter(m => m.fecha_fin < hoyStr)

  // ¿Cuántos días faltan para que termine el periodo activo?
  const periodoActivo = metasVigentes[0]
  const diasRestantesPeriodo = periodoActivo
    ? Math.round((new Date(periodoActivo.fecha_fin + 'T23:59:59') - hoy) / 86400000)
    : null

  const mesLabel = periodoDesde
    ? format(new Date(periodoDesde + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    : '—'

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Metas</h1>
        <div className={styles.headerBtns}>
          <button className={styles.periodoBtn} onClick={() => setShowPeriodo(v => !v)}>
            <Settings size={14} strokeWidth={2.5} />
            {showPeriodo ? 'Cerrar' : 'Nuevo periodo'}
          </button>
          <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setMsg(null) }}>
            {showForm
              ? <><X size={14} strokeWidth={2.5} /> Cancelar</>
              : <><Plus size={14} strokeWidth={2.5} /> Nueva meta</>}
          </button>
        </div>
      </div>

      {/* Alerta: sin periodo activo */}
      {!loading && metasVigentes.length === 0 && (
        <div className={styles.alertBanner}>
          <AlertTriangle size={15} strokeWidth={2.5} />
          <div>
            <strong>Sin periodo activo</strong>
            {' — '}Configura las fechas del nuevo periodo y crea las metas para que los encargados puedan registrar progreso.
          </div>
        </div>
      )}

      {/* Alerta: periodo por vencer */}
      {diasRestantesPeriodo !== null && diasRestantesPeriodo <= 7 && diasRestantesPeriodo >= 0 && (
        <div className={styles.warnBanner}>
          <AlertCircle size={15} strokeWidth={2.5} />
          <div>
            <strong>
              {diasRestantesPeriodo === 0
                ? 'El periodo termina hoy'
                : `El periodo vence en ${diasRestantesPeriodo} día${diasRestantesPeriodo !== 1 ? 's' : ''}`}
            </strong>
            {' — '}Configura el próximo periodo y crea las nuevas metas con anticipación.
          </div>
        </div>
      )}

      {/* Panel: configurar nuevo periodo */}
      {showPeriodo && (
        <div className={styles.periodoCard}>
          <div className={styles.periodoCardHeader}>
            <p className={styles.periodoCardTitle}>Configurar nuevo periodo</p>
            <p className={styles.periodoCardSub}>
              Define las fechas que se usarán al crear <strong>nuevas metas</strong>.
              Las metas existentes no se modifican — quedan en el historial al expirar.
            </p>
          </div>
          <div className={styles.periodoForm}>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Fecha inicio</label>
                <input className={styles.input2} type="date" value={periodoDesde}
                  onChange={e => setPeriodoDesde(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha fin</label>
                <input className={styles.input2} type="date" value={periodoHasta}
                  min={periodoDesde} onChange={e => setPeriodoHasta(e.target.value)} />
              </div>
            </div>
            <div className={styles.periodoResumen}>
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Semanas</span>
                <span className={styles.periodoResumenVal}>{semanasActuales}</span>
              </div>
              <div className={styles.periodoResumenDivider} />
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Días</span>
                <span className={styles.periodoResumenVal}>{diasActuales}</span>
              </div>
              <div className={styles.periodoResumenDivider} />
              <div className={styles.periodoResumenItem}>
                <span className={styles.periodoResumenLabel}>Rango</span>
                <span className={styles.periodoResumenVal} style={{ textTransform: 'capitalize' }}>
                  {periodoDesde ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
                  {' — '}
                  {periodoHasta ? format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
                </span>
              </div>
            </div>
            <button className={styles.periodoSaveBtn} type="button" onClick={() => setShowPeriodo(false)}>
              <CheckCircle size={14} strokeWidth={2.5} />
              Aplicar fechas
            </button>
            <p className={styles.periodoNota}>
              Estas fechas solo afectan las metas que crees a partir de ahora. Los periodos anteriores quedan intactos como historial.
            </p>
          </div>
        </div>
      )}

      {/* Barra de info */}
      <div className={styles.mesInfo}>
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Periodo activo</span>
          <span className={styles.mesInfoVal} style={{ textTransform: 'capitalize' }}>
            {periodoActivo
              ? format(new Date(periodoActivo.fecha_inicio + 'T12:00:00'), 'd MMM', { locale: es }) +
                ' — ' +
                format(new Date(periodoActivo.fecha_fin + 'T12:00:00'), 'd MMM yyyy', { locale: es })
              : 'Sin periodo activo'}
          </span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Nuevas metas en</span>
          <span className={styles.mesInfoVal} style={{ textTransform: 'capitalize' }}>
            {periodoDesde
              ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) + ' — ' +
                format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es })
              : '—'}
          </span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Mes</span>
          <span className={styles.mesInfoVal} style={{ textTransform: 'capitalize' }}>{mesLabel}</span>
        </div>
      </div>

      {/* Mensaje */}
      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok'
            ? <CheckCircle size={15} strokeWidth={2} />
            : <AlertCircle size={15} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

      {/* Formulario nueva meta */}
      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Nueva meta</p>
          <p className={styles.formSub}>
            Periodo:{' '}
            {periodoDesde ? format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
            {' al '}
            {periodoHasta ? format(new Date(periodoHasta + 'T12:00:00'), 'd MMM yyyy', { locale: es }) : '—'}
            {' '}({semanasActuales} semanas)
          </p>
          <form className={styles.form} onSubmit={handleSave} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))} required>
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s => {
                  const activa = metas.some(m =>
                    m.sucursal_id === s.id && m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
                  )
                  return (
                    <option key={s.id} value={s.id}>
                      {s.nombre}{activa ? ' ✓' : ''}
                    </option>
                  )
                })}
              </select>
              {form.sucursal_id && metas.some(m =>
                m.sucursal_id === form.sucursal_id && m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
              ) && (
                <p className={styles.fieldHint}>
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Esta sucursal ya tiene una meta activa en el periodo vigente
                </p>
              )}
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
            <button
              className={styles.saveBtn} type="submit"
              disabled={saving || !form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta}>
              {saving ? 'Guardando…' : 'Crear meta'}
            </button>
          </form>
        </div>
      )}

      {/* Lista de metas */}
      {loading ? (
        <div className={styles.loading}>Cargando…</div>
      ) : metas.length === 0 ? (
        <div className={styles.empty}>
          No hay metas creadas todavía. Configura el periodo y crea la primera meta.
        </div>
      ) : (
        <>
          {/* Vigentes */}
          {metasVigentes.length > 0 && (
            <>
              <p className={styles.sectionLabel}>
                <CheckCircle size={12} strokeWidth={2.5} color="var(--success)" />
                Vigentes
              </p>
              <div className={styles.metasList}>
                {metasVigentes.map(m => (
                  <MetaCard key={m.id} m={m} hoyStr={hoyStr} onDelete={handleDelete} />
                ))}
              </div>
            </>
          )}

          {/* Futuras */}
          {metasFuturas.length > 0 && (
            <>
              <p className={styles.sectionLabel}>
                <Calendar size={12} strokeWidth={2.5} color="var(--info)" />
                Próximas
              </p>
              <div className={styles.metasList}>
                {metasFuturas.map(m => (
                  <MetaCard key={m.id} m={m} hoyStr={hoyStr} onDelete={handleDelete} />
                ))}
              </div>
            </>
          )}

          {/* Historial: colapsable */}
          {metasExpiradas.length > 0 && (
            <>
              <button
                className={styles.historialToggle}
                onClick={() => setShowHistorial(v => !v)}>
                <Clock size={13} strokeWidth={2.5} />
                Historial ({metasExpiradas.length} expirada{metasExpiradas.length !== 1 ? 's' : ''})
                <span className={styles.historialArrow}>{showHistorial ? '▲' : '▼'}</span>
              </button>
              {showHistorial && (
                <div className={styles.metasList}>
                  {metasExpiradas.map(m => (
                    <MetaCard key={m.id} m={m} hoyStr={hoyStr} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function MetaCard({ m, hoyStr, onDelete }) {
  const vigente  = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
  const expirada = m.fecha_fin < hoyStr
  const metaMens = m.meta_venta * (m.semanas_mes ?? 4)
  return (
    <div className={`${styles.metaCard} ${vigente ? styles.vigente : ''}`}>
      <div className={styles.metaTop}>
        <div>
          <p className={styles.metaSucursal}>{m.sucursales?.nombre}</p>
          <div className={styles.metaMontos}>
            <span className={styles.metaMontoSem}>
              {fmt(m.meta_venta)} <span className={styles.metaMontoLabel}>/sem</span>
            </span>
            <span className={styles.metaMontoSep}>·</span>
            <span className={styles.metaMontoMes}>
              {fmt(metaMens)} <span className={styles.metaMontoLabel}>/total</span>
            </span>
          </div>
        </div>
        <div className={styles.metaRight}>
          <span className={`${styles.badge} ${vigente ? styles.badgeOk : expirada ? styles.badgeGray : styles.badgeFuture}`}>
            {vigente
              ? <><CheckCircle size={10} strokeWidth={2.5} /> Vigente</>
              : expirada
              ? <><Clock size={10} strokeWidth={2.5} /> Expirada</>
              : <><Calendar size={10} strokeWidth={2.5} /> Futura</>}
          </span>
          <button className={styles.delBtn} onClick={() => onDelete(m.id)}>
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
        {m.fecha_inicio ? format(parseISO(m.fecha_inicio), 'd MMM', { locale: es }) : '—'}
        {' — '}
        {m.fecha_fin ? format(parseISO(m.fecha_fin), 'd MMM yyyy', { locale: es }) : '—'}
      </p>
    </div>
  )
}
