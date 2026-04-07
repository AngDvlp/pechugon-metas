import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, Bird, TrendingUp, CheckCircle, AlertCircle, Lock } from 'lucide-react'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function EncargadoDashboard() {
  const { usuario } = useAuth()
  const sucursal = usuario?.sucursales
  const sucursalId = sucursal?.id
  const hoyStr = format(new Date(), 'yyyy-MM-dd')

  const [ventaHoy, setVentaHoy] = useState(null)
  const [ultimas, setUltimas] = useState([])
  const [form, setForm] = useState({ venta_total: '', pollos_vendidos: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (sucursalId) load() }, [sucursalId])

  async function load() {
    setLoading(true)
    const [{ data: hoyData }, { data: histData }] = await Promise.all([
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).eq('fecha', hoyStr).maybeSingle(),
      supabase.from('ventas_diarias').select('*').eq('sucursal_id', sucursalId).order('fecha', { ascending: false }).limit(14),
    ])
    setVentaHoy(hoyData)
    setUltimas(histData ?? [])
    if (hoyData) setForm({ venta_total: hoyData.venta_total, pollos_vendidos: hoyData.pollos_vendidos })
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
      fecha: hoyStr,
      venta_total: parseFloat(form.venta_total),
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

  const ticketCalculado = form.venta_total && form.pollos_vendidos && parseFloat(form.pollos_vendidos) > 0
    ? parseFloat(form.venta_total) / parseFloat(form.pollos_vendidos)
    : null

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      <div className={styles.sucursalHeader}>
        <h2 className={styles.sucursalNombre}>{sucursal?.nombre ?? 'Mi Sucursal'}</h2>
        <p className={styles.sucursalFecha} style={{ textTransform: 'capitalize' }}>
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      <div className={styles.formCard}>
        <p className={styles.formTitle}>{ventaHoy ? 'Actualizar cierre de hoy' : 'Registrar cierre de hoy'}</p>
        <form className={styles.form} onSubmit={handleSave} noValidate>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Venta Total</label>
            <div className={styles.inputWrapper}>
              <DollarSign size={16} strokeWidth={2} color="var(--text-muted)" className={styles.inputIcon} />
              <input className={styles.input} type="number" inputMode="decimal"
                min="0" step="0.01" placeholder="0.00"
                value={form.venta_total}
                onChange={e => setForm(f => ({ ...f, venta_total: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Pollos Vendidos</label>
            <div className={styles.inputWrapper}>
              <Bird size={16} strokeWidth={2} color="var(--text-muted)" className={styles.inputIcon} />
              <input className={styles.input} type="number" inputMode="decimal"
                min="0" step="0.5" placeholder="0"
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
              {msg.tipo === 'ok'
                ? <CheckCircle size={15} strokeWidth={2} />
                : <AlertCircle size={15} strokeWidth={2} />}
              {msg.texto}
            </div>
          )}
          <button className={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Guardando…' : ventaHoy ? 'Actualizar' : 'Registrar Venta'}
          </button>
        </form>
      </div>

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
    </div>
  )
}
