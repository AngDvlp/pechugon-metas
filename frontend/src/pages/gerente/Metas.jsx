import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Metas.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [metas, setMetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({
    sucursal_id: '',
    meta_venta: '',
    fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
    fecha_fin: '',
  })

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
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('metas').insert({
      sucursal_id: form.sucursal_id,
      meta_venta: parseFloat(form.meta_venta),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      creado_por: usuario.id,
    })
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Meta creada correctamente' })
      setShowForm(false)
      setForm({ sucursal_id: '', meta_venta: '', fecha_inicio: format(new Date(), 'yyyy-MM-dd'), fecha_fin: '' })
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    await load()
  }

  const hoy = new Date().toISOString().split('T')[0]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Metas</h1>
        <button className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cancelar' : '+ Nueva meta'}
        </button>
      </div>

      {msg && <div className={`${styles.msg} ${styles[msg.tipo]}`}>{msg.texto}</div>}

      {showForm && (
        <div className={styles.formCard}>
          <p className={styles.formTitle}>Definir nueva meta</p>
          <form className={styles.form} onSubmit={handleSave} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select
                className={styles.select}
                value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))}
                required
              >
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Meta de venta</label>
              <div className={styles.inputWrap}>
                <span className={styles.prefix}>$</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={form.meta_venta}
                  onChange={e => setForm(f => ({ ...f, meta_venta: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Fecha inicio</label>
                <input
                  className={styles.input2}
                  type="date"
                  value={form.fecha_inicio}
                  onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha fin</label>
                <input
                  className={styles.input2}
                  type="date"
                  min={form.fecha_inicio}
                  value={form.fecha_fin}
                  onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                  required
                />
              </div>
            </div>

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
            const vigente = m.fecha_inicio <= hoy && m.fecha_fin >= hoy
            const expirada = m.fecha_fin < hoy
            return (
              <div key={m.id} className={`${styles.metaCard} ${vigente ? styles.vigente : ''}`}>
                <div className={styles.metaTop}>
                  <div>
                    <p className={styles.metaSucursal}>{m.sucursales?.nombre}</p>
                    <p className={styles.metaMonto}>{fmt(m.meta_venta)}</p>
                  </div>
                  <div className={styles.metaRight}>
                    <span className={`${styles.badge} ${vigente ? styles.badgeOk : expirada ? styles.badgeGray : styles.badgeFuture}`}>
                      {vigente ? 'Vigente' : expirada ? 'Expirada' : 'Futura'}
                    </span>
                    <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button>
                  </div>
                </div>
                <p className={styles.metaDates}>
                  {format(parseISO(m.fecha_inicio), 'd MMM yyyy', { locale: es })} —{' '}
                  {format(parseISO(m.fecha_fin), 'd MMM yyyy', { locale: es })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
