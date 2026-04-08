import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle, AlertCircle, CalendarDays, Store, Edit3 } from 'lucide-react'
import styles from './RegistroAtrasado.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)
const ayerStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')

export default function RegistroAtrasado() {
  const { usuario } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [loadingSucs, setLoadingSucs] = useState(true)

  const [sucursalId, setSucursalId] = useState('')
  const [fecha, setFecha] = useState(ayerStr)

  const [ventaExistente, setVentaExistente] = useState(null)
  const [loadingVenta, setLoadingVenta] = useState(false)

  const [venta, setVenta] = useState('')
  const [pollos, setPollos] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const [recientes, setRecientes] = useState([])

  useEffect(() => { loadSucursales() }, [usuario])

  useEffect(() => {
    if (sucursalId && fecha) buscarVenta()
    else { setVentaExistente(null); setVenta(''); setPollos('') }
  }, [sucursalId, fecha])

  useEffect(() => {
    if (sucursalId) loadRecientes()
  }, [sucursalId, msg])

  async function loadSucursales() {
    if (!usuario) return
    setLoadingSucs(true)
    try {
      const { data: ss } = await supabase
        .from('supervisor_sucursales')
        .select('sucursal_id, sucursales(id, nombre)')
        .eq('supervisor_id', usuario.id)
      const sucs = ss?.map(r => r.sucursales).filter(Boolean) ?? []
      sucs.sort((a, b) => a.nombre.localeCompare(b.nombre))
      setSucursales(sucs)
      if (sucs.length === 1) setSucursalId(sucs[0].id)
    } finally {
      setLoadingSucs(false)
    }
  }

  async function buscarVenta() {
    setLoadingVenta(true)
    setMsg(null)
    const { data } = await supabase
      .from('ventas_diarias')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .eq('fecha', fecha)
      .maybeSingle()
    setVentaExistente(data ?? null)
    if (data) {
      setVenta(data.venta_total ?? '')
      setPollos(data.pollos_vendidos ?? '')
    } else {
      setVenta('')
      setPollos('')
    }
    setLoadingVenta(false)
  }

  async function loadRecientes() {
    const desde = format(subDays(new Date(), 30), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('ventas_diarias')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .lt('fecha', format(new Date(), 'yyyy-MM-dd'))
      .gte('fecha', desde)
      .order('fecha', { ascending: false })
      .limit(10)
    setRecientes(data ?? [])
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!sucursalId || !fecha || !venta || !pollos) return
    setSaving(true)
    setMsg(null)
    const payload = {
      sucursal_id: sucursalId,
      fecha,
      venta_total: parseFloat(venta),
      pollos_vendidos: parseFloat(pollos),
    }
    const { error } = ventaExistente
      ? await supabase.from('ventas_diarias')
          .update({ venta_total: payload.venta_total, pollos_vendidos: payload.pollos_vendidos })
          .eq('id', ventaExistente.id)
      : await supabase.from('ventas_diarias')
          .insert({ ...payload, encargado_id: null })
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
    } else {
      setMsg({ tipo: 'ok', texto: ventaExistente ? 'Venta actualizada' : 'Venta registrada' })
      await buscarVenta()
    }
    setSaving(false)
  }

  const ticketPreview = venta && pollos && parseFloat(pollos) > 0
    ? parseFloat(venta) / parseFloat(pollos) : null

  const sucursalNombre = sucursales.find(s => s.id === sucursalId)?.nombre ?? ''
  const fechaLabel = fecha
    ? format(new Date(fecha + 'T12:00:00'), "EEE d 'de' MMMM yyyy", { locale: es })
    : ''

  if (loadingSucs) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}><CalendarDays size={22} strokeWidth={1.75} /></div>
        <div>
          <h1 className={styles.heroTitle}>Ventas atrasadas</h1>
          <p className={styles.heroSub}>Registra o edita ventas de días anteriores</p>
        </div>
      </div>

      <div className={styles.formCard}>
        {/* Sucursal */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <Store size={13} strokeWidth={2} /> Sucursal
          </label>
          {sucursales.length === 1 ? (
            <div className={styles.sucSingle}>{sucursales[0].nombre}</div>
          ) : (
            <select className={styles.select} value={sucursalId} onChange={e => setSucursalId(e.target.value)}>
              <option value="">Seleccionar sucursal…</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
        </div>

        {/* Fecha */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <CalendarDays size={13} strokeWidth={2} /> Fecha
          </label>
          <input
            className={styles.dateInput}
            type="date"
            value={fecha}
            max={ayerStr}
            onChange={e => setFecha(e.target.value)}
          />
          {fecha && <p className={styles.fechaLabel} style={{ textTransform: 'capitalize' }}>{fechaLabel}</p>}
        </div>

        {/* Estado de la venta */}
        {sucursalId && fecha && !loadingVenta && (
          <div className={`${styles.estadoBadge} ${ventaExistente ? styles.estadoEdit : styles.estadoNew}`}>
            <Edit3 size={12} strokeWidth={2.5} />
            {ventaExistente ? 'Editando registro existente' : 'Sin registro — se creará uno nuevo'}
          </div>
        )}

        {/* Formulario */}
        {sucursalId && fecha && !loadingVenta && (
          <form onSubmit={handleSave} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Venta total</label>
              <div className={styles.inputWrap}>
                <span className={styles.prefix}>$</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={venta}
                  onChange={e => setVenta(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Pollos vendidos</label>
              <div className={styles.inputWrap}>
                <span className={styles.prefix}>🐔</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={pollos}
                  onChange={e => setPollos(e.target.value)}
                  required
                />
              </div>
            </div>

            {ticketPreview !== null && (
              <div className={styles.ticketPreview}>
                <span>Ticket promedio</span>
                <span className={styles.ticketVal}>{fmtDec(ticketPreview)}</span>
              </div>
            )}

            {msg && (
              <div className={`${styles.msg} ${styles[msg.tipo]}`}>
                {msg.tipo === 'ok'
                  ? <CheckCircle size={14} strokeWidth={2} />
                  : <AlertCircle size={14} strokeWidth={2} />}
                {msg.texto}
              </div>
            )}

            <button className={styles.saveBtn} type="submit" disabled={saving || !venta || !pollos}>
              {saving ? 'Guardando…' : ventaExistente ? 'Actualizar venta' : 'Guardar venta'}
            </button>
          </form>
        )}

        {loadingVenta && <div className={styles.checking}>Verificando…</div>}
      </div>

      {/* Historial reciente */}
      {sucursalId && recientes.length > 0 && (
        <div className={styles.historial}>
          <p className={styles.historialTitle}>Últimos 30 días — {sucursalNombre}</p>
          <div className={styles.historialList}>
            <div className={styles.historialHead}>
              <span>Fecha</span>
              <span>Venta</span>
              <span>Pollos</span>
              <span>Ticket</span>
            </div>
            {recientes.map(r => (
              <div
                key={r.id}
                className={`${styles.historialRow} ${r.fecha === fecha ? styles.historialRowActive : ''}`}
                onClick={() => { setFecha(r.fecha); setMsg(null) }}
              >
                <span className={styles.hFecha} style={{ textTransform: 'capitalize' }}>
                  {format(new Date(r.fecha + 'T12:00:00'), 'EEE d MMM', { locale: es })}
                </span>
                <span className={styles.hVal}>{fmt(r.venta_total)}</span>
                <span className={styles.hNum}>{fmtNum(r.pollos_vendidos)}</span>
                <span className={styles.hTicket}>{fmtDec(r.ticket_promedio)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
