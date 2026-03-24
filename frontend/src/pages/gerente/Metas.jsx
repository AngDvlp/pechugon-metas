import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, startOfMonth, endOfMonth, nextMonday, previousSunday, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Metas.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

// Primer lunes del mes (si el día 1 es lunes, ese mismo día)
function primerLunesDelMes(fecha) {
  const inicio = startOfMonth(fecha)
  const diaSemana = getDay(inicio) // 0=domingo, 1=lunes...
  if (diaSemana === 1) return inicio // ya es lunes
  if (diaSemana === 0) return nextMonday(inicio) // domingo -> siguiente lunes
  return nextMonday(inicio) // martes-sábado -> siguiente lunes
}

// Último domingo del mes (si el último día es domingo, ese mismo día)
function ultimoDomingoDelMes(fecha) {
  const fin = endOfMonth(fecha)
  const diaSemana = getDay(fin) // 0=domingo
  if (diaSemana === 0) return fin // ya es domingo
  return previousSunday(fin) // retroceder al domingo anterior
}

// Contar semanas completas lun-dom entre dos fechas
function semanasEntreFechas(inicio, fin) {
  const msInicio = inicio.getTime()
  const msFin = fin.getTime()
  const dias = Math.round((msFin - msInicio) / (1000 * 60 * 60 * 24)) + 1
  return Math.round(dias / 7)
}

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [metas, setMetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const hoy = new Date()
  const inicioMesDate = primerLunesDelMes(hoy)
  const finMesDate = ultimoDomingoDelMes(hoy)
  const inicioMes = format(inicioMesDate, 'yyyy-MM-dd')
  const finMes = format(finMesDate, 'yyyy-MM-dd')
  const semanas = semanasEntreFechas(inicioMesDate, finMesDate)
  const mesLabel = format(hoy, 'MMMM yyyy', { locale: es })

  const [form, setForm] = useState({
    sucursal_id: '',
    pollos_meta: '',
    ticket_promedio_meta: '',
  })

  // Meta semanal calculada
  const metaSemanal = form.pollos_meta && form.ticket_promedio_meta
    ? parseFloat(form.pollos_meta) * parseFloat(form.ticket_promedio_meta)
    : null
  const metaMensual = metaSemanal ? metaSemanal * semanas : null

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sucs }, { data: metasData }] = await Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('metas').select('*, sucursales(nombre)').order('created_at', { ascending: false }),
    ])
    setSucursales(sucs ?? [])
    setMetas(metasData ?? [])
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta) return
    setSaving(true)
    setMsg(null)

    const pollos = parseFloat(form.pollos_meta)
    const ticket = parseFloat(form.ticket_promedio_meta)
    const metaVenta = pollos * ticket

    const { error } = await supabase.from('metas').insert({
      sucursal_id: form.sucursal_id,
      meta_venta: metaVenta,        // meta SEMANAL
      pollos_meta: pollos,
      ticket_promedio_meta: ticket,
      semanas_mes: semanas,
      fecha_inicio: inicioMes,
      fecha_fin: finMes,
      creado_por: usuario.id,
    })

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Meta creada para ${mesLabel}` })
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

  const hoyStr = hoy.toISOString().split('T')[0]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Metas</h1>
        <button className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cancelar' : '+ Nueva meta'}
        </button>
      </div>

      {/* Info del mes */}
      <div className={styles.mesInfo}>
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Mes en curso</span>
          <span className={styles.mesInfoVal} style={{ textTransform: 'capitalize' }}>{mesLabel}</span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Semanas del mes</span>
          <span className={styles.mesInfoVal}>{semanas}</span>
        </div>
        <div className={styles.mesInfoDivider} />
        <div className={styles.mesInfoItem}>
          <span className={styles.mesInfoLabel}>Periodo</span>
          <span className={styles.mesInfoVal}>{format(inicioMesDate, 'd MMM', { locale: es })} — {format(finMesDate, 'd MMM', { locale: es })}</span>
        </div>
      </div>

      {msg && <div className={`${styles.msg} ${styles[msg.tipo]}`}>{msg.texto}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Nueva meta — {mesLabel}</p>
          <p className={styles.formSub}>Las fechas se asignan automáticamente al mes en curso ({semanas} semanas)</p>

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
                <label className={styles.label}>Pollos meta / semana</label>
                <div className={styles.inputWrap}>
                  <span className={styles.prefix}>🐔</span>
                  <input className={styles.input} type="number" inputMode="decimal"
                    min="0" step="0.5" placeholder="0"
                    value={form.pollos_meta}
                    onChange={e => setForm(f => ({ ...f, pollos_meta: e.target.value }))} required />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ticket promedio meta</label>
                <div className={styles.inputWrap}>
                  <span className={styles.prefix}>$</span>
                  <input className={styles.input} type="number" inputMode="decimal"
                    min="0" step="0.01" placeholder="0.00"
                    value={form.ticket_promedio_meta}
                    onChange={e => setForm(f => ({ ...f, ticket_promedio_meta: e.target.value }))} required />
                </div>
              </div>
            </div>

            {/* Preview calculado */}
            {metaSemanal !== null && (
              <div className={styles.preview}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta semanal</span>
                  <span className={styles.previewVal}>{fmt(metaSemanal)}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta mensual ({semanas} semanas)</span>
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
                      <span className={styles.metaMontoMes}>{fmt(metaMens)} <span className={styles.metaMontoLabel}>/mes</span></span>
                    </div>
                  </div>
                  <div className={styles.metaRight}>
                    <span className={`${styles.badge} ${vigente ? styles.badgeOk : expirada ? styles.badgeGray : styles.badgeFuture}`}>
                      {vigente ? 'Vigente' : expirada ? 'Expirada' : 'Futura'}
                    </span>
                    <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button>
                  </div>
                </div>
                <div className={styles.metaKpis}>
                  {m.pollos_meta && (
                    <span className={styles.metaKpi}>🐔 {fmtNum(m.pollos_meta)} pollos/sem</span>
                  )}
                  {m.ticket_promedio_meta && (
                    <span className={styles.metaKpi}>TP {fmtDec(m.ticket_promedio_meta)}</span>
                  )}
                  <span className={styles.metaKpi}>{m.semanas_mes ?? 4} semanas</span>
                </div>
                <p className={styles.metaDates} style={{ textTransform: 'capitalize' }}>
                  {format(parseISO(m.fecha_inicio), 'MMMM yyyy', { locale: es })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
