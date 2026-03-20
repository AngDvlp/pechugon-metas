import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)

export default function EncargadoDashboard() {
  const { usuario } = useAuth()
  const sucursal = usuario?.sucursales
  const sucursalId = sucursal?.id

  const [ventaHoy, setVentaHoy] = useState(null)
  const [ultimas, setUltimas] = useState([])
  const [meta, setMeta] = useState(null)
  const [form, setForm] = useState({ venta_total: '', pollos_vendidos: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const hoy = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (sucursalId) load()
  }, [sucursalId])

  async function load() {
    setLoading(true)
    const [{ data: hoyData }, { data: histData }, { data: metaData }] = await Promise.all([
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).eq('fecha', hoy).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).order('fecha', { ascending: false }).limit(7),
      supabase.rpc('resumen_sucursal', { p_sucursal_id: sucursalId }).maybeSingle(),
    ])
    setVentaHoy(hoyData)
    setUltimas(histData ?? [])
    setMeta(metaData)
    if (hoyData) {
      setForm({ venta_total: hoyData.venta_total, pollos_vendidos: hoyData.pollos_vendidos })
    }
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.venta_total || !form.pollos_vendidos) return
    setSaving(true)
    setMsg(null)

    const payload = {
      sucursal_id: sucursalId,
      encargado_id: usuario.id,
      fecha: hoy,
      venta_total: parseFloat(form.venta_total),
      pollos_vendidos: parseInt(form.pollos_vendidos),
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

  const ticketCalculado = form.venta_total && form.pollos_vendidos
    ? parseFloat(form.venta_total) / parseInt(form.pollos_vendidos)
    : null

  const avance = meta?.avance_porcentaje ?? 0
  const diasRestantes = meta ? meta.dias_totales - meta.dias_transcurridos : null

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* Meta progress */}
      {meta && (
        <div className={styles.metaCard}>
          <div className={styles.metaHeader}>
            <div>
              <p className={styles.metaLabel}>Meta del periodo</p>
              <p className={styles.metaMonto}>{fmt(meta.meta_venta)}</p>
            </div>
            <div className={styles.metaPct}>
              <span className={styles.pctNum}>{avance.toFixed(1)}</span>
              <span className={styles.pctSym}>%</span>
            </div>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.min(avance, 100)}%` }} />
          </div>
          <div className={styles.metaFooter}>
            <span>{fmt(meta.venta_acumulada)} acumulado</span>
            <span>{diasRestantes} días restantes</span>
          </div>
        </div>
      )}

      {/* Sucursal name */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sucursalNombre}>{sucursal?.nombre ?? 'Mi Sucursal'}</h2>
        <p className={styles.fechaHoy}>
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Registro form */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>{ventaHoy ? 'Actualizar cierre del día' : 'Registrar cierre del día'}</p>
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
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={form.pollos_vendidos}
                onChange={e => setForm(f => ({ ...f, pollos_vendidos: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Ticket preview */}
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
            {saving ? 'Guardando…' : ventaHoy ? 'Actualizar' : 'Registrar Venta'}
          </button>
        </form>
      </div>

      {/* Historial */}
      {ultimas.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Últimos 7 días</p>
          <div className={styles.historial}>
            {ultimas.map(v => (
              <div key={v.id} className={styles.histRow}>
                <div className={styles.histFecha}>
                  {format(parseISO(v.fecha), 'EEE d MMM', { locale: es })}
                </div>
                <div className={styles.histData}>
                  <span className={styles.histVenta}>{fmt(v.venta_total)}</span>
                  <span className={styles.histPollos}>{v.pollos_vendidos} pollos</span>
                  <span className={styles.histTicket}>TP {fmtDec(v.ticket_promedio)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
