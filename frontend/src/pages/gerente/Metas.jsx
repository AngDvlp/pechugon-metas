import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Metas.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

function semanasEntreFechas(inicioStr, finStr) {
  if (!inicioStr || !finStr) return 0
  const inicio = new Date(inicioStr + 'T00:00:00')
  const fin = new Date(finStr + 'T00:00:00')
  const dias = Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, Math.round(dias / 7))
}

const PERIODOS_KEY = 'pechugon_periodos_v1'
const getPeriodosStorage = () => { try { return JSON.parse(localStorage.getItem(PERIODOS_KEY) ?? '[]') } catch { return [] } }
const setPeriodosStorage = arr => localStorage.setItem(PERIODOS_KEY, JSON.stringify(arr))

const FORM_VACIO = { sucursal_id: '', pollos_meta: '', ticket_promedio_meta: '', fecha_inicio: '', fecha_fin: '' }
const EDIT_VACIO = { pollos_meta: '', ticket_promedio_meta: '', fecha_inicio: '', fecha_fin: '' }
const IMPORT_VACIO = { rows: [], fecha_inicio: '', fecha_fin: '', saving: false, error: null }

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const fileRef = useRef(null)
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]

  // Core data
  const [sucursales, setSucursales] = useState([])
  const [metas, setMetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Panel activo: 'none' | 'new' | 'import'
  const [panel, setPanel] = useState('none')

  // Form nueva meta
  const [form, setForm] = useState(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const formSemanas = semanasEntreFechas(form.fecha_inicio, form.fecha_fin)
  const formMetaSem = form.pollos_meta && form.ticket_promedio_meta
    ? parseFloat(form.pollos_meta) * parseFloat(form.ticket_promedio_meta) : null
  const formMetaTotal = formMetaSem && formSemanas > 0 ? formMetaSem * formSemanas : null

  // Edición
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EDIT_VACIO)
  const [editSaving, setEditSaving] = useState(false)
  const editSemanas = semanasEntreFechas(editForm.fecha_inicio, editForm.fecha_fin)
  const editMetaSem = editForm.pollos_meta && editForm.ticket_promedio_meta
    ? parseFloat(editForm.pollos_meta) * parseFloat(editForm.ticket_promedio_meta) : null
  const editMetaTotal = editMetaSem && editSemanas > 0 ? editMetaSem * editSemanas : null

  // Importación
  const [importData, setImportData] = useState(IMPORT_VACIO)
  const importSemanas = semanasEntreFechas(importData.fecha_inicio, importData.fecha_fin)

  // Periodos guardados (localStorage)
  const [periodos, setPeriodos] = useState(getPeriodosStorage)
  const [showNuevoPeriodo, setShowNuevoPeriodo] = useState(false)
  const [periodoForm, setPeriodoForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' })

  // Filtros
  const [filtros, setFiltros] = useState({ estado: 'todas', mes: '' })

  // Meses únicos para el filtro
  const meses = useMemo(() => {
    const map = new Map()
    metas.forEach(m => {
      const key = m.fecha_inicio.slice(0, 7)
      if (!map.has(key)) map.set(key, format(parseISO(m.fecha_inicio), 'MMMM yyyy', { locale: es }))
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [metas])

  // Metas filtradas
  const metasFiltradas = useMemo(() => {
    return metas.filter(m => {
      const vigente = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
      const expirada = m.fecha_fin < hoyStr
      const futura = m.fecha_inicio > hoyStr
      if (filtros.estado === 'vigente' && !vigente) return false
      if (filtros.estado === 'expirada' && !expirada) return false
      if (filtros.estado === 'futura' && !futura) return false
      if (filtros.mes && m.fecha_inicio.slice(0, 7) !== filtros.mes) return false
      return true
    })
  }, [metas, filtros, hoyStr])

  const stats = useMemo(() => ({
    total: metas.length,
    vigentes: metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr).length,
    futuras: metas.filter(m => m.fecha_inicio > hoyStr).length,
    expiradas: metas.filter(m => m.fecha_fin < hoyStr).length,
  }), [metas, hoyStr])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sucs }, { data: metasData }] = await Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('metas').select('*, sucursales(nombre)').order('fecha_inicio', { ascending: false }),
    ])
    setSucursales(sucs ?? [])
    setMetas(metasData ?? [])
    setLoading(false)
  }

  // ── CREAR ──────────────────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id || !form.pollos_meta || !form.ticket_promedio_meta || !form.fecha_inicio || !form.fecha_fin) return
    if (form.fecha_fin < form.fecha_inicio) { setMsg({ tipo: 'error', texto: 'La fecha de fin debe ser posterior al inicio' }); return }
    setSaving(true); setMsg(null)
    const pollos = parseFloat(form.pollos_meta), ticket = parseFloat(form.ticket_promedio_meta)
    const { error } = await supabase.from('metas').insert({
      sucursal_id: form.sucursal_id, meta_venta: pollos * ticket,
      pollos_meta: pollos, ticket_promedio_meta: ticket,
      semanas_mes: formSemanas, fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin, creado_por: usuario.id,
    })
    if (error) { setMsg({ tipo: 'error', texto: 'Error: ' + error.message }) }
    else { setMsg({ tipo: 'ok', texto: 'Meta creada correctamente' }); setPanel('none'); setForm(FORM_VACIO); await load() }
    setSaving(false)
  }

  // ── EDITAR ─────────────────────────────────────────────────────────────────
  function startEdit(m) {
    setEditingId(m.id)
    setEditForm({ pollos_meta: m.pollos_meta ?? '', ticket_promedio_meta: m.ticket_promedio_meta ?? '', fecha_inicio: m.fecha_inicio, fecha_fin: m.fecha_fin })
  }

  async function handleUpdate(id) {
    if (!editForm.fecha_inicio || !editForm.fecha_fin || !editForm.pollos_meta || !editForm.ticket_promedio_meta) return
    if (editForm.fecha_fin < editForm.fecha_inicio) { setMsg({ tipo: 'error', texto: 'La fecha de fin debe ser posterior al inicio' }); return }
    setEditSaving(true)
    const pollos = parseFloat(editForm.pollos_meta), ticket = parseFloat(editForm.ticket_promedio_meta)
    const { error } = await supabase.from('metas').update({
      meta_venta: pollos * ticket, pollos_meta: pollos, ticket_promedio_meta: ticket,
      semanas_mes: editSemanas, fecha_inicio: editForm.fecha_inicio, fecha_fin: editForm.fecha_fin,
    }).eq('id', id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error al actualizar: ' + error.message }) }
    else { setMsg({ tipo: 'ok', texto: 'Meta actualizada correctamente' }); setEditingId(null); await load() }
    setEditSaving(false)
  }

  // ── ELIMINAR ───────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    if (editingId === id) setEditingId(null)
    await load()
  }

  // ── EXPORTAR ───────────────────────────────────────────────────────────────
  function handleExport() {
    const data = metasFiltradas.map(m => {
      const vigente = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
      const expirada = m.fecha_fin < hoyStr
      return {
        'Sucursal': m.sucursales?.nombre ?? '',
        'Fecha Inicio': m.fecha_inicio,
        'Fecha Fin': m.fecha_fin,
        'Semanas': m.semanas_mes ?? '',
        'Pollos Meta / Sem': m.pollos_meta ?? '',
        'Ticket Promedio Meta ($)': m.ticket_promedio_meta ?? '',
        'Meta Semanal ($)': m.meta_venta ?? '',
        'Meta Total Periodo ($)': (m.meta_venta ?? 0) * (m.semanas_mes ?? 1),
        'Estado': vigente ? 'Vigente' : expirada ? 'Expirada' : 'Futura',
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Metas')
    XLSX.writeFile(wb, `metas_pechugon_${format(hoy, 'yyyy-MM-dd')}.xlsx`)
  }

  function handleDescargarPlantilla() {
    const data = [
      { 'Nombre Sucursal': 'Sucursal Centro', 'Pollos Vendidos': 500, 'Ticket Promedio': 120 },
      { 'Nombre Sucursal': 'Sucursal Norte', 'Pollos Vendidos': 420, 'Ticket Promedio': 115 },
    ]
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_metas_pechugon.xlsx')
  }

  // ── IMPORTAR ───────────────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const rows = rawRows.map(r => {
        const get = (...keys) => { for (const k of keys) { const v = r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]; if (v !== undefined && v !== '') return v.toString().trim() } return '' }
        const nombre = get('Nombre Sucursal', 'nombre sucursal', 'Sucursal', 'sucursal')
        const pollos = parseFloat(get('Pollos Vendidos', 'pollos vendidos', 'Pollos', 'pollos')) || 0
        const ticket = parseFloat(get('Ticket Promedio', 'ticket promedio', 'Ticket', 'ticket')) || 0
        const suc = sucursales.find(s => s.nombre.toLowerCase().trim() === nombre.toLowerCase())
        return { nombre, pollos, ticket, sucursal_id: suc?.id ?? null, matched: !!suc }
      }).filter(r => r.nombre)
      setImportData({ ...IMPORT_VACIO, rows })
      setPanel('import')
    } catch (err) {
      setMsg({ tipo: 'error', texto: 'Error al leer el archivo: ' + err.message })
    }
  }

  async function handleImportConfirm() {
    const { rows, fecha_inicio, fecha_fin } = importData
    if (!fecha_inicio || !fecha_fin) { setImportData(d => ({ ...d, error: 'Define las fechas del periodo' })); return }
    if (fecha_fin < fecha_inicio) { setImportData(d => ({ ...d, error: 'La fecha de fin debe ser posterior al inicio' })); return }
    const validas = rows.filter(r => r.matched && r.pollos > 0 && r.ticket > 0)
    if (!validas.length) { setImportData(d => ({ ...d, error: 'No hay filas válidas para importar' })); return }
    setImportData(d => ({ ...d, saving: true, error: null }))
    const sems = semanasEntreFechas(fecha_inicio, fecha_fin)
    const { error } = await supabase.from('metas').insert(validas.map(r => ({
      sucursal_id: r.sucursal_id, meta_venta: r.pollos * r.ticket,
      pollos_meta: r.pollos, ticket_promedio_meta: r.ticket,
      semanas_mes: sems, fecha_inicio, fecha_fin, creado_por: usuario.id,
    })))
    if (error) { setImportData(d => ({ ...d, saving: false, error: 'Error: ' + error.message })) }
    else {
      setMsg({ tipo: 'ok', texto: `${validas.length} metas importadas correctamente` })
      setImportData(IMPORT_VACIO); setPanel('none'); await load()
    }
  }

  // ── PERIODOS GUARDADOS ─────────────────────────────────────────────────────
  function applyPeriodo(p, target) {
    const dates = { fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin }
    if (target === 'form') setForm(f => ({ ...f, ...dates }))
    else if (target === 'import') setImportData(d => ({ ...d, ...dates }))
    else if (target === 'edit') setEditForm(f => ({ ...f, ...dates }))
  }

  function handleGuardarPeriodo() {
    if (!periodoForm.nombre || !periodoForm.fecha_inicio || !periodoForm.fecha_fin) return
    const nuevo = { id: Date.now().toString(), ...periodoForm }
    const updated = [nuevo, ...periodos]
    setPeriodos(updated); setPeriodosStorage(updated)
    setPeriodoForm({ nombre: '', fecha_inicio: '', fecha_fin: '' }); setShowNuevoPeriodo(false)
  }

  function handleEliminarPeriodo(id) {
    const updated = periodos.filter(p => p.id !== id)
    setPeriodos(updated); setPeriodosStorage(updated)
  }

  // Chips de periodos reutilizables
  const periodoChips = (target) => periodos.length > 0 && (
    <div className={styles.periodosRow}>
      <span className={styles.periodosRowLabel}>Usar periodo:</span>
      <div className={styles.periodosChipScroll}>
        {periodos.map(p => (
          <button key={p.id} type="button" className={styles.periodoChipSmall}
            onClick={() => applyPeriodo(p, target)}
            title={`${p.fecha_inicio} — ${p.fecha_fin}`}>
            {p.nombre}
          </button>
        ))}
      </div>
    </div>
  )

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── HEADER ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Metas</h1>
          <p className={styles.pageSubtitle}>Objetivos por sucursal y periodo</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.ghostBtn} onClick={handleExport}>
            <IconDownload /> Exportar
          </button>
          <button className={styles.ghostBtn} onClick={() => fileRef.current?.click()}>
            <IconUpload /> Importar
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <button className={styles.addBtn} onClick={() => setPanel(p => p === 'new' ? 'none' : 'new')}>
            {panel === 'new' ? '✕ Cancelar' : '+ Nueva Meta'}
          </button>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={`${styles.statCard} ${styles.statSuccess}`}>
          <span className={styles.statNum}>{stats.vigentes}</span>
          <span className={styles.statLabel}>Vigentes</span>
        </div>
        <div className={`${styles.statCard} ${styles.statInfo}`}>
          <span className={styles.statNum}>{stats.futuras}</span>
          <span className={styles.statLabel}>Próximas</span>
        </div>
        <div className={`${styles.statCard} ${styles.statMuted}`}>
          <span className={styles.statNum}>{stats.expiradas}</span>
          <span className={styles.statLabel}>Expiradas</span>
        </div>
      </div>

      {/* ── PERIODOS GUARDADOS ── */}
      <div className={styles.periodosSection}>
        <div className={styles.periodosSectionTop}>
          <span className={styles.sectionLabel}>Periodos guardados</span>
          <button className={styles.linkBtn} onClick={() => setShowNuevoPeriodo(v => !v)}>
            {showNuevoPeriodo ? '✕ Cancelar' : '+ Guardar nuevo periodo'}
          </button>
        </div>

        {periodos.length === 0 && !showNuevoPeriodo && (
          <p className={styles.periodosHint}>Guarda fechas frecuentes para aplicarlas rápido al crear metas.</p>
        )}

        {periodos.length > 0 && (
          <div className={styles.periodosGrid}>
            {periodos.map(p => {
              const sems = semanasEntreFechas(p.fecha_inicio, p.fecha_fin)
              return (
                <div key={p.id} className={styles.periodoCard}>
                  <div className={styles.periodoCardInfo}>
                    <p className={styles.periodoNombre}>{p.nombre}</p>
                    <p className={styles.periodoDates}>{p.fecha_inicio} — {p.fecha_fin} · {sems} sem</p>
                  </div>
                  <button className={styles.periodoDelBtn} onClick={() => handleEliminarPeriodo(p.id)} title="Eliminar">✕</button>
                </div>
              )
            })}
          </div>
        )}

        {showNuevoPeriodo && (
          <div className={styles.nuevoPeriodoForm}>
            <div className={styles.threeCol}>
              <div className={styles.field}>
                <label className={styles.label}>Nombre</label>
                <input className={styles.inputFull} type="text" placeholder="ej. Abril 2026"
                  value={periodoForm.nombre} onChange={e => setPeriodoForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha inicio</label>
                <input className={styles.inputFull} type="date"
                  value={periodoForm.fecha_inicio} onChange={e => setPeriodoForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha fin</label>
                <input className={styles.inputFull} type="date"
                  min={periodoForm.fecha_inicio || undefined}
                  value={periodoForm.fecha_fin} onChange={e => setPeriodoForm(f => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
            </div>
            <button className={styles.savePeriodoBtn} onClick={handleGuardarPeriodo}>
              Guardar periodo
            </button>
          </div>
        )}
      </div>

      {/* ── MENSAJE ── */}
      {msg && (
        <div className={`${styles.msg} ${styles[msg.tipo]}`} onClick={() => setMsg(null)}>
          <span>{msg.texto}</span>
          <span className={styles.msgX}>✕</span>
        </div>
      )}

      {/* ── PANEL: NUEVA META ── */}
      {panel === 'new' && (
        <div className={styles.panelCard}>
          <p className={styles.panelTitle}>Nueva Meta</p>
          {periodoChips('form')}
          <form className={styles.form} onSubmit={handleSave} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))} required>
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Fecha inicio</label>
                <input className={styles.inputFull} type="date" value={form.fecha_inicio}
                  onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Fecha fin</label>
                <input className={styles.inputFull} type="date" value={form.fecha_fin}
                  min={form.fecha_inicio || undefined}
                  onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} required />
              </div>
            </div>
            {formSemanas > 0 && (
              <div className={styles.semanasTag}>
                {formSemanas} semana{formSemanas !== 1 ? 's' : ''} de periodo
              </div>
            )}
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Pollos meta / semana</label>
                <div className={styles.inputWrap}>
                  <span className={styles.prefix}>🐔</span>
                  <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.5" placeholder="0"
                    value={form.pollos_meta} onChange={e => setForm(f => ({ ...f, pollos_meta: e.target.value }))} required />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ticket promedio meta</label>
                <div className={styles.inputWrap}>
                  <span className={styles.prefix}>$</span>
                  <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                    value={form.ticket_promedio_meta} onChange={e => setForm(f => ({ ...f, ticket_promedio_meta: e.target.value }))} required />
                </div>
              </div>
            </div>
            {formMetaSem !== null && formSemanas > 0 && (
              <div className={styles.preview}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta semanal</span>
                  <span className={styles.previewVal}>{fmt(formMetaSem)}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Meta total del periodo ({formSemanas} sem)</span>
                  <span className={styles.previewValBig}>{fmt(formMetaTotal)}</span>
                </div>
              </div>
            )}
            <button className={styles.saveBtn} type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear Meta'}
            </button>
          </form>
        </div>
      )}

      {/* ── PANEL: IMPORTAR ── */}
      {panel === 'import' && (
        <div className={styles.panelCard}>
          <div className={styles.importHeader}>
            <p className={styles.panelTitle}>Importar desde Excel</p>
            <button className={styles.ghostBtn} onClick={handleDescargarPlantilla}>
              <IconDownload /> Plantilla
            </button>
          </div>
          <p className={styles.panelSub}>{importData.rows.length} filas detectadas · Define el periodo y confirma</p>

          {periodoChips('import')}

          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Fecha inicio del periodo</label>
              <input className={styles.inputFull} type="date" value={importData.fecha_inicio}
                onChange={e => setImportData(d => ({ ...d, fecha_inicio: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fecha fin del periodo</label>
              <input className={styles.inputFull} type="date" value={importData.fecha_fin}
                min={importData.fecha_inicio || undefined}
                onChange={e => setImportData(d => ({ ...d, fecha_fin: e.target.value }))} />
            </div>
          </div>

          {importSemanas > 0 && (
            <div className={styles.semanasTag}>{importSemanas} semanas de periodo</div>
          )}

          <div className={styles.importTable}>
            <div className={styles.importTHead}>
              <span>Sucursal en Excel</span>
              <span>Pollos / Sem</span>
              <span>Ticket Prom.</span>
              <span>Estado</span>
            </div>
            {importData.rows.map((r, i) => (
              <div key={i} className={`${styles.importTRow} ${!r.matched ? styles.importTRowError : ''}`}>
                <span className={styles.importTCell}>{r.nombre}</span>
                <span className={styles.importTCell}>{r.pollos > 0 ? fmtNum(r.pollos) : '—'}</span>
                <span className={styles.importTCell}>{r.ticket > 0 ? fmtDec(r.ticket) : '—'}</span>
                <span className={r.matched ? styles.matchOk : styles.matchErr}>
                  {r.matched ? '✓ Encontrada' : '✗ No encontrada'}
                </span>
              </div>
            ))}
          </div>

          {importData.error && <p className={styles.importError}>{importData.error}</p>}

          <div className={styles.rowActions}>
            <button className={styles.cancelBtn} onClick={() => { setPanel('none'); setImportData(IMPORT_VACIO) }}>
              Cancelar
            </button>
            <button className={styles.saveBtn} onClick={handleImportConfirm} disabled={importData.saving}>
              {importData.saving ? 'Importando…' : `Importar ${importData.rows.filter(r => r.matched && r.pollos > 0 && r.ticket > 0).length} metas`}
            </button>
          </div>
        </div>
      )}

      {/* ── FILTROS ── */}
      <div className={styles.filtersBar}>
        <div className={styles.chips}>
          {[
            { key: 'todas', label: 'Todas' },
            { key: 'vigente', label: 'Vigentes' },
            { key: 'futura', label: 'Próximas' },
            { key: 'expirada', label: 'Expiradas' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.chip} ${filtros.estado === key ? styles.chipActive : ''}`}
              onClick={() => setFiltros(f => ({ ...f, estado: key }))}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.filtersRight}>
          {meses.length > 0 && (
            <select className={styles.filterSelect} value={filtros.mes}
              onChange={e => setFiltros(f => ({ ...f, mes: e.target.value }))}>
              <option value="">Todos los periodos</option>
              {meses.map(([key, label]) => (
                <option key={key} value={key} style={{ textTransform: 'capitalize' }}>{label}</option>
              ))}
            </select>
          )}
          {(filtros.estado !== 'todas' || filtros.mes) && (
            <span className={styles.filterCount}>{metasFiltradas.length} resultado{metasFiltradas.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* ── LISTA DE METAS ── */}
      {loading ? (
        <div className={styles.loading}>Cargando…</div>
      ) : metasFiltradas.length === 0 ? (
        <div className={styles.empty}>
          <p>{filtros.estado !== 'todas' || filtros.mes ? 'Sin resultados para estos filtros' : 'No hay metas creadas todavía'}</p>
        </div>
      ) : (
        <div className={styles.metasList}>
          {metasFiltradas.map(m => {
            const vigente = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
            const expirada = m.fecha_fin < hoyStr
            const isEditing = editingId === m.id
            const metaTotal = (m.meta_venta ?? 0) * (m.semanas_mes ?? 1)

            return (
              <div key={m.id} className={`${styles.metaCard} ${vigente ? styles.vigente : ''} ${isEditing ? styles.editing : ''}`}>

                {isEditing ? (
                  /* ── MODO EDICIÓN ── */
                  <div className={styles.editMode}>
                    <p className={styles.editTitle}>Editando — <strong>{m.sucursales?.nombre}</strong></p>
                    {periodoChips('edit')}
                    <div className={styles.twoCol}>
                      <div className={styles.field}>
                        <label className={styles.label}>Fecha inicio</label>
                        <input className={styles.inputFull} type="date" value={editForm.fecha_inicio}
                          onChange={e => setEditForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Fecha fin</label>
                        <input className={styles.inputFull} type="date" value={editForm.fecha_fin}
                          min={editForm.fecha_inicio || undefined}
                          onChange={e => setEditForm(f => ({ ...f, fecha_fin: e.target.value }))} />
                      </div>
                    </div>
                    {editSemanas > 0 && (
                      <div className={styles.semanasTag}>{editSemanas} semanas</div>
                    )}
                    <div className={styles.twoCol}>
                      <div className={styles.field}>
                        <label className={styles.label}>Pollos / semana</label>
                        <div className={styles.inputWrap}>
                          <span className={styles.prefix}>🐔</span>
                          <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.5"
                            value={editForm.pollos_meta} onChange={e => setEditForm(f => ({ ...f, pollos_meta: e.target.value }))} />
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Ticket promedio</label>
                        <div className={styles.inputWrap}>
                          <span className={styles.prefix}>$</span>
                          <input className={styles.input} type="number" inputMode="decimal" min="0" step="0.01"
                            value={editForm.ticket_promedio_meta} onChange={e => setEditForm(f => ({ ...f, ticket_promedio_meta: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                    {editMetaSem !== null && editSemanas > 0 && (
                      <div className={styles.preview}>
                        <div className={styles.previewRow}>
                          <span className={styles.previewLabel}>Meta semanal</span>
                          <span className={styles.previewVal}>{fmt(editMetaSem)}</span>
                        </div>
                        <div className={styles.previewRow}>
                          <span className={styles.previewLabel}>Meta total ({editSemanas} sem)</span>
                          <span className={styles.previewValBig}>{fmt(editMetaTotal)}</span>
                        </div>
                      </div>
                    )}
                    <div className={styles.rowActions}>
                      <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>Cancelar</button>
                      <button className={styles.saveBtn} onClick={() => handleUpdate(m.id)} disabled={editSaving}>
                        {editSaving ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── MODO VISTA ── */
                  <>
                    <div className={styles.metaTop}>
                      <div className={styles.metaInfo}>
                        <p className={styles.metaSucursal}>{m.sucursales?.nombre}</p>
                        <div className={styles.metaMontos}>
                          <span className={styles.metaMontoSem}>{fmt(m.meta_venta)}<span className={styles.metaMontoLabel}>/sem</span></span>
                          <span className={styles.metaMontoSep}>·</span>
                          <span className={styles.metaMontoMes}>{fmt(metaTotal)}<span className={styles.metaMontoLabel}>/periodo</span></span>
                        </div>
                      </div>
                      <div className={styles.metaActions}>
                        <span className={`${styles.badge} ${vigente ? styles.badgeOk : expirada ? styles.badgeGray : styles.badgeFuture}`}>
                          {vigente ? 'Vigente' : expirada ? 'Expirada' : 'Futura'}
                        </span>
                        <button className={styles.editBtn} onClick={() => startEdit(m)} title="Editar">
                          <IconEdit />
                        </button>
                        <button className={styles.delBtn} onClick={() => handleDelete(m.id)} title="Eliminar">✕</button>
                      </div>
                    </div>
                    <div className={styles.metaKpis}>
                      {m.pollos_meta && <span className={styles.metaKpi}>🐔 {fmtNum(m.pollos_meta)} pollos/sem</span>}
                      {m.ticket_promedio_meta && <span className={styles.metaKpi}>TP {fmtDec(m.ticket_promedio_meta)}</span>}
                      <span className={styles.metaKpi}>{m.semanas_mes ?? 1} semanas</span>
                    </div>
                    <p className={styles.metaDates}>
                      {format(parseISO(m.fecha_inicio), 'd MMM yyyy', { locale: es })} — {format(parseISO(m.fecha_fin), 'd MMM yyyy', { locale: es })}
                    </p>
                  </>
                )}

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ICONOS SVG inline ──────────────────────────────────────────────────────
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
function IconUpload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}
function IconEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
