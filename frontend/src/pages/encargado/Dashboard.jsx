import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function EncargadoDashboard() {
  const { usuario } = useAuth()
  const sucursal = usuario?.sucursales
  const sucursalId = sucursal?.id

  const hoyStr = format(new Date(), 'yyyy-MM-dd')

  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoyStr)
  const [ventaDelDia, setVentaDelDia] = useState(null)
  const [ultimas, setUltimas] = useState([])
  const [form, setForm] = useState({ venta_total: '', pollos_vendidos: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (sucursalId) loadHistorial()
  }, [sucursalId])

  useEffect(() => {
    if (sucursalId) loadFecha()
  }, [sucursalId, fechaSeleccionada])

  async function loadHistorial() {
    const { data } = await supabase
      .from('ventas_diarias')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .order('fecha', { ascending: false })
      .limit(14)
    setUltimas(data ?? [])
    setLoading(false)
  }

  async function loadFecha() {
    const { data } = await supabase
      .from('ventas_diarias')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .eq('fecha', fechaSeleccionada)
      .maybeSingle()
    setVentaDelDia(data)
    if (data) {
      setForm({ venta_total: data.venta_total, pollos_vendidos: data.pollos_vendidos })
    } else {
      setForm({ venta_total: '', pollos_vendidos: '' })
    }
    setMsg(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.venta_total || !form.pollos_vendidos) return
    setSaving(true)
    setMsg(null)

    const payload = {
      sucursal_id: sucursalId,
      encargado_id: usuario.id,
      fecha: fechaSeleccionada,
      venta_total: parseFloat(form.venta_total),
      pollos_vendidos: parseFloat(form.pollos_vendidos),
    }

    const { error } = ventaDelDia
      ? await supabase.from('ventas_diarias')
          .update({ venta_total: payload.venta_total, pollos_vendidos: payload.pollos_vendidos })
          .eq('id', ventaDelDia.id)
      : await supabase.from('ventas_diarias').insert(payload)

    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Venta del ${format(parseISO(fechaSeleccionada), "d 'de' MMMM", { locale: es })} guardada` })
      await loadHistorial()
      await loadFecha()
    }
    setSaving(false)
  }

  const ticketCalculado = form.venta_total && form.pollos_vendidos && parseFloat(form.pollos_vendidos) > 0
    ? parseFloat(form.venta_total) / parseFloat(form.pollos_vendidos)
    : null

  const fechaLabel = fechaSeleccionada === hoyStr
    ? 'Hoy'
    : format(parseISO(fechaSeleccionada), "EEEE d 'de' MMMM", { locale: es })

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* Nombre sucursal */}
      <div className={styles.sucursalHeader}>
        <h2 className={styles.sucursalNombre}>{sucursal?.nombre ?? 'Mi Sucursal'}</h2>
        <p className={styles.sucursalSub}>Registro de ventas diarias</p>
      </div>

      {/* Selector de fecha */}
      <div className={styles.fechaCard}>
        <p className={styles.fechaCardLabel}>Fecha a registrar</p>
        <div className={styles.fechaRow}>
          <button
            className={styles.fechaNav}
            onClick={() => {
              const d = new Date(fechaSeleccionada + 'T12:00:00')
              d.setDate(d.getDate() - 1)
              setFechaSeleccionada(format(d, 'yyyy-MM-dd'))
            }}
          >‹</button>
          <div className={styles.fechaCenter}>
            <input
              className={styles.fechaInput}
              type="date"
              value={fechaSeleccionada}
              max={hoyStr}
              onChange={e => setFechaSeleccionada(e.target.value)}
            />
            <p className={styles.fechaLabel} style={{ textTransform: 'capitalize' }}>{fechaLabel}</p>
          </div>
          <button
            className={styles.fechaNav}
            onClick={() => {
              const d = new Date(fechaSeleccionada + 'T12:00:00')
              d.setDate(d.getDate() + 1)
              const nueva = format(d, 'yyyy-MM-dd')
              if (nueva <= hoyStr) setFechaSeleccionada(nueva)
            }}
            disabled={fechaSeleccionada >= hoyStr}
          >›</button>
        </div>

        {/* Accesos rápidos */}
        <div className={styles.fechaShortcuts}>
          {[0, 1, 2, 3, 4, 5, 6].map(diasAtras => {
            const d = format(subDays(new Date(), diasAtras), 'yyyy-MM-dd')
            const label = diasAtras === 0 ? 'Hoy' : diasAtras === 1 ? 'Ayer' : format(parseISO(d), 'EEE d', { locale: es })
            const activo = d === fechaSeleccionada
            return (
              <button
                key={d}
                className={`${styles.shortcut} ${activo ? styles.shortcutActive : ''}`}
                onClick={() => setFechaSeleccionada(d)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Formulario de registro */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>
          {ventaDelDia ? '✏️ Actualizar registro' : '+ Nuevo registro'}
          <span className={styles.formTitleFecha}> — {format(parseISO(fechaSeleccionada), "d MMM", { locale: es })}</span>
        </p>

        <form className={styles.form} onSubmit={handleSave} noValidate>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Venta Total</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>$</span>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.venta_total}
                onChange={e => setForm(f => ({ ...f, venta_total: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Pollos Vendidos</label>
            <div className={styles.inputWrapper}>
              <span className={styles.inputPrefix}>🐔</span>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                placeholder="0"
                value={form.pollos_vendidos}
                onChange={e => setForm(f => ({ ...f, pollos_vendidos: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Ticket promedio calculado */}
          <div className={styles.ticketPreview}>
            <span className={styles.ticketLabel}>Ticket Promedio</span>
            <span className={styles.ticketValue}>
              {ticketCalculado ? fmtDec(ticketCalculado) : '—'}
            </span>
          </div>

          {msg && (
            <div className={`${styles.msg} ${styles[msg.tipo]}`}>{msg.texto}</div>
          )}

          <button className={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Guardando…' : ventaDelDia ? 'Actualizar' : 'Registrar Venta'}
          </button>
        </form>
      </div>

      {/* Historial últimos 14 días */}
      {ultimas.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Historial reciente</p>
          <div className={styles.historial}>
            <div className={styles.histHead}>
              <span>Fecha</span>
              <span>Venta</span>
              <span>Pollos</span>
              <span>T.P.</span>
            </div>
            {ultimas.map(v => (
              <div
                key={v.id}
                className={`${styles.histRow} ${v.fecha === fechaSeleccionada ? styles.histRowActive : ''}`}
                onClick={() => setFechaSeleccionada(v.fecha)}
              >
                <span className={styles.histFecha}>
                  {format(parseISO(v.fecha), 'EEE d MMM', { locale: es })}
                </span>
                <span className={styles.histVenta}>{fmt(v.venta_total)}</span>
                <span className={styles.histPollos}>{fmtNum(v.pollos_vendidos)}</span>
                <span className={styles.histTicket}>{fmtDec(v.ticket_promedio)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
