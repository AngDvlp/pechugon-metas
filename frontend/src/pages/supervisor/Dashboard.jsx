import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Dashboard.module.css'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)

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
    // Traer sucursales del supervisor
    const { data: supSuc } = await supabase
      .from('supervisor_sucursales')
      .select('sucursal_id, sucursales(id, nombre)')
      .eq('supervisor_id', usuario.id)

    const sids = supSuc?.map(s => s.sucursal_id) ?? []
    const sucs = supSuc?.map(s => s.sucursales) ?? []
    setSucursales(sucs)

    if (sids.length === 0) { setLoading(false); return }

    // Ventas de hoy para cada sucursal
    const { data: hoyData } = await supabase
      .from('ventas_diarias')
      .select('*')
      .in('sucursal_id', sids)
      .eq('fecha', hoy)

    const hoyMap = {}
    hoyData?.forEach(v => { hoyMap[v.sucursal_id] = v })
    setVentasHoy(hoyMap)

    // Resumen meta por sucursal (RPC en paralelo)
    const resPromises = sids.map(id =>
      supabase.rpc('resumen_sucursal', { p_sucursal_id: id }).maybeSingle()
    )
    const resResults = await Promise.all(resPromises)
    const resMap = {}
    sids.forEach((id, i) => {
      resMap[id] = resResults[i].data ?? null
    })
    setResumenes(resMap)
    setLoading(false)
  }

  // Totales del supervisor
  const metaTotal = Object.values(resumenes).reduce((a, r) => a + (r?.meta_venta ?? 0), 0)
  const acumuladoTotal = Object.values(resumenes).reduce((a, r) => a + (r?.venta_acumulada ?? 0), 0)
  const ventaHoyTotal = Object.values(ventasHoy).reduce((a, v) => a + (v?.venta_total ?? 0), 0)
  const avanceTotal = metaTotal > 0 ? (acumuladoTotal / metaTotal) * 100 : 0

  if (loading) return <div className={styles.empty}>Cargando…</div>

  return (
    <div className={styles.page}>
      {/* Resumen supervisor */}
      <div className={styles.supervisorCard}>
        <div className={styles.supTop}>
          <div>
            <p className={styles.supLabel}>Tu meta total</p>
            <p className={styles.supMeta}>{fmt(metaTotal)}</p>
          </div>
          <div className={styles.supPct}>
            <span className={styles.pctNum}>{avanceTotal.toFixed(1)}</span>
            <span className={styles.pctSym}>%</span>
          </div>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${Math.min(avanceTotal, 100)}%` }} />
        </div>
        <div className={styles.supBottom}>
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Acumulado</span>
            <span className={styles.supStatVal}>{fmt(acumuladoTotal)}</span>
          </div>
          <div className={styles.supDivider} />
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Hoy (todas)</span>
            <span className={styles.supStatVal}>{fmt(ventaHoyTotal)}</span>
          </div>
          <div className={styles.supDivider} />
          <div className={styles.supStat}>
            <span className={styles.supStatLabel}>Sucursales</span>
            <span className={styles.supStatVal}>{sucursales.length}</span>
          </div>
        </div>
      </div>

      <p className={styles.secTitle}>Mis Sucursales</p>

      {sucursales.length === 0 && (
        <div className={styles.empty}>No tienes sucursales asignadas</div>
      )}

      <div className={styles.cards}>
        {sucursales.map(s => {
          const res = resumenes[s.id]
          const hv = ventasHoy[s.id]
          const avance = res?.avance_porcentaje ?? 0
          const sinMeta = !res
          const sinVenta = !hv

          let statusColor = 'var(--text-muted)'
          let statusLabel = 'Sin meta'
          if (res) {
            if (avance >= 100) { statusColor = 'var(--success)'; statusLabel = '¡Meta cumplida!' }
            else if (avance >= 70) { statusColor = 'var(--yellow)'; statusLabel = 'En camino' }
            else { statusColor = 'var(--red)'; statusLabel = 'Por debajo' }
          }

          return (
            <div
              key={s.id}
              className={styles.sucCard}
              onClick={() => navigate(`/supervisor/sucursal/${s.id}`)}
            >
              <div className={styles.sucHeader}>
                <div>
                  <p className={styles.sucNombre}>{s.nombre}</p>
                  <p className={styles.sucStatus} style={{ color: statusColor }}>{statusLabel}</p>
                </div>
                <div className={styles.sucPct}>
                  {sinMeta ? (
                    <span className={styles.noMeta}>—</span>
                  ) : (
                    <>
                      <span className={styles.sucPctNum}>{avance.toFixed(0)}</span>
                      <span className={styles.sucPctSym}>%</span>
                    </>
                  )}
                </div>
              </div>

              {res && (
                <div className={styles.sucProgressTrack}>
                  <div
                    className={styles.sucProgressFill}
                    style={{
                      width: `${Math.min(avance, 100)}%`,
                      background: avance >= 100 ? 'var(--success)' : avance >= 70 ? 'var(--yellow)' : 'var(--red)'
                    }}
                  />
                </div>
              )}

              <div className={styles.sucStats}>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Acumulado</span>
                  <span className={styles.sucStatVal}>{res ? fmt(res.venta_acumulada) : '—'}</span>
                </div>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Meta</span>
                  <span className={styles.sucStatVal}>{res ? fmt(res.meta_venta) : '—'}</span>
                </div>
                <div className={styles.sucStat}>
                  <span className={styles.sucStatLabel}>Hoy</span>
                  <span className={styles.sucStatVal} style={{ color: sinVenta ? 'var(--red)' : 'var(--success)' }}>
                    {sinVenta ? 'Sin registro' : fmt(hv.venta_total)}
                  </span>
                </div>
              </div>

              <div className={styles.sucArrow}>›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
