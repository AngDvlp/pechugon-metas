import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import styles from './Sucursales.module.css'

export default function GerenteSucursales() {
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('sucursales').select('*').order('nombre')
    setSucursales(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    const { error } = await supabase.from('sucursales').insert({ nombre: nombre.trim() })
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Sucursal agregada' })
      setNombre('')
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  async function toggleActiva(s) {
    await supabase.from('sucursales').update({ activa: !s.activa }).eq('id', s.id)
    await load()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sucursales</h1>
        <button className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕' : '+ Agregar'}
        </button>
      </div>

      {msg && <div className={`${styles.msg} ${styles[msg.tipo]}`}>{msg.texto}</div>}

      {showForm && (
        <form className={styles.formCard} onSubmit={handleAdd} noValidate>
          <label className={styles.label}>Nombre de la sucursal</label>
          <div className={styles.row}>
            <input
              className={styles.input}
              type="text"
              placeholder="Ej. Sucursal Norte"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              autoFocus
            />
            <button className={styles.saveBtn} type="submit" disabled={saving}>
              {saving ? '…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.empty}>Cargando…</div>
      ) : (
        <div className={styles.list}>
          {sucursales.map(s => (
            <div key={s.id} className={`${styles.row2} ${!s.activa ? styles.inactiva : ''}`}>
              <div className={styles.sucInfo}>
                <span className={styles.sucNombre}>{s.nombre}</span>
                <span className={`${styles.badge} ${s.activa ? styles.badgeOk : styles.badgeGray}`}>
                  {s.activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <button
                className={`${styles.toggleBtn} ${s.activa ? styles.toggleOff : styles.toggleOn}`}
                onClick={() => toggleActiva(s)}
              >
                {s.activa ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
