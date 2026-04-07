import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { UserPlus, X, Trash2, CheckCircle, AlertCircle, Store, Mail, Lock, User } from 'lucide-react'
import styles from './Usuarios.module.css'

export default function GerenteUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol_id: '', sucursal_id: '' })
  const [supSucursales, setSupSucursales] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: usrs }, { data: sucs }, { data: rols }, { data: ss }] = await Promise.all([
      supabase.from('usuarios').select('*, roles(nombre), sucursales(nombre)').order('nombre'),
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('roles').select('*'),
      supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id, sucursales(nombre)'),
    ])
    setUsuarios(usrs ?? [])
    setSucursales(sucs ?? [])
    setRoles(rols ?? [])
    const map = {}
    ss?.forEach(r => {
      if (!map[r.supervisor_id]) map[r.supervisor_id] = []
      map[r.supervisor_id].push(r)
    })
    setSupSucursales(map)
    setLoading(false)
  }

  const rolSeleccionado = roles.find(r => r.id === parseInt(form.rol_id))

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    })
    if (authErr) { setMsg({ tipo: 'error', texto: 'Error: ' + authErr.message }); setSaving(false); return }
    const uid = authData.user?.id
    if (!uid) { setMsg({ tipo: 'error', texto: 'No se pudo obtener el ID' }); setSaving(false); return }
    const { error: dbErr } = await supabase.from('usuarios').insert({
      id: uid, nombre: form.nombre.trim(), email: form.email.trim(),
      rol_id: parseInt(form.rol_id),
      sucursal_id: rolSeleccionado?.nombre === 'encargado' ? form.sucursal_id || null : null,
    })
    if (dbErr) { setMsg({ tipo: 'error', texto: 'Error: ' + dbErr.message }); setSaving(false); return }
    setMsg({ tipo: 'ok', texto: `Usuario ${form.nombre} creado` })
    setShowForm(false)
    setForm({ nombre: '', email: '', password: '', rol_id: '', sucursal_id: '' })
    await load()
    setSaving(false)
  }

  async function handleAsignarSucursal(supervisorId, sucursalId) {
    if (!sucursalId) return
    const ya = supSucursales[supervisorId]?.find(s => s.sucursal_id === sucursalId)
    if (ya) return
    await supabase.from('supervisor_sucursales').insert({ supervisor_id: supervisorId, sucursal_id: sucursalId })
    await load()
  }

  async function handleQuitarSucursal(supervisorId, sucursalId) {
    await supabase.from('supervisor_sucursales').delete()
      .eq('supervisor_id', supervisorId).eq('sucursal_id', sucursalId)
    await load()
  }

  const ROL_COLOR = { gerente: 'var(--info)', supervisor: 'var(--yellow)', encargado: 'var(--success)' }
  const ROL_DIM = { gerente: 'var(--info-dim)', supervisor: 'var(--warning-dim)', encargado: 'var(--success-dim)' }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Usuarios</h1>
        <button className={styles.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancelar' : <><UserPlus size={14} strokeWidth={2.5} /> Nuevo</>}
        </button>
      </div>

      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`}>
          {msg.tipo === 'ok' ? <CheckCircle size={15} strokeWidth={2} /> : <AlertCircle size={15} strokeWidth={2} />}
          {msg.texto}
        </div>
      )}

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
            const esSupervisor = rolNombre === 'supervisor'
            const misSupSucs = supSucursales[u.id] ?? []
            return (
              <div key={u.id} className={styles.userCard}>
                <div className={styles.userTop}>
                  <div>
                    <p className={styles.userName}>{u.nombre}</p>
                    <p className={styles.userEmail}>{u.email}</p>
                  </div>
                  <span className={styles.rolBadge}
                    style={{ background: ROL_DIM[rolNombre], color: ROL_COLOR[rolNombre] }}>
                    {rolNombre}
                  </span>
                </div>
                {rolNombre === 'encargado' && u.sucursales && (
                  <p className={styles.sucAsignada}>
                    <Store size={12} strokeWidth={2} /> {u.sucursales.nombre}
                  </p>
                )}
                {esSupervisor && (
                  <div className={styles.supSection}>
                    <p className={styles.supLabel}>Sucursales asignadas ({misSupSucs.length}/5)</p>
                    <div className={styles.supTags}>
                      {misSupSucs.map(ss => (
                        <span key={ss.sucursal_id} className={styles.supTag}>
                          {ss.sucursales?.nombre}
                          <button className={styles.quitarBtn} onClick={() => handleQuitarSucursal(u.id, ss.sucursal_id)}>
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                    {misSupSucs.length < 5 && (
                      <select className={styles.selectSmall} defaultValue=""
                        onChange={e => { handleAsignarSucursal(u.id, e.target.value); e.target.value = '' }}>
                        <option value="">+ Asignar sucursal…</option>
                        {sucursales.filter(s => !misSupSucs.find(ss => ss.sucursal_id === s.id))
                          .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
