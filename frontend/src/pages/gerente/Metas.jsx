import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Metas.module.css'

const fmt    = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtDec = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)
const trunc  = (s, n) => s?.length > n ? s.slice(0, n) + '…' : (s ?? '')

function semanasEntreFechas(a, b) {
  if (!a || !b) return 0
  const dias = Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00')) / 86400000) + 1
  return Math.max(1, Math.round(dias / 7))
}
function periodPct(ini, fin, hoy) {
  if (!ini || !fin || hoy <= ini) return 0
  if (hoy >= fin) return 100
  const t = new Date(fin+'T00:00:00') - new Date(ini+'T00:00:00')
  const e = new Date(hoy+'T00:00:00') - new Date(ini+'T00:00:00')
  return Math.min(100, Math.round(e / t * 100))
}

const PKEY = 'pechugon_periodos_v1'
const getPS = () => { try { return JSON.parse(localStorage.getItem(PKEY) ?? '[]') } catch { return [] } }
const setPS = a => localStorage.setItem(PKEY, JSON.stringify(a))

const FV = { sucursal_id:'', pollos_meta:'', ticket_promedio_meta:'', fecha_inicio:'', fecha_fin:'' }
const EV = { pollos_meta:'', ticket_promedio_meta:'', fecha_inicio:'', fecha_fin:'' }
const IV = { rows:[], fecha_inicio:'', fecha_fin:'', saving:false, error:null }
const XF = { mes:'', sucursalesSelec:[], incluirVigentes:true, incluirFuturas:true, incluirExpiradas:true }

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.chartTooltip}>
      <p className={styles.chartTooltipLabel}>{label}</p>
      {payload.map(p => <p key={p.dataKey} className={styles.chartTooltipVal} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>)}
    </div>
  )
}

export default function GerenteMetas() {
  const { usuario } = useAuth()
  const fileRef = useRef(null)
  const hoy    = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]

  const [sucursales, setSucursales] = useState([])
  const [metas, setMetas]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [msg, setMsg]               = useState(null)
  const [panel, setPanel]           = useState('none')

  const [form, setForm]     = useState(FV)
  const [saving, setSaving] = useState(false)
  const fSem  = semanasEntreFechas(form.fecha_inicio, form.fecha_fin)
  const fMSem = form.pollos_meta && form.ticket_promedio_meta ? parseFloat(form.pollos_meta)*parseFloat(form.ticket_promedio_meta) : null
  const fMTot = fMSem && fSem > 0 ? fMSem * fSem : null

  const [editId, setEditId]       = useState(null)
  const [editF, setEditF]         = useState(EV)
  const [editSav, setEditSav]     = useState(false)
  const eSem  = semanasEntreFechas(editF.fecha_inicio, editF.fecha_fin)
  const eMSem = editF.pollos_meta && editF.ticket_promedio_meta ? parseFloat(editF.pollos_meta)*parseFloat(editF.ticket_promedio_meta) : null
  const eMTot = eMSem && eSem > 0 ? eMSem * eSem : null

  const [imp, setImp]           = useState(IV)
  const iSem = semanasEntreFechas(imp.fecha_inicio, imp.fecha_fin)

  const [showExp, setShowExp]   = useState(false)
  const [xf, setXf]             = useState(XF)

  const [periodos, setPeriodos]   = useState(getPS)
  const [showNP, setShowNP]       = useState(false)
  const [pForm, setPForm]         = useState({ nombre:'', fecha_inicio:'', fecha_fin:'' })

  const [filtros, setFiltros]         = useState({ estado:'todas', mes:'' })
  const [hideExp, setHideExp]         = useState(false)

  const meses = useMemo(() => {
    const map = new Map()
    metas.forEach(m => { const k = m.fecha_inicio.slice(0,7); if (!map.has(k)) map.set(k, format(parseISO(m.fecha_inicio), 'MMMM yyyy', { locale: es })) })
    return [...map.entries()].sort((a,b) => b[0].localeCompare(a[0]))
  }, [metas])

  const metasFiltradas = useMemo(() => metas.filter(m => {
    const v = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
    const e = m.fecha_fin < hoyStr
    const f = m.fecha_inicio > hoyStr
    if (hideExp && e) return false
    if (filtros.estado === 'vigente'  && !v) return false
    if (filtros.estado === 'expirada' && !e) return false
    if (filtros.estado === 'futura'   && !f) return false
    if (filtros.mes && m.fecha_inicio.slice(0,7) !== filtros.mes) return false
    return true
  }), [metas, filtros, hoyStr, hideExp])

  const stats = useMemo(() => ({
    total:    metas.length,
    vigentes: metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr).length,
    futuras:  metas.filter(m => m.fecha_inicio >  hoyStr).length,
    exp:      metas.filter(m => m.fecha_fin    <  hoyStr).length,
  }), [metas, hoyStr])

  const chartSem = useMemo(() =>
    metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr)
      .map(m => ({ n: trunc(m.sucursales?.nombre??'',11), v: m.meta_venta??0 }))
      .sort((a,b) => b.v-a.v), [metas,hoyStr])

  const chartTot = useMemo(() =>
    metas.filter(m => m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr)
      .map(m => ({ n: trunc(m.sucursales?.nombre??'',11), v: (m.meta_venta??0)*(m.semanas_mes??1) }))
      .sort((a,b) => b.v-a.v), [metas,hoyStr])

  const sucsEnMetas = useMemo(() => {
    const map = new Map()
    metas.forEach(m => { if (m.sucursales?.nombre) map.set(m.sucursal_id, m.sucursales.nombre) })
    return [...map.entries()].map(([id,nombre]) => ({id,nombre})).sort((a,b) => a.nombre.localeCompare(b.nombre))
  }, [metas])

  const metasAExportar = useMemo(() => metas.filter(m => {
    const v = m.fecha_inicio <= hoyStr && m.fecha_fin >= hoyStr
    const e = m.fecha_fin < hoyStr
    const f = m.fecha_inicio > hoyStr
    if (!xf.incluirVigentes  && v) return false
    if (!xf.incluirFuturas   && f) return false
    if (!xf.incluirExpiradas && e) return false
    if (xf.mes && m.fecha_inicio.slice(0,7) !== xf.mes) return false
    if (xf.sucursalesSelec.length > 0 && !xf.sucursalesSelec.includes(m.sucursal_id)) return false
    return true
  }), [metas, xf, hoyStr])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data:sucs }, { data:md }] = await Promise.all([
      supabase.from('sucursales').select('id,nombre').eq('activa',true).order('nombre'),
      supabase.from('metas').select('*,sucursales(nombre)').order('fecha_inicio',{ascending:false}),
    ])
    setSucursales(sucs??[]); setMetas(md??[]); setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.sucursal_id||!form.pollos_meta||!form.ticket_promedio_meta||!form.fecha_inicio||!form.fecha_fin) return
    if (form.fecha_fin < form.fecha_inicio) { setMsg({tipo:'error',texto:'La fecha fin debe ser posterior al inicio'}); return }
    setSaving(true); setMsg(null)
    const p=parseFloat(form.pollos_meta), t=parseFloat(form.ticket_promedio_meta)
    const {error} = await supabase.from('metas').insert({ sucursal_id:form.sucursal_id, meta_venta:p*t, pollos_meta:p, ticket_promedio_meta:t, semanas_mes:fSem, fecha_inicio:form.fecha_inicio, fecha_fin:form.fecha_fin, creado_por:usuario.id })
    if (error) setMsg({tipo:'error',texto:'Error: '+error.message})
    else { setMsg({tipo:'ok',texto:'Meta creada'}); setPanel('none'); setForm(FV); await load() }
    setSaving(false)
  }

  function startEdit(m) { setEditId(m.id); setEditF({ pollos_meta:m.pollos_meta??'', ticket_promedio_meta:m.ticket_promedio_meta??'', fecha_inicio:m.fecha_inicio, fecha_fin:m.fecha_fin }) }

  async function handleUpdate(id) {
    if (!editF.fecha_inicio||!editF.fecha_fin||!editF.pollos_meta||!editF.ticket_promedio_meta) return
    setEditSav(true)
    const p=parseFloat(editF.pollos_meta), t=parseFloat(editF.ticket_promedio_meta)
    const {error} = await supabase.from('metas').update({ meta_venta:p*t, pollos_meta:p, ticket_promedio_meta:t, semanas_mes:eSem, fecha_inicio:editF.fecha_inicio, fecha_fin:editF.fecha_fin }).eq('id',id)
    if (error) setMsg({tipo:'error',texto:'Error: '+error.message})
    else { setMsg({tipo:'ok',texto:'Meta actualizada'}); setEditId(null); await load() }
    setEditSav(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta meta?')) return
    await supabase.from('metas').delete().eq('id',id)
    if (editId===id) setEditId(null)
    await load()
  }

  function handleExportConfirm() {
    const data = metasAExportar.map(m => {
      const v=m.fecha_inicio<=hoyStr&&m.fecha_fin>=hoyStr, e=m.fecha_fin<hoyStr
      return { 'Sucursal':m.sucursales?.nombre??'', 'Fecha Inicio':m.fecha_inicio, 'Fecha Fin':m.fecha_fin, 'Semanas':m.semanas_mes??'', 'Pollos Meta/Sem':m.pollos_meta??'', 'Ticket Prom. Meta ($)':m.ticket_promedio_meta??'', 'Meta Semanal ($)':m.meta_venta??'', 'Meta Total ($)':(m.meta_venta??0)*(m.semanas_mes??1), 'Estado':v?'Vigente':e?'Expirada':'Futura' }
    })
    const ws=XLSX.utils.json_to_sheet(data), wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Metas')
    XLSX.writeFile(wb,`metas_pechugon_${format(hoy,'yyyy-MM-dd')}.xlsx`)
    setShowExp(false)
  }

  function handlePlantilla() {
    const data=[{ 'Nombre Sucursal':'Sucursal Centro','Pollos Vendidos':500,'Ticket Promedio':120 },{ 'Nombre Sucursal':'Sucursal Norte','Pollos Vendidos':420,'Ticket Promedio':115 }]
    const ws=XLSX.utils.json_to_sheet(data), wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Plantilla')
    XLSX.writeFile(wb,'plantilla_metas_pechugon.xlsx')
  }

  function toggleSuc(id) { setXf(f => ({ ...f, sucursalesSelec: f.sucursalesSelec.includes(id) ? f.sucursalesSelec.filter(s=>s!==id) : [...f.sucursalesSelec,id] })) }
  function toggleAllSuc() { setXf(f => ({ ...f, sucursalesSelec: f.sucursalesSelec.length===sucsEnMetas.length ? [] : sucsEnMetas.map(s=>s.id) })) }

  async function handleFile(e) {
    const file=e.target.files[0]; if (!file) return; e.target.value=''
    try {
      const ab=await file.arrayBuffer(), wb=XLSX.read(ab), ws=wb.Sheets[wb.SheetNames[0]]
      const raw=XLSX.utils.sheet_to_json(ws,{defval:''})
      const rows=raw.map(r => {
        const g=(...ks) => { for (const k of ks) { const v=r[k]??r[k.toLowerCase()]??r[k.toUpperCase()]; if (v!==undefined&&v!=='') return v.toString().trim() } return '' }
        const nombre=g('Nombre Sucursal','nombre sucursal','Sucursal','sucursal')
        const pollos=parseFloat(g('Pollos Vendidos','pollos vendidos','Pollos','pollos'))||0
        const ticket=parseFloat(g('Ticket Promedio','ticket promedio','Ticket','ticket'))||0
        const suc=sucursales.find(s=>s.nombre.toLowerCase().trim()===nombre.toLowerCase())
        return { nombre, pollos, ticket, sucursal_id:suc?.id??null, matched:!!suc }
      }).filter(r=>r.nombre)
      setImp({...IV, rows}); setPanel('import')
    } catch(err) { setMsg({tipo:'error',texto:'Error al leer el archivo: '+err.message}) }
  }

  async function handleImportConfirm() {
    const {rows,fecha_inicio,fecha_fin}=imp
    if (!fecha_inicio||!fecha_fin) { setImp(d=>({...d,error:'Define las fechas del periodo'})); return }
    if (fecha_fin<fecha_inicio)    { setImp(d=>({...d,error:'La fecha fin debe ser posterior al inicio'})); return }
    const ok=rows.filter(r=>r.matched&&r.pollos>0&&r.ticket>0)
    if (!ok.length) { setImp(d=>({...d,error:'No hay filas válidas'})); return }
    setImp(d=>({...d,saving:true,error:null}))
    const sems=semanasEntreFechas(fecha_inicio,fecha_fin)
    const {error}=await supabase.from('metas').insert(ok.map(r=>({ sucursal_id:r.sucursal_id, meta_venta:r.pollos*r.ticket, pollos_meta:r.pollos, ticket_promedio_meta:r.ticket, semanas_mes:sems, fecha_inicio, fecha_fin, creado_por:usuario.id })))
    if (error) setImp(d=>({...d,saving:false,error:'Error: '+error.message}))
    else { setMsg({tipo:'ok',texto:`${ok.length} metas importadas`}); setImp(IV); setPanel('none'); await load() }
  }

  function applyP(p,target) {
    const d={fecha_inicio:p.fecha_inicio,fecha_fin:p.fecha_fin}
    if (target==='form')   setForm(f=>({...f,...d}))
    if (target==='import') setImp(d2=>({...d2,...d}))
    if (target==='edit')   setEditF(f=>({...f,...d}))
  }
  function saveP() {
    if (!pForm.nombre||!pForm.fecha_inicio||!pForm.fecha_fin) return
    const u=[{id:Date.now().toString(),...pForm},...periodos]
    setPeriodos(u); setPS(u); setPForm({nombre:'',fecha_inicio:'',fecha_fin:''}); setShowNP(false)
  }
  function delP(id) { const u=periodos.filter(p=>p.id!==id); setPeriodos(u); setPS(u) }

  const pChips = target => periodos.length>0 && (
    <div className={styles.periodosRow}>
      <span className={styles.periodosRowLabel}>Usar:</span>
      <div className={styles.periodosChipScroll}>
        {periodos.map(p=><button key={p.id} type="button" className={styles.periodoChipSmall} onClick={()=>applyP(p,target)} title={`${p.fecha_inicio} — ${p.fecha_fin}`}>{p.nombre}</button>)}
      </div>
    </div>
  )

  return (
    <>
    <div className={styles.page}>

      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Metas</h1>
          <p className={styles.pageSubtitle}>Objetivos de venta por sucursal y periodo</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.ghostBtn} onClick={()=>{ setXf(XF); setShowExp(true) }}><IcDown/> Exportar</button>
          <button className={styles.ghostBtn} onClick={()=>fileRef.current?.click()}><IcUp/> Importar</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleFile}/>
          <button className={styles.addBtn} onClick={()=>setPanel(p=>p==='new'?'none':'new')}>{panel==='new'?'✕ Cancelar':'+ Nueva Meta'}</button>
        </div>
      </div>

      {/* STATS */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}><span className={styles.statNum}>{stats.total}</span><span className={styles.statLabel}>Total</span></div>
        <div className={`${styles.statCard} ${styles.statV}`}><span className={styles.statNum}>{stats.vigentes}</span><span className={styles.statLabel}>Vigentes</span></div>
        <div className={`${styles.statCard} ${styles.statF}`}><span className={styles.statNum}>{stats.futuras}</span><span className={styles.statLabel}>Próximas</span></div>
        <div className={`${styles.statCard} ${styles.statE}`}><span className={styles.statNum}>{stats.exp}</span><span className={styles.statLabel}>Expiradas</span></div>
      </div>

      {/* GRÁFICAS */}
      {chartSem.length > 0 && (
        <div className={styles.chartsSection}>
          <p className={styles.chartsSectionTitle}>Metas vigentes — comparativa por sucursal</p>
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Meta semanal</p>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartSem} margin={{top:4,right:4,bottom:0,left:4}}>
                    <XAxis dataKey="n" tick={{fill:'#8A94B0',fontSize:10,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                    <YAxis hide/>
                    <Tooltip content={<ChartTooltip/>} cursor={{fill:'rgba(255,255,255,0.04)'}}/>
                    <Bar dataKey="v" name="Meta semanal" radius={[5,5,0,0]}>
                      {chartSem.map((_,i)=><Cell key={i} fill={`rgba(245,196,0,${1-i*0.08})`}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>Meta total del periodo</p>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartTot} margin={{top:4,right:4,bottom:0,left:4}}>
                    <XAxis dataKey="n" tick={{fill:'#8A94B0',fontSize:10,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                    <YAxis hide/>
                    <Tooltip content={<ChartTooltip/>} cursor={{fill:'rgba(255,255,255,0.04)'}}/>
                    <Bar dataKey="v" name="Meta total" radius={[5,5,0,0]}>
                      {chartTot.map((_,i)=><Cell key={i} fill={`rgba(79,142,247,${1-i*0.08})`}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERIODOS GUARDADOS */}
      <div className={styles.periodosSection}>
        <div className={styles.periodosSectionTop}>
          <span className={styles.sectionLabel}>Periodos guardados</span>
          <button className={styles.linkBtn} onClick={()=>setShowNP(v=>!v)}>{showNP?'✕ Cancelar':'+ Guardar nuevo'}</button>
        </div>
        {periodos.length===0&&!showNP&&<p className={styles.periodosHint}>Guarda fechas frecuentes para aplicarlas rápido.</p>}
        {periodos.length>0&&(
          <div className={styles.periodosGrid}>
            {periodos.map(p=>(
              <div key={p.id} className={styles.periodoCard}>
                <div className={styles.periodoCardInfo}>
                  <p className={styles.periodoNombre}>{p.nombre}</p>
                  <p className={styles.periodoDates}>{p.fecha_inicio} — {p.fecha_fin} · {semanasEntreFechas(p.fecha_inicio,p.fecha_fin)} sem</p>
                </div>
                <button className={styles.periodoDelBtn} onClick={()=>delP(p.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {showNP&&(
          <div className={styles.nuevoPeriodoForm}>
            <div className={styles.threeCol}>
              <div className={styles.field}><label className={styles.label}>Nombre</label><input className={styles.inputFull} type="text" placeholder="ej. Abril 2026" value={pForm.nombre} onChange={e=>setPForm(f=>({...f,nombre:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.label}>Inicio</label><input className={styles.inputFull} type="date" value={pForm.fecha_inicio} onChange={e=>setPForm(f=>({...f,fecha_inicio:e.target.value}))}/></div>
              <div className={styles.field}><label className={styles.label}>Fin</label><input className={styles.inputFull} type="date" min={pForm.fecha_inicio||undefined} value={pForm.fecha_fin} onChange={e=>setPForm(f=>({...f,fecha_fin:e.target.value}))}/></div>
            </div>
            <button className={styles.savePeriodoBtn} onClick={saveP}>Guardar periodo</button>
          </div>
        )}
      </div>

      {/* MENSAJE */}
      {msg&&<div className={`${styles.msg} ${styles[msg.tipo]}`} onClick={()=>setMsg(null)}><span>{msg.texto}</span><span className={styles.msgX}>✕</span></div>}

      {/* PANEL NUEVA META */}
      {panel==='new'&&(
        <div className={styles.panelCard}>
          <p className={styles.panelTitle}>Nueva Meta</p>
          {pChips('form')}
          <form className={styles.form} onSubmit={handleSave} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Sucursal</label>
              <select className={styles.select} value={form.sucursal_id} onChange={e=>setForm(f=>({...f,sucursal_id:e.target.value}))} required>
                <option value="">Seleccionar sucursal…</option>
                {sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}><label className={styles.label}>Fecha inicio</label><input className={styles.inputFull} type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))} required/></div>
              <div className={styles.field}><label className={styles.label}>Fecha fin</label><input className={styles.inputFull} type="date" value={form.fecha_fin} min={form.fecha_inicio||undefined} onChange={e=>setForm(f=>({...f,fecha_fin:e.target.value}))} required/></div>
            </div>
            {fSem>0&&<div className={styles.semanasTag}>{fSem} semana{fSem!==1?'s':''} de periodo</div>}
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Pollos meta / semana</label>
                <div className={styles.inputWrap}><span className={styles.prefix}>🐔</span><input className={styles.input} type="number" inputMode="decimal" min="0" step="0.5" placeholder="0" value={form.pollos_meta} onChange={e=>setForm(f=>({...f,pollos_meta:e.target.value}))} required/></div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ticket promedio meta</label>
                <div className={styles.inputWrap}><span className={styles.prefix}>$</span><input className={styles.input} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.ticket_promedio_meta} onChange={e=>setForm(f=>({...f,ticket_promedio_meta:e.target.value}))} required/></div>
              </div>
            </div>
            {fMSem!==null&&fSem>0&&(
              <div className={styles.preview}>
                <div className={styles.previewRow}><span className={styles.previewLabel}>Meta semanal</span><span className={styles.previewVal}>{fmt(fMSem)}</span></div>
                <div className={styles.previewRow}><span className={styles.previewLabel}>Meta total del periodo ({fSem} sem)</span><span className={styles.previewValBig}>{fmt(fMTot)}</span></div>
              </div>
            )}
            <button className={styles.saveBtn} type="submit" disabled={saving}>{saving?'Guardando…':'Crear Meta'}</button>
          </form>
        </div>
      )}

      {/* PANEL IMPORTAR */}
      {panel==='import'&&(
        <div className={styles.panelCard}>
          <div className={styles.importHeader}>
            <p className={styles.panelTitle}>Importar desde Excel</p>
            <button className={styles.ghostBtn} onClick={handlePlantilla}><IcDown/> Plantilla</button>
          </div>
          <p className={styles.panelSub}>{imp.rows.length} filas detectadas · Define el periodo y confirma</p>
          {pChips('import')}
          <div className={styles.twoCol}>
            <div className={styles.field}><label className={styles.label}>Fecha inicio</label><input className={styles.inputFull} type="date" value={imp.fecha_inicio} onChange={e=>setImp(d=>({...d,fecha_inicio:e.target.value}))}/></div>
            <div className={styles.field}><label className={styles.label}>Fecha fin</label><input className={styles.inputFull} type="date" value={imp.fecha_fin} min={imp.fecha_inicio||undefined} onChange={e=>setImp(d=>({...d,fecha_fin:e.target.value}))}/></div>
          </div>
          {iSem>0&&<div className={styles.semanasTag}>{iSem} semanas de periodo</div>}
          <div className={styles.importTable}>
            <div className={styles.importTHead}><span>Sucursal</span><span>Pollos/Sem</span><span>Ticket</span><span>Match</span></div>
            {imp.rows.map((r,i)=>(
              <div key={i} className={`${styles.importTRow} ${!r.matched?styles.importTRowError:''}`}>
                <span className={styles.importTCell}>{r.nombre}</span>
                <span className={styles.importTCell}>{r.pollos>0?fmtNum(r.pollos):'—'}</span>
                <span className={styles.importTCell}>{r.ticket>0?fmtDec(r.ticket):'—'}</span>
                <span className={r.matched?styles.matchOk:styles.matchErr}>{r.matched?'✓ OK':'✗ No encontrada'}</span>
              </div>
            ))}
          </div>
          {imp.error&&<p className={styles.importError}>{imp.error}</p>}
          <div className={styles.rowActions}>
            <button className={styles.cancelBtn} onClick={()=>{setPanel('none');setImp(IV)}}>Cancelar</button>
            <button className={styles.saveBtn} onClick={handleImportConfirm} disabled={imp.saving}>{imp.saving?'Importando…':`Importar ${imp.rows.filter(r=>r.matched&&r.pollos>0&&r.ticket>0).length} metas`}</button>
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div className={styles.filtersBar}>
        <div className={styles.chips}>
          {[{k:'todas',l:'Todas'},{k:'vigente',l:'Vigentes'},{k:'futura',l:'Próximas'},{k:'expirada',l:'Expiradas'}].map(({k,l})=>(
            <button key={k} className={`${styles.chip} ${filtros.estado===k?styles.chipActive:''}`} onClick={()=>setFiltros(f=>({...f,estado:k}))}>{l}</button>
          ))}
        </div>
        <div className={styles.filtersRight}>
          {meses.length>0&&(
            <select className={styles.filterSelect} value={filtros.mes} onChange={e=>setFiltros(f=>({...f,mes:e.target.value}))}>
              <option value="">Todos los periodos</option>
              {meses.map(([k,l])=><option key={k} value={k} style={{textTransform:'capitalize'}}>{l}</option>)}
            </select>
          )}
          <button className={`${styles.toggleBtn} ${hideExp?styles.toggleBtnActive:''}`} onClick={()=>setHideExp(v=>!v)}>
            {hideExp?'Mostrar expiradas':'Ocultar expiradas'}
          </button>
          {(filtros.estado!=='todas'||filtros.mes||hideExp)&&<span className={styles.filterCount}>{metasFiltradas.length} resultado{metasFiltradas.length!==1?'s':''}</span>}
        </div>
      </div>

      {/* LISTA */}
      {loading?(
        <div className={styles.loading}>Cargando…</div>
      ):metasFiltradas.length===0?(
        <div className={styles.empty}><p>{filtros.estado!=='todas'||filtros.mes||hideExp?'Sin resultados para estos filtros':'No hay metas creadas todavía'}</p></div>
      ):(
        <div className={styles.metasList}>
          {metasFiltradas.map(m=>{
            const v=m.fecha_inicio<=hoyStr&&m.fecha_fin>=hoyStr
            const e=m.fecha_fin<hoyStr
            const isEd=editId===m.id
            const tot=(m.meta_venta??0)*(m.semanas_mes??1)
            const pct=v?periodPct(m.fecha_inicio,m.fecha_fin,hoyStr):0
            const cardCls=[styles.metaCard, isEd?styles.metaCardEditing:v?styles.metaCardVigente:e?styles.metaCardExpirada:styles.metaCardFutura].join(' ')
            return (
              <div key={m.id} className={cardCls}>
                {isEd?(
                  <div className={styles.editMode}>
                    <p className={styles.editTitle}>Editando — <strong>{m.sucursales?.nombre}</strong></p>
                    {pChips('edit')}
                    <div className={styles.twoCol}>
                      <div className={styles.field}><label className={styles.label}>Fecha inicio</label><input className={styles.inputFull} type="date" value={editF.fecha_inicio} onChange={e=>setEditF(f=>({...f,fecha_inicio:e.target.value}))}/></div>
                      <div className={styles.field}><label className={styles.label}>Fecha fin</label><input className={styles.inputFull} type="date" value={editF.fecha_fin} min={editF.fecha_inicio||undefined} onChange={e=>setEditF(f=>({...f,fecha_fin:e.target.value}))}/></div>
                    </div>
                    {eSem>0&&<div className={styles.semanasTag}>{eSem} semanas</div>}
                    <div className={styles.twoCol}>
                      <div className={styles.field}><label className={styles.label}>Pollos / semana</label><div className={styles.inputWrap}><span className={styles.prefix}>🐔</span><input className={styles.input} type="number" inputMode="decimal" min="0" step="0.5" value={editF.pollos_meta} onChange={e=>setEditF(f=>({...f,pollos_meta:e.target.value}))}/></div></div>
                      <div className={styles.field}><label className={styles.label}>Ticket promedio</label><div className={styles.inputWrap}><span className={styles.prefix}>$</span><input className={styles.input} type="number" inputMode="decimal" min="0" step="0.01" value={editF.ticket_promedio_meta} onChange={e=>setEditF(f=>({...f,ticket_promedio_meta:e.target.value}))}/></div></div>
                    </div>
                    {eMSem!==null&&eSem>0&&(
                      <div className={styles.preview}>
                        <div className={styles.previewRow}><span className={styles.previewLabel}>Meta semanal</span><span className={styles.previewVal}>{fmt(eMSem)}</span></div>
                        <div className={styles.previewRow}><span className={styles.previewLabel}>Meta total ({eSem} sem)</span><span className={styles.previewValBig}>{fmt(eMTot)}</span></div>
                      </div>
                    )}
                    <div className={styles.rowActions}>
                      <button className={styles.cancelBtn} onClick={()=>setEditId(null)}>Cancelar</button>
                      <button className={styles.saveBtn} onClick={()=>handleUpdate(m.id)} disabled={editSav}>{editSav?'Guardando…':'Guardar cambios'}</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div className={styles.metaTop}>
                      <div className={styles.metaInfo}>
                        <p className={styles.metaSucursal}>{m.sucursales?.nombre}</p>
                        <div className={styles.metaMontos}>
                          <span className={styles.metaMontoSem}>{fmt(m.meta_venta)}<span className={styles.metaMontoLabel}>/sem</span></span>
                          <span className={styles.metaMontoSep}>·</span>
                          <span className={styles.metaMontoMes}>{fmt(tot)}<span className={styles.metaMontoLabel}>/periodo</span></span>
                        </div>
                      </div>
                      <div className={styles.metaActions}>
                        <span className={`${styles.badge} ${v?styles.badgeOk:e?styles.badgeGray:styles.badgeFuture}`}>{v?'Vigente':e?'Expirada':'Futura'}</span>
                        <button className={styles.editBtn} onClick={()=>startEdit(m)} title="Editar"><IcEdit/></button>
                        <button className={styles.delBtn} onClick={()=>handleDelete(m.id)} title="Eliminar">✕</button>
                      </div>
                    </div>
                    <div className={styles.metaKpis}>
                      {m.pollos_meta&&<span className={styles.metaKpi}>🐔 {fmtNum(m.pollos_meta)} pollos/sem</span>}
                      {m.ticket_promedio_meta&&<span className={styles.metaKpi}>TP {fmtDec(m.ticket_promedio_meta)}</span>}
                      <span className={styles.metaKpi}>{m.semanas_mes??1} semanas</span>
                    </div>
                    <p className={styles.metaDates}>{format(parseISO(m.fecha_inicio),'d MMM yyyy',{locale:es})} — {format(parseISO(m.fecha_fin),'d MMM yyyy',{locale:es})}</p>
                    {v&&<div className={styles.periodBar}><div className={styles.periodBarFill} style={{width:`${pct}%`}}/></div>}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>

    {/* MODAL EXPORTAR */}
    {showExp&&(
      <div className={styles.modalOverlay} onClick={e=>e.target===e.currentTarget&&setShowExp(false)}>
        <div className={styles.modalCard}>
          <div className={styles.modalHeader}>
            <p className={styles.modalTitle}>Exportar Metas</p>
            <button className={styles.modalClose} onClick={()=>setShowExp(false)}>✕</button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.modalSection}>
              <p className={styles.modalSectionTitle}>Periodo</p>
              <select className={styles.filterSelect} style={{width:'100%'}} value={xf.mes} onChange={e=>setXf(f=>({...f,mes:e.target.value}))}>
                <option value="">Todos los periodos</option>
                {meses.map(([k,l])=><option key={k} value={k} style={{textTransform:'capitalize'}}>{l}</option>)}
              </select>
            </div>
            <div className={styles.modalSection}>
              <p className={styles.modalSectionTitle}>Estado</p>
              <div className={styles.checkList}>
                {[{k:'incluirVigentes',l:'Vigentes',c:'#00D395'},{k:'incluirFuturas',l:'Próximas',c:'#4F8EF7'},{k:'incluirExpiradas',l:'Expiradas',c:'#8A94B0'}].map(({k,l,c})=>(
                  <label key={k} className={styles.checkItem}>
                    <input type="checkbox" checked={xf[k]} onChange={e=>setXf(f=>({...f,[k]:e.target.checked}))}/>
                    <span style={{color:c}}>{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.modalSection}>
              <div className={styles.modalSectionHeader}>
                <p className={styles.modalSectionTitle}>Sucursales</p>
                <button className={styles.linkBtn} onClick={toggleAllSuc}>{xf.sucursalesSelec.length===sucsEnMetas.length?'Deseleccionar todas':'Seleccionar todas'}</button>
              </div>
              <div className={styles.checkList}>
                {sucsEnMetas.map(s=>(
                  <label key={s.id} className={styles.checkItem}>
                    <input type="checkbox" checked={xf.sucursalesSelec.length===0||xf.sucursalesSelec.includes(s.id)} onChange={()=>toggleSuc(s.id)}/>
                    <span>{s.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <div className={styles.exportPreview}><span className={styles.exportPreviewCount}>{metasAExportar.length}</span> metas a exportar</div>
            <div className={styles.rowActions} style={{marginTop:0}}>
              <button className={styles.cancelBtn} onClick={()=>setShowExp(false)}>Cancelar</button>
              <button className={styles.saveBtn} onClick={handleExportConfirm} disabled={metasAExportar.length===0}><IcDown/> Descargar Excel</button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function IcDown() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function IcUp()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function IcEdit() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
