import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { UserPlus, Pencil, CheckCircle, AlertCircle, Store, Mail, Lock, User, Route, KeyRound, X } from 'lucide-react'
import styles from './Usuarios.module.css'

export default function GerenteUsuarios() {
  const [usuarios,   setUsuarios]   = useState([])
  const [sucursales, setSucursales] = useState([])
  const [roles,      setRoles]      = useState([])
  const [rutas,      setRutas]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)
  const [form,       setForm]       = useState({ nombre: '', email: '', password: '', rol_id: '', sucursal_id: '', ruta_id: '' })

  // Edit state
  const [editingId,   setEditingId]   = useState(null)
  const [editForm,    setEditForm]    = useState({ nombre: '', rol_id: '', sucursal_id: '', ruta_id: '' })
  const [editSaving,  setEditSaving]  = useState(false)
  const [resetSending, setResetSending] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: usrs }, { data: sucs }, { data: rols }, { data: rs }] = await Promise.all([
      supabase.from('usuarios').select('*, roles(nombre), sucursales(nombre), rutas(id, nombre)').order('nombre'),
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('roles').select('*'),
      supabase.from('rutas').select('id, nombre').eq('activa', true).order('nombre'),
    ])
    setUsuarios(usrs ?? [])
    setSucursales(sucs ?? [])
    setRoles(rols ?? [])
    setRutas(rs ?? [])
    setLoading(false)
  }

  const rolSeleccionado = roles.find(r => r.id === parseInt(form.rol_id))
  const editRolNombre   = roles.find(r => r.id === parseInt(editForm.rol_id))?.nombre ?? ''

  function openEdit(u) {
    setEditingId(u.id)
    setEditForm({
      nombre:      u.nombre ?? '',
      rol_id:      String(u.rol_id ?? ''),
      sucursal_id: u.sucursal_id ?? '',
      ruta_id:     u.ruta_id ?? '',
    })
    setMsg(null)
  }

  function closeEdit() {
    setEditingId(null)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)

    const { data: { session: gerenteSession } } = await supabase.auth.getSession()

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    })
    if (authErr) { setMsg({ tipo: 'error', texto: 'Error: ' + authErr.message }); setSaving(false); return }
    const uid = authData.user?.id
    if (!uid) { setMsg({ tipo: 'error', texto: 'No se pudo obtener el ID del usuario' }); setSaving(false); return }

    if (gerenteSession) {
      await supabase.auth.setSession({
        access_token:  gerenteSession.access_token,
        refresh_token: gerenteSession.refresh_token,
      })
    }

    const { error: dbErr } = await supabase.from('usuarios').insert({
      id:          uid,
      nombre:      form.nombre.trim(),
      email:       form.email.trim(),
      rol_id:      parseInt(form.rol_id),
      sucursal_id: rolSeleccionado?.nombre === 'encargado' ? (form.sucursal_id || null) : null,
      ruta_id:     rolSeleccionado?.nombre === 'supervisor' ? (form.ruta_id || null)    : null,
    })
    if (dbErr) { setMsg({ tipo: 'error', texto: 'Error en DB: ' + dbErr.message }); setSaving(false); return }

    setMsg({ tipo: 'ok', texto: `Usuario "${form.nombre.trim()}" creado` })
    setShowForm(false)
    setForm({ nombre: '', email: '', password: '', rol_id: '', sucursal_id: '', ruta_id: '' })
    await load()
    setSaving(false)
  }

  async function handleEdit(e, u) {
    e.preventDefault()
    setEditSaving(true)
    setMsg(null)
    const { error } = await supabase.from('usuarios').update({
      nombre:      editForm.nombre.trim(),
      rol_id:      parseInt(editForm.rol_id),
      sucursal_id: editRolNombre === 'encargado' ? (editForm.sucursal_id || null) : null,
      ruta_id:     editRolNombre === 'supervisor' ? (editForm.ruta_id || null)    : null,
    }).eq('id', u.id)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `"${editForm.nombre.trim()}" actualizado` })
      setEditingId(null)
      await load()
    }
    setEditSaving(false)
  }

  async function handleResetPassword(email) {
    setResetSending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al enviar correo: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: `Correo de restablecimiento enviado a ${email}` })
    }
    setResetSending(false)
  }

  const ROL_COLOR = { gerente: 'var(--info)', supervisor: 'var(--yellow)', suplente: 'var(--yellow)', encargado: 'var(--success)' }
  const ROL_DIM   = { gerente: 'var(--info-dim)', supervisor: 'var(--warning-dim)', suplente: 'var(--warning-dim)', encargado: 'var(--success-dim)' }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Usuarios</h1>
        <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setEditingId(null); setMsg(null) }}>
          {showForm ? 'Cancelar' : <><UserPlus size={14} strokeWidth={2.5} /> Nuevo</>}
        </button>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok' ? <CheckCircle size={15} strokeWidth={2} /> : <AlertCircle size={15} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

      {/* ── Formulario nuevo usuario ── */}
      {showForm && (
        <form className={styles.formCard} onSubmit={handleAdd} noValidate>
          <p className={styles.formTitle}>Nuevo usuario</p>
          <div className={styles.field}>
            <label className={styles.label}>Nombre completo</label>
            <div className={styles.inputWrap}>
              <User size={15} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="text" placeholder="Nombre Apellido"
                value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Correo electrónico</label>
            <div className={styles.inputWrap}>
              <Mail size={15} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="email" placeholder="correo@ejemplo.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contraseña temporal</label>
            <div className={styles.inputWrap}>
              <Lock size={15} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="password" placeholder="Mínimo 8 caracteres"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
            </div>
          </div>
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Rol</label>
              <select className={styles.select} value={form.rol_id}
                onChange={e => setForm(f => ({ ...f, rol_id: e.target.value }))} required>
                <option value="">Seleccionar…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            {rolSeleccionado?.nombre === 'encargado' && (
              <div className={styles.field}>
                <label className={styles.label}>Sucursal</label>
                <select className={styles.select} value={form.sucursal_id}
                  onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
            {rolSeleccionado?.nombre === 'supervisor' && (
              <div className={styles.field}>
                <label className={styles.label}>Ruta</label>
                <select className={styles.select} value={form.ruta_id}
                  onChange={e => setForm(f => ({ ...f, ruta_id: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
          <button className={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear Usuario'}
          </button>
        </form>
      )}

      {loading ? <div className={styles.empty}>Cargando…</div> : (
        <div className={styles.list}>
          {usuarios.map(u => {
            const rolNombre = u.roles?.nombre ?? '—'
            const isEditing = editingId === u.id
            return (
              <div key={u.id} className={`${styles.userCard} ${isEditing ? styles.userCardEditing : ''}`}>

                {/* ── Cabecera del card ── */}
                <div className={styles.userTop}>
                  <div>
                    <p className={styles.userName}>{u.nombre}</p>
                    <p className={styles.userEmail}>{u.email}</p>
                  </div>
                  <div className={styles.userTopRight}>
                    <span className={styles.rolBadge}
                      style={{ background: ROL_DIM[rolNombre], color: ROL_COLOR[rolNombre] }}>
                      {rolNombre}
                    </span>
                    <button
                      className={`${styles.editBtn} ${isEditing ? styles.editBtnActive : ''}`}
                      onClick={() => isEditing ? closeEdit() : openEdit(u)}
                      title={isEditing ? 'Cerrar' : 'Editar usuario'}>
                      {isEditing ? <X size={14} strokeWidth={2.5} /> : <Pencil size={14} strokeWidth={2} />}
                    </button>
                  </div>
                </div>

                {/* ── Info estática (solo cuando no edita) ── */}
                {!isEditing && (
                  <>
                    {rolNombre === 'encargado' && u.sucursales && (
                      <p className={styles.sucAsignada}>
                        <Store size={12} strokeWidth={2} /> {u.sucursales.nombre}
                      </p>
                    )}
                    {rolNombre === 'suplente' && (
                      <p className={styles.sucAsignada} style={{ color: 'var(--yellow)' }}>
                        <Store size={12} strokeWidth={2} /> Acceso a todas las sucursales
                      </p>
                    )}
                    {rolNombre === 'supervisor' && u.rutas?.nombre && (
                      <div className={styles.rutaTag}>
                        <Route size={11} strokeWidth={2} />
                        {u.rutas.nombre}
                      </div>
                    )}
                  </>
                )}

                {/* ── Panel de edición ── */}
                {isEditing && (
                  <form className={styles.editForm} onSubmit={e => handleEdit(e, u)} noValidate>
                    <div className={styles.editSection}>
                      <p className={styles.editSectionTitle}>Perfil</p>
                      <div className={styles.field}>
                        <label className={styles.label}>Nombre completo</label>
                        <div className={styles.inputWrap}>
                          <User size={14} strokeWidth={2} color="var(--text-muted)" />
                          <input className={styles.input} type="text"
                            value={editForm.nombre}
                            onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                            required />
                        </div>
                      </div>
                      <div className={styles.twoCol}>
                        <div className={styles.field}>
                          <label className={styles.label}>Rol</label>
                          <select className={styles.select} value={editForm.rol_id}
                            onChange={e => setEditForm(f => ({ ...f, rol_id: e.target.value }))}>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </select>
                        </div>
                        {editRolNombre === 'encargado' && (
                          <div className={styles.field}>
                            <label className={styles.label}>Sucursal</label>
                            <select className={styles.select} value={editForm.sucursal_id}
                              onChange={e => setEditForm(f => ({ ...f, sucursal_id: e.target.value }))}>
                              <option value="">Sin asignar</option>
                              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                          </div>
                        )}
                        {editRolNombre === 'supervisor' && (
                          <div className={styles.field}>
                            <label className={styles.label}>Ruta</label>
                            <select className={styles.select} value={editForm.ruta_id}
                              onChange={e => setEditForm(f => ({ ...f, ruta_id: e.target.value }))}>
                              <option value="">Sin asignar</option>
                              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <button className={styles.saveBtn} type="submit" disabled={editSaving}>
                        {editSaving ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>

                    <div className={styles.editSection}>
                      <p className={styles.editSectionTitle}>Contraseña</p>
                      <p className={styles.editHint}>
                        Se enviará un correo a <strong>{u.email}</strong> para que el usuario pueda crear una nueva contraseña.
                      </p>
                      <button
                        className={styles.resetBtn}
                        type="button"
                        disabled={resetSending}
                        onClick={() => handleResetPassword(u.email)}>
                        <KeyRound size={14} strokeWidth={2} />
                        {resetSending ? 'Enviando…' : 'Enviar correo de restablecimiento'}
                      </button>
                    </div>
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
