import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  UserPlus, Pencil, CheckCircle, AlertCircle,
  Store, Mail, Lock, User, Route, KeyRound, X, Globe
} from 'lucide-react'
import styles from './Usuarios.module.css'

const ROL_COLOR = {
  superadmin: 'var(--info)',
  gerente:    'var(--info)',
  supervisor: 'var(--yellow)',
  suplente:   'var(--yellow)',
  encargado:  'var(--success)',
  cocina:     'var(--red)',
}
const ROL_DIM = {
  superadmin: 'rgba(79,142,247,0.15)',
  gerente:    'var(--info-dim)',
  supervisor: 'var(--warning-dim)',
  suplente:   'var(--warning-dim)',
  encargado:  'var(--success-dim)',
  cocina:     'rgba(232,25,44,0.12)',
}

export default function SuperAdminUsuarios() {
  const [usuarios,   setUsuarios]   = useState([])
  const [zonas,      setZonas]      = useState([])
  const [sucursales, setSucursales] = useState([])
  const [roles,      setRoles]      = useState([])
  const [rutas,      setRutas]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)
  const [filtroZona, setFiltroZona] = useState('todas')
  const [filtroRol,  setFiltroRol]  = useState('todos')

  const [form, setForm] = useState({
    nombre: '', email: '', password: '', rol_id: '', zona_id: '', sucursal_id: '', ruta_id: ''
  })

  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({ nombre: '', rol_id: '', zona_id: '', sucursal_id: '', ruta_id: '' })
  const [editSaving,  setEditSaving]  = useState(false)
  const [resetSending, setResetSending] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: usrs }, { data: zs }, { data: sucs }, { data: rols }, { data: rs }] = await Promise.all([
        supabase.from('usuarios')
          .select('*, roles(nombre), sucursales(nombre), rutas(id,nombre), zonas(id,nombre)')
          .order('nombre'),
        supabase.from('zonas').select('*').eq('activa', true).order('nombre'),
        supabase.from('sucursales').select('id,nombre,zona_id').eq('activa', true).order('nombre'),
        supabase.from('roles').select('*').order('nombre'),
        supabase.from('rutas').select('id,nombre,zona_id').eq('activa', true).order('nombre'),
      ])
      setUsuarios(usrs ?? [])
      setZonas(zs ?? [])
      setSucursales(sucs ?? [])
      setRoles(rols ?? [])
      setRutas(rs ?? [])
    } catch (e) {
      console.error('Error loading usuarios:', e)
    } finally {
      setLoading(false)
    }
  }

  const rolSeleccionado    = roles.find(r => r.id === parseInt(form.rol_id))
  const editRolNombre      = roles.find(r => r.id === parseInt(editForm.rol_id))?.nombre ?? ''

  // Filtrar sucursales y rutas según la zona seleccionada en el form
  const sucsEnZonaForm = form.zona_id
    ? sucursales.filter(s => s.zona_id === form.zona_id)
    : sucursales
  const rutasEnZonaForm = form.zona_id
    ? rutas.filter(r => r.zona_id === form.zona_id)
    : rutas
  const sucsEnZonaEdit = editForm.zona_id
    ? sucursales.filter(s => s.zona_id === editForm.zona_id)
    : sucursales
  const rutasEnZonaEdit = editForm.zona_id
    ? rutas.filter(r => r.zona_id === editForm.zona_id)
    : rutas

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)

    const { data: { session: saSession } } = await supabase.auth.getSession()

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email:    form.email.trim(),
      password: form.password,
    })
    if (authErr) { setMsg({ tipo: 'error', texto: 'Error: ' + authErr.message }); setSaving(false); return }
    const uid = authData.user?.id
    if (!uid) { setMsg({ tipo: 'error', texto: 'No se pudo obtener el ID del usuario' }); setSaving(false); return }

    if (saSession) {
      await supabase.auth.setSession({
        access_token:  saSession.access_token,
        refresh_token: saSession.refresh_token,
      })
    }

    const rolNombre = rolSeleccionado?.nombre ?? ''
    const { error: dbErr } = await supabase.from('usuarios').insert({
      id:          uid,
      nombre:      form.nombre.trim(),
      email:       form.email.trim(),
      rol_id:      parseInt(form.rol_id),
      zona_id:     rolNombre !== 'superadmin' ? (form.zona_id || null) : null,
      sucursal_id: rolNombre === 'encargado'  ? (form.sucursal_id || null) : null,
      ruta_id:     rolNombre === 'supervisor' ? (form.ruta_id || null)     : null,
    })

    if (dbErr) { setMsg({ tipo: 'error', texto: 'Error en DB: ' + dbErr.message }); setSaving(false); return }

    setMsg({ tipo: 'ok', texto: `Usuario "${form.nombre.trim()}" creado` })
    setShowForm(false)
    setForm({ nombre: '', email: '', password: '', rol_id: '', zona_id: '', sucursal_id: '', ruta_id: '' })
    await load()
    setSaving(false)
  }

  function openEdit(u) {
    setEditId(u.id)
    setEditForm({
      nombre:      u.nombre ?? '',
      rol_id:      String(u.rol_id ?? ''),
      zona_id:     u.zona_id ?? '',
      sucursal_id: u.sucursal_id ?? '',
      ruta_id:     u.ruta_id ?? '',
    })
    setMsg(null)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setEditSaving(true)
    setMsg(null)
    const rolNombre = editRolNombre
    const { error } = await supabase.from('usuarios').update({
      nombre:      editForm.nombre.trim(),
      rol_id:      parseInt(editForm.rol_id),
      zona_id:     rolNombre !== 'superadmin' ? (editForm.zona_id || null) : null,
      sucursal_id: rolNombre === 'encargado'  ? (editForm.sucursal_id || null) : null,
      ruta_id:     rolNombre === 'supervisor' ? (editForm.ruta_id || null)     : null,
    }).eq('id', editId)
    if (error) {
      setMsg({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
    } else {
      setMsg({ tipo: 'ok', texto: 'Usuario actualizado' })
      setEditId(null)
      await load()
    }
    setEditSaving(false)
  }

  async function handleResetPassword(email) {
    setResetSending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setMsg(error
      ? { tipo: 'error', texto: 'Error: ' + error.message }
      : { tipo: 'ok',    texto: `Correo enviado a ${email}` })
    setResetSending(false)
  }

  // Filtros
  const usuariosFiltrados = usuarios.filter(u => {
    const matchZona = filtroZona === 'todas' || u.zona_id === filtroZona || (!u.zona_id && filtroZona === 'sin-zona')
    const matchRol  = filtroRol  === 'todos'  || u.roles?.nombre === filtroRol
    return matchZona && matchRol
  })

  const rolesUnicos = [...new Set(usuarios.map(u => u.roles?.nombre).filter(Boolean))]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Usuarios Globales</h1>
        <button className={styles.addBtn} onClick={() => { setShowForm(v => !v); setEditId(null); setMsg(null) }}>
          {showForm ? 'Cancelar' : <><UserPlus size={13} strokeWidth={2.5} /> Nuevo</>}
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

      {/* Formulario nuevo usuario */}
      {showForm && (
        <form className={styles.formCard} onSubmit={handleAdd} noValidate>
          <p className={styles.formTitle}>Nuevo usuario</p>

          <div className={styles.field}>
            <label className={styles.label}>Nombre completo</label>
            <div className={styles.inputWrap}>
              <User size={14} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="text" placeholder="Nombre Apellido"
                value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Correo electrónico</label>
            <div className={styles.inputWrap}>
              <Mail size={14} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="email" placeholder="correo@ejemplo.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contraseña temporal</label>
            <div className={styles.inputWrap}>
              <Lock size={14} strokeWidth={2} color="var(--text-muted)" />
              <input className={styles.input} type="password" placeholder="Mínimo 8 caracteres"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
            </div>
          </div>

          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Rol</label>
              <select className={styles.select} value={form.rol_id}
                onChange={e => setForm(f => ({ ...f, rol_id: e.target.value, zona_id: '', sucursal_id: '', ruta_id: '' }))} required>
                <option value="">Seleccionar…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            {rolSeleccionado?.nombre !== 'superadmin' && (
              <div className={styles.field}>
                <label className={styles.label}>Zona</label>
                <select className={styles.select} value={form.zona_id}
                  onChange={e => setForm(f => ({ ...f, zona_id: e.target.value, sucursal_id: '', ruta_id: '' }))}>
                  <option value="">Sin zona</option>
                  {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                </select>
              </div>
            )}
          </div>

          {rolSeleccionado?.nombre === 'encargado' && (
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))}>
                <option value="">Sin asignar</option>
                {sucsEnZonaForm.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          {rolSeleccionado?.nombre === 'supervisor' && (
            <div className={styles.field}>
              <label className={styles.label}>Ruta</label>
              <select className={styles.select} value={form.ruta_id}
                onChange={e => setForm(f => ({ ...f, ruta_id: e.target.value }))}>
                <option value="">Sin asignar</option>
                {rutasEnZonaForm.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
          )}

          <button className={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear Usuario'}
          </button>
        </form>
      )}

      {/* Filtros */}
      <div className={styles.filtrosRow}>
        <select className={styles.filtroSelect} value={filtroZona} onChange={e => setFiltroZona(e.target.value)}>
          <option value="todas">Todas las zonas</option>
          {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          <option value="sin-zona">Sin zona</option>
        </select>
        <select className={styles.filtroSelect} value={filtroRol} onChange={e => setFiltroRol(e.target.value)}>
          <option value="todos">Todos los roles</option>
          {rolesUnicos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <p className={styles.count}>{usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? 's' : ''}</p>

      {loading ? <div className={styles.empty}>Cargando…</div> : (
        <div className={styles.list}>
          {usuariosFiltrados.length === 0 && (
            <div className={styles.empty}>Sin usuarios con los filtros actuales</div>
          )}
          {usuariosFiltrados.map(u => {
            const rolNombre  = u.roles?.nombre ?? '—'
            const isEditing  = editId === u.id
            return (
              <div key={u.id} className={`${styles.userCard} ${isEditing ? styles.userCardEditing : ''}`}>

                <div className={styles.userTop}>
                  <div className={styles.userTopLeft}>
                    <p className={styles.userName}>{u.nombre}</p>
                    <p className={styles.userEmail}>{u.email}</p>
                    {u.zonas?.nombre && (
                      <span className={styles.zonaTag}>
                        <Globe size={10} strokeWidth={2} /> {u.zonas.nombre}
                      </span>
                    )}
                  </div>
                  <div className={styles.userTopRight}>
                    <span className={styles.rolBadge}
                      style={{ background: ROL_DIM[rolNombre], color: ROL_COLOR[rolNombre] }}>
                      {rolNombre}
                    </span>
                    <button
                      className={`${styles.editBtn} ${isEditing ? styles.editBtnActive : ''}`}
                      onClick={() => isEditing ? setEditId(null) : openEdit(u)}>
                      {isEditing ? <X size={13} strokeWidth={2.5} /> : <Pencil size={13} strokeWidth={2} />}
                    </button>
                  </div>
                </div>

                {!isEditing && (
                  <>
                    {rolNombre === 'encargado' && u.sucursales?.nombre && (
                      <p className={styles.subInfo}><Store size={11} strokeWidth={2} /> {u.sucursales.nombre}</p>
                    )}
                    {rolNombre === 'supervisor' && u.rutas?.nombre && (
                      <p className={styles.subInfo}><Route size={11} strokeWidth={2} /> {u.rutas.nombre}</p>
                    )}
                  </>
                )}

                {isEditing && (
                  <form className={styles.editForm} onSubmit={handleEdit} noValidate>
                    <div className={styles.editSection}>
                      <p className={styles.editSectionTitle}>Perfil</p>
                      <div className={styles.field}>
                        <label className={styles.label}>Nombre completo</label>
                        <div className={styles.inputWrap}>
                          <User size={13} strokeWidth={2} color="var(--text-muted)" />
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
                        {editRolNombre !== 'superadmin' && (
                          <div className={styles.field}>
                            <label className={styles.label}>Zona</label>
                            <select className={styles.select} value={editForm.zona_id}
                              onChange={e => setEditForm(f => ({ ...f, zona_id: e.target.value, sucursal_id: '', ruta_id: '' }))}>
                              <option value="">Sin zona</option>
                              {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                            </select>
                          </div>
                        )}
                      </div>

                      {editRolNombre === 'encargado' && (
                        <div className={styles.field}>
                          <label className={styles.label}>Sucursal</label>
                          <select className={styles.select} value={editForm.sucursal_id}
                            onChange={e => setEditForm(f => ({ ...f, sucursal_id: e.target.value }))}>
                            <option value="">Sin asignar</option>
                            {sucsEnZonaEdit.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                          </select>
                        </div>
                      )}
                      {editRolNombre === 'supervisor' && (
                        <div className={styles.field}>
                          <label className={styles.label}>Ruta</label>
                          <select className={styles.select} value={editForm.ruta_id}
                            onChange={e => setEditForm(f => ({ ...f, ruta_id: e.target.value }))}>
                            <option value="">Sin asignar</option>
                            {rutasEnZonaEdit.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </select>
                        </div>
                      )}

                      <button className={styles.saveBtn} type="submit" disabled={editSaving}>
                        {editSaving ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>

                    <div className={styles.editSection}>
                      <p className={styles.editSectionTitle}>Contraseña</p>
                      <p className={styles.editHint}>
                        Se enviará un correo a <strong>{u.email}</strong> para restablecer la contraseña.
                      </p>
                      <button className={styles.resetBtn} type="button"
                        disabled={resetSending} onClick={() => handleResetPassword(u.email)}>
                        <KeyRound size={13} strokeWidth={2} />
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
