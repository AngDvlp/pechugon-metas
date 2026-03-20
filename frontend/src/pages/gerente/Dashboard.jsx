import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)

export default function GerenteDashboard() {
  const navigate = useNavigate()
  const [sucursales, setSucursales] = useState([])
  const [resumenes, setResumenes] = useState({})
  const [supervisores, setSupervisores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: sucs }, { data: sups }] = await Promise.all([
      supabase.from('sucursales').select('*').eq('activa', true).order('nombre'),
      supabase.from('usuarios')
        .select('id, nombre, supervisor_sucursales(sucursal_id)')
        .eq('roles.nombre', 'supervisor')
        .select(`id, nombre, supervisor_sucursales(sucursal_id), roles!inner(nombre)`)
        .eq('roles.nombre', 'supervisor'),
    ])
    setSucursales(sucs ?? [])
    setSupervisores(sups ?? [])

    if (!sucs?.length) { setLoading(false); return }

    const resPromises = sucs.map(s =>
      supabase.rpc('resumen_sucursal', { p_sucursal_id: s.id }).maybeSingle()
    )
    const results = await Promise.all(resPromises)
    const map = {}
    sucs.forEach((s, i) => { map[s.id] = results[i].data ?? null })
    setResumenes(map)
    setLoading(false)
  }

  const totalMeta = Object.values(resumenes).reduce((a, r) => a + (r?.meta_venta ?? 0), 0)
  const totalAcumulado = Object.values(resumenes).reduce((a, r) => a + (r?.venta_acumulada ?? 0), 0)
  const avanceGlobal = totalMeta > 0 ? (totalAcumulado / totalMeta) * 100 : 0
  const conMeta = Object.values(resumenes).filter(r => r !== null).length
  const sinMeta = sucursales.length - conMeta
  const encaminadas = Object.values(resumenes).filter(r => r && r.avance_porcentaje >= 70).length

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* KPIs globales */}
      <div className={styles.globalCard}>
        <div className={styles.globalTop}>
          <div>
            <p className={styles.globalLabel}>Meta global activa</p>
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
        <div className={styles.kpiRow}>
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{fmt(totalAcumulado)}</span>
            <span className={styles.kpiLabel}>Acumulado</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal}>{sucursales.length}</span>
            <span className={styles.kpiLabel}>Sucursales</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal} style={{ color: 'var(--success)' }}>{encaminadas}</span>
            <span className={styles.kpiLabel}>Encaminadas</span>
          </div>
          <div className={styles.kpiDivider} />
          <div className={styles.kpi}>
            <span className={styles.kpiVal} style={{ color: sinMeta > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{sinMeta}</span>
            <span className={styles.kpiLabel}>Sin meta</span>
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className={styles.acciones}>
        <button className={styles.accionBtn} onClick={() => navigate('/gerente/metas')}>
          <span className={styles.accionIcon}>◎</span>
          <span>Gestionar Metas</span>
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

      <p className={styles.secTitle}>Todas las sucursales</p>

      {/* Lista de sucursales */}
      <div className={styles.sucList}>
        {sucursales.map(s => {
          const r = resumenes[s.id]
          const avance = r?.avance_porcentaje ?? 0
          let barColor = 'var(--text-muted)'
          let statusTag = 'Sin meta'
          let tagClass = styles.tagNeutral
          if (r) {
            if (avance >= 100) { barColor = 'var(--success)'; statusTag = '✓ Cumplida'; tagClass = styles.tagOk }
            else if (avance >= 70) { barColor = 'var(--yellow)'; statusTag = 'En camino'; tagClass = styles.tagWarn }
            else { barColor = 'var(--red)'; statusTag = 'En riesgo'; tagClass = styles.tagDanger }
          }

          return (
            <div key={s.id} className={styles.sucRow}>
              <div className={styles.sucInfo}>
                <div className={styles.sucNombreRow}>
                  <p className={styles.sucNombre}>{s.nombre}</p>
                  <span className={`${styles.tag} ${tagClass}`}>{statusTag}</span>
                </div>
                {r && (
                  <div className={styles.sucTrackWrap}>
                    <div className={styles.sucTrack}>
                      <div className={styles.sucFill} style={{ width: `${Math.min(avance, 100)}%`, background: barColor }} />
                    </div>
                    <span className={styles.sucPct} style={{ color: barColor }}>{avance.toFixed(0)}%</span>
                  </div>
                )}
                <div className={styles.sucNums}>
                  <span>{r ? fmt(r.venta_acumulada) : '—'}</span>
                  <span className={styles.de}>de</span>
                  <span>{r ? fmt(r.meta_venta) : '—'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
