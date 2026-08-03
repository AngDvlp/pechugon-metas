import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, startOfMonth } from 'date-fns'
import {
  ChevronLeft, Globe, Store, Users, Target,
  TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Clock, ChevronRight
} from 'lucide-react'
import styles from './ZonaDetalle.module.css'
import PageSkeleton from '../../components/PageSkeleton'

const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v ?? 0)
const fmtNum = v => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v ?? 0)

export default function SuperAdminZonaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [zona,       setZona]       = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [resumenes,  setResumenes]  = useState({})
  const [ventasHoy,  setVentasHoy]  = useState({})
  const [usuarios,   setUsuarios]   = useState([])
  const [loading,    setLoading]    = useState(true)

  const hoy = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [
        { data: zonaData },
        { data: sucsData },
        { data: hoyData },
        { data: usrsData },
      ] = await Promise.all([
        supabase.from('zonas').select('*').eq('id', id).single(),
        supabase.from('sucursales').select('*').eq('zona_id', id).eq('activa', true).order('nombre'),
        supabase.from('ventas_diarias').select('sucursal_id, venta_total').eq('fecha', hoy),
        supabase.from('usuarios')
          .select('id, nombre, email, roles(nombre), sucursales(nombre), rutas(nombre)')
          .eq('zona_id', id).order('nombre'),
      ])

      setZona(zonaData)
      setSucursales(sucsData ?? [])
      setUsuarios(usrsData ?? [])

      const hoyMap = {}
      hoyData?.forEach(v => { hoyMap[v.sucursal_id] = v.venta_total })
      setVentasHoy(hoyMap)

      if (sucsData?.length) {
        const results = await Promise.all(
          sucsData.map(s => supabase.rpc('resumen_sucursal', { p_sucursal_id: s.id }).maybeSingle())
        )
        const rmap = {}
        sucsData.forEach((s, i) => { rmap[s.id] = results[i].data ?? null })
        setResumenes(rmap)
      }
    } catch (e) {
      console.error('ZonaDetalle error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <PageSkeleton rows={5} />
  if (!zona) return <div className={styles.empty}>Zona no encontrada</div>

  const desde = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const totalMeta      = sucursales.reduce((a, s) => a + (resumenes[s.id]?.meta_mensual ?? 0), 0)
  const totalAcumulado = sucursales.reduce((a, s) => a + (resumenes[s.id]?.venta_acumulada ?? 0), 0)
  const avanceGlobal   = totalMeta > 0 ? (totalAcumulado / totalMeta) * 100 : 0
  const sinRegistro    = sucursales.filter(s => !ventasHoy[s.id]).length
  const cumplidas      = sucursales.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje >= 100).length
  const enRiesgo       = sucursales.filter(s => resumenes[s.id] && resumenes[s.id].avance_porcentaje < 70).length

  const gerente = usuarios.find(u => u.roles?.nombre === 'gerente')

  return (
    <div className={styles.page}>

      {/* Back */}
      <button className={styles.back} onClick={() => navigate('/superadmin')}>
        <ChevronLeft size={16} strokeWidth={2} />
        Volver
      </button>

      {/* Zone header */}
      <div className={styles.zonaHero}>
        <div className={styles.zonaIconWrap}>
          <Globe size={20} strokeWidth={1.75} />
        </div>
        <div className={styles.zonaHeroInfo}>
          <p className={styles.zonaHeroNombre}>{zona.nombre}</p>
          {zona.descripcion && <p className={styles.zonaHeroDesc}>{zona.descripcion}</p>}
          {gerente && <p className={styles.zonaGerente}>Gerente: <strong>{gerente.nombre}</strong></p>}
        </div>
        <span className={`${styles.zonaBadge} ${zona.activa ? styles.zonaBadgeOk : styles.zonaBadgeOff}`}>
          {zona.activa ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* KPI chips */}
      <div className={styles.kpiRow}>
        <div className={`${styles.kpiChip} ${sinRegistro > 0 ? styles.kpiChipDanger : styles.kpiChipNeutral}`}>
          <AlertTriangle size={12} strokeWidth={2.5} />
          <div>
            <span className={styles.kpiVal}>{sinRegistro}</span>
            <span className={styles.kpiLabel}>Sin reg.</span>
          </div>
        </div>
        <div className={`${styles.kpiChip} ${enRiesgo > 0 ? styles.kpiChipWarn : styles.kpiChipNeutral}`}>
          <TrendingDown size={12} strokeWidth={2.5} />
          <div>
            <span className={styles.kpiVal}>{enRiesgo}</span>
            <span className={styles.kpiLabel}>En riesgo</span>
          </div>
        </div>
        <div className={`${styles.kpiChip} ${cumplidas > 0 ? styles.kpiChipOk : styles.kpiChipNeutral}`}>
          <CheckCircle size={12} strokeWidth={2.5} />
          <div>
            <span className={styles.kpiVal}>{cumplidas}</span>
            <span className={styles.kpiLabel}>Cumplidas</span>
          </div>
        </div>
        <div className={styles.kpiChip}>
          <Store size={12} strokeWidth={2.5} />
          <div>
            <span className={styles.kpiVal}>{sucursales.length}</span>
            <span className={styles.kpiLabel}>Sucs.</span>
          </div>
        </div>
      </div>

      {/* Global progress card */}
      {totalMeta > 0 && (
        <div className={styles.globalCard}>
          <div className={styles.globalTop}>
            <div>
              <p className={styles.globalLabel}>Meta mensual de la zona</p>
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
          <div className={styles.globalNums}>
            <div className={styles.gNum}>
              <span className={styles.gNumVal}>{fmt(totalAcumulado)}</span>
              <span className={styles.gNumLabel}>Acumulado</span>
            </div>
            <div className={styles.gNumDiv} />
            <div className={styles.gNum}>
              <span className={styles.gNumVal}>{fmt(totalMeta - totalAcumulado)}</span>
              <span className={styles.gNumLabel}>Falta</span>
            </div>
          </div>
        </div>
      )}

      {/* Sucursales */}
      <p className={styles.secTitle}>Sucursales ({sucursales.length})</p>
      <div className={styles.sucList}>
        {sucursales.length === 0 && (
          <div className={styles.empty}>Sin sucursales en esta zona</div>
        )}
        {sucursales.map(s => {
          const r = resumenes[s.id]
          const avance = r?.avance_porcentaje ?? 0
          let barColor = 'var(--text-muted)'
          let StatusIcon = Clock
          if (r) {
            if (avance >= 100)    { barColor = 'var(--success)'; StatusIcon = CheckCircle }
            else if (avance >= 70){ barColor = 'var(--yellow)';  StatusIcon = TrendingUp }
            else                   { barColor = 'var(--red)';     StatusIcon = AlertTriangle }
          }
          return (
            <div key={s.id} className={styles.sucRow}>
              <div className={styles.sucNombreRow}>
                <p className={styles.sucNombre}>{s.nombre}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!ventasHoy[s.id] && <span className={styles.sinRegBadge}>Sin reg.</span>}
                  <StatusIcon size={13} strokeWidth={2} color={barColor} />
                </div>
              </div>
              {r && (
                <>
                  <div className={styles.sucTrackWrap}>
                    <div className={styles.sucTrack}>
                      <div className={styles.sucFill} style={{ width: `${Math.min(avance, 100)}%`, background: barColor }} />
                    </div>
                    <span className={styles.sucPct} style={{ color: barColor }}>{avance.toFixed(0)}%</span>
                  </div>
                  <div className={styles.sucNums}>
                    <span>{fmt(r.venta_acumulada)}</span>
                    <span className={styles.de}>de</span>
                    <span>{fmt(r.meta_mensual ?? r.meta_venta)}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Usuarios */}
      <p className={styles.secTitle}>Usuarios ({usuarios.length})</p>
      <div className={styles.userList}>
        {usuarios.length === 0 && (
          <div className={styles.empty}>Sin usuarios en esta zona</div>
        )}
        {usuarios.map(u => {
          const rol = u.roles?.nombre ?? '—'
          const ROL_COLOR = { gerente: 'var(--info)', supervisor: 'var(--yellow)', suplente: 'var(--yellow)', encargado: 'var(--success)', cocina: 'var(--red)' }
          const ROL_DIM   = { gerente: 'var(--info-dim)', supervisor: 'var(--warning-dim)', suplente: 'var(--warning-dim)', encargado: 'var(--success-dim)', cocina: 'rgba(232,25,44,0.12)' }
          return (
            <div key={u.id} className={styles.userRow}>
              <div className={styles.userInfo}>
                <p className={styles.userName}>{u.nombre}</p>
                <p className={styles.userEmail}>{u.email}</p>
              </div>
              <div className={styles.userRight}>
                {rol === 'encargado' && u.sucursales?.nombre && (
                  <span className={styles.userSub}>{u.sucursales.nombre}</span>
                )}
                {rol === 'supervisor' && u.rutas?.nombre && (
                  <span className={styles.userSub}>{u.rutas.nombre}</span>
                )}
                <span className={styles.rolBadge}
                  style={{ background: ROL_DIM[rol], color: ROL_COLOR[rol] }}>
                  {rol}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
