import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, Route, Store, CheckCircle, AlertCircle } from 'lucide-react'
import styles from './Rutas.module.css'

export default function GerenteRutas() {
  const [rutas,      setRutas]      = useState([])
  const [sucursales, setSucursales] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [nombre,     setNombre]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: rs }, { data: sucs }] = await Promise.all([
      supabase.from('rutas')
        .select('id, nombre, activa, ruta_sucursales(sucursal_id, sucursales(id, nombre))')
        .order('nombre'),
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    ])
    setRutas(rs ?? [])
    setSucursales(sucs ?? [])
    setLoading(false)
  }

  async function handleCrear(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('rutas').insert({ nombre: nombre.trim() })
    if (error) {
      setMsg({ tipo: 'error', texto: error.message.includes('unique') ? 'Ya existe una ruta con ese nombre' : 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Ruta "${nombre.trim()}" creada` })
      setNombre('')
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  async function handleAgregarSucursal(rutaId, sucursalId) {
    if (!sucursalId) return
    await supabase.from('ruta_sucursales').insert({ ruta_id: rutaId, sucursal_id: sucursalId })
    await load()
  }

  async function handleQuitarSucursal(rutaId, sucursalId) {
    await supabase.from('ruta_sucursales').delete()
      .eq('ruta_id', rutaId).eq('sucursal_id', sucursalId)
    await load()
  }

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Rutas</h1>
        <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setMsg(null) }}>
          {showForm ? 'Cancelar' : <><Plus size={14} strokeWidth={2.5} /> Nueva</>}
        </button>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok' ? <CheckCircle size={14} strokeWidth={2} /> : <AlertCircle size={14} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

      {showForm && (
        <form className={styles.formCard} onSubmit={handleCrear}>
          <p className={styles.formTitle}>Nueva ruta</p>
          <input
            className={styles.input}
            type="text"
            placeholder="Nombre de la ruta (ej. Ruta Norte)"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            required
            autoFocus
          />
          <button className={styles.saveBtn} type="submit" disabled={saving || !nombre.trim()}>
            {saving ? 'Creando…' : 'Crear ruta'}
          </button>
        </form>
      )}

      {rutas.length === 0 && !showForm && (
        <div className={styles.empty}>No hay rutas — crea la primera</div>
      )}

      <div className={styles.list}>
        {rutas.map(ruta => {
          const enRuta       = ruta.ruta_sucursales ?? []
          const enRutaIds    = enRuta.map(rs => rs.sucursal_id)
          const disponibles  = sucursales.filter(s => !enRutaIds.includes(s.id))

          return (
            <div key={ruta.id} className={styles.rutaCard}>
              <div className={styles.rutaHeader}>
                <div className={styles.rutaIconWrap}><Route size={15} strokeWidth={1.75} /></div>
                <p className={styles.rutaNombre}>{ruta.nombre}</p>
                <span className={styles.rutaCount}>
                  {enRuta.length} sucursal{enRuta.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {enRuta.length > 0 && (
                <div className={styles.sucTags}>
                  {enRuta.map(rs => (
                    <span key={rs.sucursal_id} className={styles.sucTag}>
                      <Store size={10} strokeWidth={2} />
                      {rs.sucursales?.nombre}
                      <button
                        className={styles.quitarBtn}
                        onClick={() => handleQuitarSucursal(ruta.id, rs.sucursal_id)}>
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {disponibles.length > 0 && (
                <select
                  className={styles.selectSmall}
                  value=""
                  onChange={e => {
                    if (e.target.value) { handleAgregarSucursal(ruta.id, e.target.value); e.target.value = '' }
                  }}>
                  <option value="">+ Agregar sucursal…</option>
                  {disponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}

              {enRuta.length === 0 && disponibles.length === 0 && (
                <p className={styles.sinSuc}>Todas las sucursales están en esta ruta</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
