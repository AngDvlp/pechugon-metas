import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Plus, Globe, ToggleLeft, ToggleRight,
  CheckCircle, AlertCircle, Pencil, X, Save
} from 'lucide-react'
import styles from './Zonas.module.css'

export default function SuperAdminZonas() {
  const [zonas,    setZonas]    = useState([])
  const [gerentes, setGerentes] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [form,     setForm]     = useState({ nombre: '', descripcion: '' })
  const [editId,   setEditId]   = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', descripcion: '' })
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: zs }, { data: sucsData }, { data: usrsData }] = await Promise.all([
        supabase.from('zonas').select('*').order('nombre'),
        supabase.from('sucursales').select('zona_id, activa'),
        supabase.from('usuarios').select('id, nombre, zona_id, roles(nombre)'),
      ])

      // Enriquecer zonas con counts
      const sucCount = {}
      sucsData?.forEach(s => {
        if (!s.zona_id) return
        if (!sucCount[s.zona_id]) sucCount[s.zona_id] = 0
        if (s.activa) sucCount[s.zona_id]++
      })

      const usrCount = {}
      const gerenteByZona = {}
      usrsData?.forEach(u => {
        if (!u.zona_id || u.roles?.nombre === 'superadmin') return
        usrCount[u.zona_id] = (usrCount[u.zona_id] ?? 0) + 1
        if (u.roles?.nombre === 'gerente' && !gerenteByZona[u.zona_id]) {
          gerenteByZona[u.zona_id] = u.nombre
        }
      })

      const enriched = zs?.map(z => ({
        ...z,
        sucursales_activas: sucCount[z.id] ?? 0,
        total_usuarios:     usrCount[z.id] ?? 0,
        gerente_nombre:     gerenteByZona[z.id] ?? null,
      })) ?? []

      // Gerentes sin zona o disponibles (para asignación futura)
      const gs = usrsData?.filter(u => u.roles?.nombre === 'gerente') ?? []
      setGerentes(gs)
      setZonas(enriched)
    } catch (e) {
      console.error('Error loading zonas:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCrear(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('zonas').insert({
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
    })
    if (error) {
      setMsg({ tipo: 'error', texto: error.message.includes('unique') ? 'Ya existe una zona con ese nombre' : 'Error: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Zona "${form.nombre.trim()}" creada` })
      setForm({ nombre: '', descripcion: '' })
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  async function handleEditar(e) {
    e.preventDefault()
    if (!editForm.nombre.trim()) return
    setEditSaving(true)
    setMsg(null)
    const { error } = await supabase.from('zonas').update({
      nombre:      editForm.nombre.trim(),
      descripcion: editForm.descripcion.trim() || null,
    }).eq('id', editId)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Zona actualizada' })
      setEditId(null)
      await load()
    }
    setEditSaving(false)
  }

  async function toggleActiva(zona) {
    await supabase.from('zonas').update({ activa: !zona.activa }).eq('id', zona.id)
    await load()
  }

  function openEdit(zona) {
    setEditId(zona.id)
    setEditForm({ nombre: zona.nombre, descripcion: zona.descripcion ?? '' })
    setMsg(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Zonas</h1>
        <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setEditId(null); setMsg(null) }}>
          {showForm ? 'Cancelar' : <><Plus size={14} strokeWidth={2.5} /> Nueva</>}
        </button>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok'
            ? <CheckCircle size={14} strokeWidth={2} />
            : <AlertCircle size={14} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

      {/* Formulario nueva zona */}
      {showForm && (
        <form className={styles.formCard} onSubmit={handleCrear} noValidate>
          <p className={styles.formTitle}>Nueva zona</p>
          <div className={styles.field}>
            <label className={styles.label}>Nombre de la zona</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Ej. Zona Norte"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Descripción (opcional)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Breve descripción…"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <button className={styles.saveBtn} type="submit" disabled={saving || !form.nombre.trim()}>
            {saving ? 'Creando…' : 'Crear zona'}
          </button>
        </form>
      )}

      {loading ? (
        <div className={styles.empty}>Cargando…</div>
      ) : (
        <div className={styles.list}>
          {zonas.length === 0 && !showForm && (
            <div className={styles.empty}>Sin zonas — crea la primera</div>
          )}

          {zonas.map(zona => {
            const isEditing = editId === zona.id
            return (
              <div key={zona.id} className={`${styles.zonaCard} ${!zona.activa ? styles.inactiva : ''}`}>

                {/* Header */}
                <div className={styles.zonaHeader}>
                  <div className={styles.zonaIconWrap}>
                    <Globe size={14} strokeWidth={1.75} />
                  </div>
                  <div className={styles.zonaInfo}>
                    <p className={styles.zonaNombre}>{zona.nombre}</p>
                    {zona.descripcion && !isEditing && (
                      <p className={styles.zonaDesc}>{zona.descripcion}</p>
                    )}
                  </div>
                  <div className={styles.zonaActions}>
                    <button
                      className={`${styles.editBtn} ${isEditing ? styles.editBtnActive : ''}`}
                      onClick={() => isEditing ? setEditId(null) : openEdit(zona)}
                      title="Editar"
                    >
                      {isEditing ? <X size={13} strokeWidth={2.5} /> : <Pencil size={13} strokeWidth={2} />}
                    </button>
                    <button
                      className={`${styles.toggleBtn} ${zona.activa ? styles.toggleOff : styles.toggleOn}`}
                      onClick={() => toggleActiva(zona)}
                    >
                      {zona.activa
                        ? <><ToggleRight size={15} strokeWidth={2} /> Desactivar</>
                        : <><ToggleLeft size={15} strokeWidth={2} /> Activar</>}
                    </button>
                  </div>
                </div>

                {/* Stats */}
                {!isEditing && (
                  <div className={styles.zonaMetas}>
                    <div className={styles.zonaMeta}>
                      <span className={styles.zonaMetaVal}>{zona.sucursales_activas}</span>
                      <span className={styles.zonaMetaLabel}>Sucursales</span>
                    </div>
                    <div className={styles.zonaMetaDivider} />
                    <div className={styles.zonaMeta}>
                      <span className={styles.zonaMetaVal}>{zona.total_usuarios}</span>
                      <span className={styles.zonaMetaLabel}>Usuarios</span>
                    </div>
                    <div className={styles.zonaMetaDivider} />
                    <div className={styles.zonaMeta}>
                      <span className={styles.zonaMetaVal}>{zona.gerente_nombre ?? '—'}</span>
                      <span className={styles.zonaMetaLabel}>Gerente</span>
                    </div>
                  </div>
                )}

                {/* Form de edición */}
                {isEditing && (
                  <form className={styles.editForm} onSubmit={handleEditar} noValidate>
                    <div className={styles.field}>
                      <label className={styles.label}>Nombre</label>
                      <input
                        className={styles.input}
                        type="text"
                        value={editForm.nombre}
                        onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        required
                        autoFocus
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Descripción</label>
                      <input
                        className={styles.input}
                        type="text"
                        placeholder="Opcional…"
                        value={editForm.descripcion}
                        onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                      />
                    </div>
                    <button className={styles.saveBtn} type="submit" disabled={editSaving}>
                      <Save size={13} strokeWidth={2} />
                      {editSaving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
