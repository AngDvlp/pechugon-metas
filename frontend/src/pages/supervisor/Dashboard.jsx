import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function SupervisorDashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [sucursales, setSucursales] = useState([])
  const [resumenes, setResumenes] = useState({})
  const [ventasHoy, setVentasHoy] = useState({})
  const [loading, setLoading] = useState(true)
  const hoy = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (usuario?.id) load()
  }, [usuario])

  async function load() {
    setLoading(true)
    const { data: supSuc } = await supabase
      .from('supervisor_sucursales')
      .select('sucursal_id, sucursales(id, nombre)')
      .eq('supervisor_id', usuario.id)

    const sids = supSuc?.map(s => s.sucursal_id) ?? []
    const sucs = supSuc?.map(s => s.sucursales) ?? []
    setSucursales(sucs)

    if (sids.length === 0) { setLoading(false); return }

    const [{ data: hoyData }, ...resResults] = await Promise.all([
      supabase.from('ventas_diarias').select('*').in('sucursal_id', sids).eq('fecha', hoy),
      ...sids.map(id => supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle())
    ])

    const hoyMap = {}
    hoyData?.forEach(v => { hoyMap[v.sucursal_id] = v })
    setVentasHoy(hoyMap)

    const resMap = {}
    sids.forEach((id, i) => { resMap[id] = resResults[i].data ?? null })
    setResumenes(resMap)
    setLoading(false)
  }

  const metaMensualTotal = Object.values(resumenes).reduce((a, r) => a + (r?.meta_mensual ?? 0), 0)
  const acumuladoTotal = Object.values(resumenes).reduce((a, r) => a + (r?.venta_acumulada ?? 0), 0)
  const ventaHoyTotal = Object.values(ventasHoy).reduce((a, v) => a + (v?.venta_total ?? 0), 0)
  const metaSemanalTotal = Object.values(resumenes).reduce((a, r) => a + (r?.meta_venta ?? 0), 0)
  const ventaSemanaTotal = Object.values(resumenes).reduce((a, r) => a + (r?.venta_semana_actual ?? 0), 0)
  const avanceMes = metaMensualTotal > 0 ? (acumuladoTotal / metaMensualTotal) * 100 : 0
  const avanceSem = metaSemanalTotal > 0 ? (ventaSemanaTotal / metaSemanalTotal) * 100 : 0
  const faltaMesTotal = Math.max(0, metaMensualTotal - acumuladoTotal)
  const faltaSemTotal = Math.max(0, metaSemanalTotal - ventaSemanaTotal)

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* Resumen supervisor */}
      <div className={styles.supervisorCard}>
        <div className={styles.supTop}>
          <div>
            <p className={styles.supLabel}>Meta mensual</p>
            <p className={styles.supMeta}>{fmt(metaMensualTotal)}</p>
          </div>
          <div className={styles.supPct}>
            <span className={styles.pctNum}>{avanceMes.toFixed(1)}</span>
            <span className={styles.pctSym}>%</span>
          </div>
        </div>

        {/* Barra mensual */}
        <div className={styles.barRow}>
          <span className={styles.barLabel}>Mes</span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.min(avanceMes, 100)}%` }} />
          </div>
        </div>

        {/* Barra semanal */}
        <div className={styles.barRow}>
          <span className={styles.barLabel}>Semana</span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{
              width: `${Math.min(avanceSem, 100)}%`,
              background: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
            }} />
          </div>
          <span className={styles.barPct} style={{
            color: avanceSem >= 100 ? 'var(--success)' : avanceSem >= 70 ? 'var(--yellow)' : 'var(--red)'
          }}>{avanceSem.toFixed(0)}%</span>
        </div>

        <div className={styles.supBottom}>
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Acumulado mes</span>
            <span className={styles.supStatVal}>{fmt(acumuladoTotal)}</span>
          </div>
          <div className={styles.supDivider} />
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Esta semana</span>
            <span className={styles.supStatVal}>{fmt(ventaSemanaTotal)}</span>
          </div>
          <div className={styles.supDivider} />
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Hoy (todas)</span>
            <span className={styles.supStatVal}>{fmt(ventaHoyTotal)}</span>
          </div>
        </div>

        {/* Falta para la meta */}
        {(metaMensualTotal > 0 || metaSemanalTotal > 0) && (
          <div className={styles.faltaStrip}>
            <div className={styles.faltaStripItem}>
              <span className={styles.faltaStripLabel}>Falta mes</span>
              <span className={styles.faltaStripVal} style={{ color: faltaMesTotal <= 0 ? 'var(--success)' : 'var(--red)' }}>
                {faltaMesTotal <= 0 ? '¡Cumplida!' : fmt(faltaMesTotal)}
              </span>
            </div>
            <div className={styles.faltaStripDivider} />
            <div className={styles.faltaStripItem}>
              <span className={styles.faltaStripLabel}>Falta semana</span>
              <span className={styles.faltaStripVal} style={{ color: faltaSemTotal <= 0 ? 'var(--success)' : 'var(--yellow)' }}>
                {faltaSemTotal <= 0 ? '¡Cumplida!' : fmt(faltaSemTotal)}
              </span>
            </div>
          </div>
        )}
      </div>

      <p className={styles.secTitle}>Mis Sucursales</p>

      {sucursales.length === 0 && (
        <div className={styles.empty}>No tienes sucursales asignadas</div>
      )}

      <div className={styles.cards}>
        {sucursales.map(s => {
          const res = resumenes[s.id]
          const hv = ventasHoy[s.id]
          const avanceMesSuc = res?.avance_porcentaje ?? 0
          const avanceSemSuc = res?.avance_semanal ?? 0
          const faltaSemSuc = res ? Math.max(0, (res.meta_venta ?? 0) - (res.venta_semana_actual ?? 0)) : null
          const faltaMesSuc = res ? Math.max(0, (res.meta_mensual ?? res.meta_venta ?? 0) - (res.venta_acumulada ?? 0)) : null

          let barColor = 'var(--text-muted)'
          let statusLabel = 'Sin meta'
          if (res) {
            if (avanceMesSuc >= 100) { barColor = 'var(--success)'; statusLabel = '¡Meta cumplida!' }
            else if (avanceMesSuc >= 70) { barColor = 'var(--yellow)'; statusLabel = 'En camino' }
            else { barColor = 'var(--red)'; statusLabel = 'Por debajo' }
          }

          return (
            <div key={s.id} className={styles.sucCard} onClick={() => navigate(`/supervisor/sucursal/${s.id}`)}>
              <div className={styles.sucHeader}>
                <div>
                  <p className={styles.sucNombre}>{s.nombre}</p>
                  <p className={styles.sucStatus} style={{ color: barColor }}>{statusLabel}</p>
                </div>
                <div className={styles.sucPct}>
                  {!res ? (
                    <span className={styles.noMeta}>—</span>
                  ) : (
                    <>
                      <span className={styles.sucPctNum}>{avanceMesSuc.toFixed(0)}</span>
                      <span className={styles.sucPctSym}>%</span>
                    </>
                  )}
                </div>
              </div>

              {res && (
                <>
                  <div className={styles.sucBarRow}>
                    <span className={styles.sucBarLabel}>Mes</span>
                    <div className={styles.sucProgressTrack}>
                      <div className={styles.sucProgressFill} style={{ width: `${Math.min(avanceMesSuc, 100)}%`, background: barColor }} />
                    </div>
                  </div>
                  <div className={styles.sucBarRow}>
                    <span className={styles.sucBarLabel}>Sem</span>
                    <div className={styles.sucProgressTrack}>
                      <div className={styles.sucProgressFill} style={{
                        width: `${Math.min(avanceSemSuc, 100)}%`,
                        background: avanceSemSuc >= 100 ? 'var(--success)' : avanceSemSuc >= 70 ? 'var(--yellow)' : 'var(--red)'
                      }} />
                    </div>
                    <span className={styles.sucBarPct} style={{
                      color: avanceSemSuc >= 100 ? 'var(--success)' : avanceSemSuc >= 70 ? 'var(--yellow)' : 'var(--red)'
                    }}>{avanceSemSuc.toFixed(0)}%</span>
                  </div>
                </>
              )}

              <div className={styles.sucStats}>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Acumulado</span>
                  <span className={styles.sucStatVal}>{res ? fmt(res.venta_acumulada) : '—'}</span>
                </div>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Meta mes</span>
                  <span className={styles.sucStatVal}>{res ? fmt(res.meta_mensual ?? res.meta_venta) : '—'}</span>
                </div>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Hoy</span>
                  <span className={styles.sucStatVal} style={{ color: !hv ? 'var(--red)' : 'var(--success)' }}>
                    {!hv ? 'Sin registro' : fmt(hv.venta_total)}
                  </span>
                </div>
              </div>
              {res && (
                <div className={styles.sucFaltaLine}>
                  <span className={styles.sucFaltaLabel}>Falta esta semana</span>
                  <span className={styles.sucFaltaVal} style={{ color: faltaSemSuc <= 0 ? 'var(--success)' : 'var(--yellow)' }}>
                    {faltaSemSuc <= 0 ? '¡Meta cumplida!' : fmt(faltaSemSuc)}
                  </span>
                </div>
              )}

              <div className={styles.sucArrow}>›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
