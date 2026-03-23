import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function GerenteDashboard() {
  const navigate = useNavigate()
  const [sucursales, setSucursales] = useState([])
  const [resumenes, setResumenes] = useState({})
  const [supervisores, setSupervisores] = useState([])
  const [supSucMap, setSupSucMap] = useState({}) // supervisor_id -> [sucursal_id]
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroSup, setFiltroSup] = useState('todos') // 'todos' | supervisor_id

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sucs }, { data: sups }, { data: ss }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('activa', true).order('nombre'),
      supabase.from('usuarios').select('id, nombre, roles!inner(nombre)').eq('roles.nombre', 'supervisor'),
      supabase.from('supervisor_sucursales').select('supervisor_id, sucursal_id'),
    ])

    setSucursales(sucs ?? [])
    setSupervisores(sups ?? [])

    const map = {}
    ss?.forEach(r => {
      if (!map[r.supervisor_id]) map[r.supervisor_id] = []
      map[r.supervisor_id].push(r.sucursal_id)
    })
    setSupSucMap(map)

    if (!sucs?.length) { setLoading(false); return }

    const results = await Promise.all(
      sucs.map(s => supabase.rpc('resumen_sucursal', { p_sucursal_id: s.id }).maybeSingle())
    )
    const rmap = {}
    sucs.forEach((s, i) => { rmap[s.id] = results[i].data ?? null })
    setResumenes(rmap)
    setLoading(false)
  }

  // Sucursales filtradas por supervisor y búsqueda
  const sucursalesFiltradas = sucursales.filter(s => {
    const matchBusqueda = s.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchSup = filtroSup === 'todos' || (supSucMap[filtroSup] ?? []).includes(s.id)
    return matchBusqueda && matchSup
  })

  // KPIs sobre las sucursales filtradas
  const totalMeta = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_mensual ?? 0), 0)
  const totalAcumulado = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_acumulada ?? 0), 0)
  const totalPollos = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.pollos_totales ?? 0), 0)
  const avanceGlobal = totalMeta > 0 ? (totalAcumulado / totalMeta) * 100 : 0
  const sinMeta = sucursalesFiltradas.length - sucursalesFiltradas.filter(s => resumenes[s.id] !== null).length
  const encaminadas = sucursalesFiltradas.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje >= 70).length

  // Meta y avance semanal del grupo filtrado
  const metaSemanalGrupo = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.meta_venta ?? 0), 0)
  const ventaSemanaGrupo = sucursalesFiltradas.reduce((a, s) => a + (resumenes[s.id]?.venta_semana_actual ?? 0), 0)
  const avanceSemanalGrupo = metaSemanalGrupo > 0 ? (ventaSemanaGrupo / metaSemanalGrupo) * 100 : 0

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* KPIs globales */}
      <div className={styles.globalCard}>
        <div className={styles.globalTop}>
          <div>
            <p className={styles.globalLabel}>
              {filtroSup === 'todos' ? 'Meta mensual global' : `Meta — ${supervisores.find(s => s.id === filtroSup)?.nombre}`}
            </p>
            <p className={styles.globalMeta}>{fmt(totalMeta)}</p>
          </div>
          <div className={styles.globalPct}>
            <span className={styles.pctNum}>{avanceGlobal.toFixed(1)}</span>
            <span className={styles.pctSym}>%</span>
          </div>
        </div>
        <div className={styles.globalTrack}>
          <div className={styles.globalFill} style={{ width: `${Math.min(avanceGlobal, 100)}%` }} />
        </div>

        {/* Avance semanal */}
        <div className={styles.semRow}>
          <span className={styles.semLabel}>Semana actual</span>
          <div className={styles.semTrack}>
            <div className={styles.semFill} style={{
              width: `${Math.min(avanceSemanalGrupo, 100)}%`,
              background: avanceSemanalGrupo >= 100 ? 'var(--success)' : avanceSemanalGrupo >= 70 ? 'var(--yellow)' : 'var(--red)'
            }} />
          </div>
          <span className={styles.semPct} style={{
            color: avanceSemanalGrupo >= 100 ? 'var(--success)' : avanceSemanalGrupo >= 70 ? 'var(--yellow)' : 'var(--red)'
          }}>{avanceSemanalGrupo.toFixed(0)}%</span>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmt(totalAcumulado)}</span>
            <span className={styles.kpiLabel}>Acumulado</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmt(ventaSemanaGrupo)}</span>
            <span className={styles.kpiLabel}>Esta semana</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal} style={{ color: 'var(--success)' }}>{encaminadas}</span>
            <span className={styles.kpiLabel}>Encaminadas</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmtNum(totalPollos)}</span>
            <span className={styles.kpiLabel}>Pollos mes</span>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className={styles.acciones}>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/metas')}>
          <span className={styles.accionIcon}>◎</span>
          <span>Metas</span>
        </button>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/sucursales')}>
          <span className={styles.accionIcon}>⊟</span>
          <span>Sucursales</span>
        </button>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/usuarios')}>
          <span className={styles.accionIcon}>◉</span>
          <span>Usuarios</span>
        </button>
      </div>

      {/* Filtro supervisor */}
      <div className={styles.filtroRow}>
        <button
          className={`${styles.filtroBtn} ${filtroSup === 'todos' ? styles.filtroBtnActive : ''}`}
          onClick={() => setFiltroSup('todos')}
        >
          Todas
        </button>
        {supervisores.map(sup => (
          <button
            key={sup.id}
            className={`${styles.filtroBtn} ${filtroSup === sup.id ? styles.filtroBtnActive : ''}`}
            onClick={() => setFiltroSup(sup.id)}
          >
            {sup.nombre.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Buscar sucursal…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <button className={styles.clearBtn} onClick={() => setBusqueda('')}>✕</button>
        )}
      </div>

      <p className={styles.secTitle}>
        {sucursalesFiltradas.length} sucursal{sucursalesFiltradas.length !== 1 ? 'es' : ''}
        {filtroSup !== 'todos' ? ` — ${supervisores.find(s => s.id === filtroSup)?.nombre}` : ''}
      </p>

      {/* Lista sucursales */}
      <div className={styles.sucList}>
        {sucursalesFiltradas.length === 0 && (
          <div className={styles.noResults}>Sin resultados</div>
        )}
        {sucursalesFiltradas.map(s => {
          const r = resumenes[s.id]
          const avanceMes = r?.avance_porcentaje ?? 0
          const avanceSem = r?.avance_semanal ?? 0

          let barColor = 'var(--text-muted)'
          let statusTag = 'Sin meta'
          let tagClass = styles.tagNeutral
          if (r) {
            if (avanceMes >= 100) { barColor = 'var(--success)'; statusTag = '✓ Cumplida'; tagClass = styles.tagOk }
            else if (avanceMes >= 70) { barColor = 'var(--yellow)'; statusTag = 'En camino'; tagClass = styles.tagWarn }
            else { barColor = 'var(--red)'; statusTag = 'En riesgo'; tagClass = styles.tagDanger }
          }

          return (
            <div key={s.id} className={styles.sucRow} onClick={() => navigate(`/gerente/sucursal/${s.id}`)}>
              <div className={styles.sucInfo}>
                <div className={styles.sucNombreRow}>
                  <p className={styles.sucNombre}>{s.nombre}</p>
                  <div className={styles.sucNombreRight}>
                    <span className={`${styles.tag} ${tagClass}`}>{statusTag}</span>
                    <span className={styles.sucArrow}>›</span>
                  </div>
                </div>
                {r && (
                  <>
                    <div className={styles.sucTrackWrap}>
                      <span className={styles.sucTrackLabel}>Mes</span>
                      <div className={styles.sucTrack}>
                        <div className={styles.sucFill} style={{ width: `${Math.min(avanceMes, 100)}%`, background: barColor }} />
                      </div>
                      <span className={styles.sucPct} style={{ color: barColor }}>{avanceMes.toFixed(0)}%</span>
                    </div>
                    <div className={styles.sucTrackWrap}>
                      <span className={styles.sucTrackLabel}>Sem</span>
                      <div className={styles.sucTrack}>
                        <div className={styles.sucFill} style={{
                          width: `${Math.min(avanceSem, 100)}%`,
                          background: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
                        }} />
                      </div>
                      <span className={styles.sucPct} style={{
                        color: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
                      }}>{avanceSem.toFixed(0)}%</span>
                    </div>
                  </>
                )}
                <div className={styles.sucNums}>
                  <span>{r ? fmt(r.venta_acumulada) : '—'}</span>
                  <span className={styles.de}>de</span>
                  <span>{r ? fmt(r.meta_mensual ?? r.meta_venta) : '—'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
