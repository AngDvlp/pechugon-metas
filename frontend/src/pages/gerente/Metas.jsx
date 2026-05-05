import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
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
function periodoLabel(desde, hasta) {
  try {
    const ini = format(parseISO(desde), "d 'de' MMM", { locale: es })
    const fin = format(parseISO(hasta), "d 'de' MMM yyyy", { locale: es })
    const sem = semanasEntreFechas(desde, hasta)
    return `${ini} — ${fin}  (${sem} sem)`
  } catch { return `${desde} — ${hasta}` }
}

function currentMonthPeriod() {
  const hoy = new Date()
  return {
    desde: format(startOfMonth(hoy), 'yyyy-MM-dd'),
    hasta: format(endOfMonth(hoy), 'yyyy-MM-dd'),
  }
}

const FORM_EMPTY = { sucursal_id: '', pollos_meta: '', ticket_promedio_meta: '', periodoKey: '' }

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const [sucursales,    setSucursales]    = useState([])
  const [metas,         setMetas]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [showPeriodo,   setShowPeriodo]   = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [msg,           setMsg]           = useState(null)

  const hoy    = new Date()
  const hoyStr = format(hoy, 'yyyy-MM-dd')

  // Fechas del nuevo periodo (solo para configurar, nunca se guardan solas en DB)
  const cmp = currentMonthPeriod()
  const [periodoDesde, setPeriodoDesde] = useState(cmp.desde)
  const [periodoHasta, setPeriodoHasta] = useState(cmp.hasta)

  const [form, setForm] = useState(FORM_EMPTY)

  // ── Periodos disponibles: únicos de las metas existentes + el nuevo si no está ──
  const periodosDisponibles = useMemo(() => {
    const map = new Map()
    metas.forEach(m => {
      if (!m.fecha_inicio || !m.fecha_fin) return
      const k = `${m.fecha_inicio}|${m.fecha_fin}`
      if (!map.has(k)) map.set(k, { key: k, fecha_inicio: m.fecha_inicio, fecha_fin: m.fecha_fin, esNuevo: false })
    })
    // Agregar nuevo periodo configurado si no coincide con ninguno existente
    if (periodoDesde && periodoHasta) {
      const nk = `${periodoDesde}|${periodoHasta}`
      if (!map.has(nk)) map.set(nk, { key: nk, fecha_inicio: periodoDesde, fecha_fin: periodoHasta, esNuevo: true })
    }
    return [...map.values()].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
  }, [metas, periodoDesde, periodoHasta])

  // Derivar periodo y semanas del form
  const formPeriodo = form.periodoKey
    ? { desde: form.periodoKey.split('|')[0], hasta: form.periodoKey.split('|')[1] }
    : null
  const semanasForm  = formPeriodo ? semanasEntreFechas(formPeriodo.desde, formPeriodo.hasta) : 0
  const metaSemanal  = form.pollos_meta && form.ticket_promedio_meta && semanasForm > 0
    ? parseFloat(form.pollos_meta) * parseFloat(form.ticket_promedio_meta) : null
  const metaMensual  = metaSemanal ? metaSemanal * semanasForm : null

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
    } catch (e) {
      console.error('Error cargando metas:', e)
    } finally {
      setLoading(false)
    }
  }

  function abrirForm() {
    // Pre-seleccionar el periodo más reciente al abrir el formulario
    const primerPeriodo = periodosDisponibles[0]
    setForm({ ...FORM_EMPTY, periodoKey: primerPeriodo?.key ?? '' })
    setShowForm(v => !v)
    setMsg(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta || !form.periodoKey) {
      setMsg({ tipo: 'error', texto: 'Completa todos los campos, incluyendo el periodo' })
      return
    }

    const [fechaInicio, fechaFin] = form.periodoKey.split('|')
    const metaActivaExistente = metas.find(m =>
      m.sucursal_id === form.sucursal_id &&
      m.fecha_inicio === fechaInicio &&
      m.fecha_fin === fechaFin
    )
    if (metaActivaExistente) {
      const sucNombre = sucursales.find(s => s.id === form.sucursal_id)?.nombre ?? 'esta sucursal'
      const ok = window.confirm(
        `"${sucNombre}" ya tiene una meta en ese periodo.\n¿Crear otra de todas formas?`
      )
      if (!ok) return
    }

    setSaving(true)
    setMsg(null)
    const pollos  = parseFloat(form.pollos_meta)
    const ticket  = parseFloat(form.ticket_promedio_meta)
    const semanas = semanasEntreFechas(fechaInicio, fechaFin)

    const { data: nuevaMeta, error } = await supabase
      .from('metas')
      .insert({
        sucursal_id:          form.sucursal_id,
        meta_venta:           pollos * ticket,
        pollos_meta:          pollos,
        ticket_promedio_meta: ticket,
        semanas_mes:          semanas,
        fecha_inicio:         fechaInicio,
        fecha_fin:            fechaFin,
        creado_por:           usuario.id,
      })
      .select('*, sucursales(nombre)')
      .single()

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      // Actualizar estado local sin recargar (no hay scroll reset)
      setMetas(prev => [nuevaMeta, ...prev])
      setMsg({ tipo: 'ok', texto: 'Meta creada correctamente' })
      setShowForm(false)
      setForm(FORM_EMPTY)
      setTimeout(() => setMsg(null), 4000)
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta meta?')) return
    // Optimista: quitar del estado inmediatamente
    setMetas(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('metas').delete().eq('id', id)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al eliminar: ' + error.message })
      await load() // Restaurar si falló
    }
  }

  // Clasificar metas
  const metasVigentes  = metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr)
  const metasFuturas   = metas.filter(m => m.fecha_inicio > hoyStr)
  const metasExpiradas = metas.filter(m => m.fecha_fin < hoyStr)

  const periodoActivo         = metasVigentes[0]
  const diasRestantesPeriodo  = periodoActivo
    ? Math.round((new Date(periodoActivo.fecha_fin + 'T23:59:59') - hoy) / 86400000)
    : null

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
          <button className={styles.addBtn} onClick={abrirForm}>
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
            {' — '}Crea un nuevo periodo y agrega las metas para que los encargados puedan registrar progreso.
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
                ? 'El periodo activo termina hoy'
                : `El periodo activo vence en ${diasRestantesPeriodo} día${diasRestantesPeriodo !== 1 ? 's' : ''}`}
            </strong>
            {' — '}Crea el próximo periodo y sus metas con anticipación.
          </div>
        </div>
      )}

      {/* Panel: configurar nuevo periodo */}
      {showPeriodo && (
        <div className={styles.periodoCard}>
          <div className={styles.periodoCardHeader}>
            <p className={styles.periodoCardTitle}>Agregar nuevo periodo</p>
            <p className={styles.periodoCardSub}>
              Define las fechas. Después podrás crear metas eligiendo este periodo en el formulario.
              Los periodos anteriores no se modifican.
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
            {periodoDesde && periodoHasta && (
              <div className={styles.periodoResumen}>
                <div className={styles.periodoResumenItem}>
                  <span className={styles.periodoResumenLabel}>Semanas</span>
                  <span className={styles.periodoResumenVal}>{semanasEntreFechas(periodoDesde, periodoHasta)}</span>
                </div>
                <div className={styles.periodoResumenDivider} />
                <div className={styles.periodoResumenItem}>
                  <span className={styles.periodoResumenLabel}>Días</span>
                  <span className={styles.periodoResumenVal}>{diasEntreFechas(periodoDesde, periodoHasta)}</span>
                </div>
                <div className={styles.periodoResumenDivider} />
                <div className={styles.periodoResumenItem}>
                  <span className={styles.periodoResumenLabel}>Rango</span>
                  <span className={styles.periodoResumenVal} style={{ textTransform: 'capitalize' }}>
                    {format(new Date(periodoDesde + 'T12:00:00'), 'd MMM', { locale: es })}
                    {' — '}
                    {format(new Date(periodoHasta + 'T12:00:00'), 'd MMM', { locale: es })}
                  </span>
                </div>
              </div>
            )}
            <button className={styles.periodoSaveBtn} type="button" onClick={() => setShowPeriodo(false)}>
              <CheckCircle size={14} strokeWidth={2.5} />
              Listo — usar este periodo
            </button>
            <p className={styles.periodoNota}>
              Este periodo ya aparece como opción en el formulario "Nueva meta". No se guarda hasta que crees una meta con él.
            </p>
          </div>
        </div>
      )}

      {/* Periodos disponibles (vista rápida) */}
      {!loading && periodosDisponibles.length > 0 && (
        <div className={styles.periodosRow}>
          {periodosDisponibles.map(p => {
            const vig = p.fecha_inicio <= hoyStr && p.fecha_fin >= hoyStr
            const exp = p.fecha_fin < hoyStr
            return (
              <span
                key={p.key}
                className={`${styles.periodoPill} ${vig ? styles.pillVig : exp ? styles.pillExp : p.esNuevo ? styles.pillNuevo : styles.pillFut}`}>
                {p.esNuevo && '✦ '}
                {format(parseISO(p.fecha_inicio), 'd MMM', { locale: es })}
                {' — '}
                {format(parseISO(p.fecha_fin), 'd MMM', { locale: es })}
              </span>
            )
          })}
        </div>
      )}

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
          <form className={styles.form} onSubmit={handleSave} noValidate>

            {/* Periodo selector */}
            <div className={styles.field}>
              <label className={styles.label}>Periodo</label>
              {periodosDisponibles.length === 0 ? (
                <p className={styles.fieldHint}>
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  No hay periodos — usa el botón "Nuevo periodo" para crear uno primero
                </p>
              ) : (
                <select
                  className={styles.select}
                  value={form.periodoKey}
                  onChange={e => setForm(f => ({ ...f, periodoKey: e.target.value }))}
                  required>
                  <option value="">Seleccionar periodo…</option>
                  {periodosDisponibles.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.esNuevo ? '✦ Nuevo: ' : ''}{periodoLabel(p.fecha_inicio, p.fecha_fin)}
                      {p.fecha_inicio <= hoyStr && p.fecha_fin >= hoyStr ? ' ← activo' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))} required>
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s => {
                  const tieneEnPeriodo = form.periodoKey && metas.some(m =>
                    m.sucursal_id === s.id &&
                    m.fecha_inicio === form.periodoKey.split('|')[0] &&
                    m.fecha_fin === form.periodoKey.split('|')[1]
                  )
                  return (
                    <option key={s.id} value={s.id}>
                      {s.nombre}{tieneEnPeriodo ? ' ✓' : ''}
                    </option>
                  )
                })}
              </select>
              {form.sucursal_id && form.periodoKey && metas.some(m =>
                m.sucursal_id === form.sucursal_id &&
                m.fecha_inicio === form.periodoKey.split('|')[0] &&
                m.fecha_fin === form.periodoKey.split('|')[1]
              ) && (
                <p className={styles.fieldHint}>
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Ya tiene meta en este periodo
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

            {metaSemanal !== null && formPeriodo && (
              <div className={styles.preview}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta semanal</span>
                  <span className={styles.previewVal}>{fmt(metaSemanal)}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta total ({semanasForm} semanas)</span>
                  <span className={styles.previewValBig}>{fmt(metaMensual)}</span>
                </div>
              </div>
            )}

            <button
              className={styles.saveBtn} type="submit"
              disabled={saving || !form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta || !form.periodoKey}>
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
          No hay metas. Crea un periodo con el botón "Nuevo periodo" y luego agrega metas.
        </div>
      ) : (
        <>
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

          {metasExpiradas.length > 0 && (
            <>
              <button className={styles.historialToggle} onClick={() => setShowHistorial(v => !v)}>
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
        {m.pollos_meta != null && <span className={styles.metaKpi}>{fmtNum(m.pollos_meta)} pollos/sem</span>}
        {m.ticket_promedio_meta != null && <span className={styles.metaKpi}>TP {fmtDec(m.ticket_promedio_meta)}</span>}
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
